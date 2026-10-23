import { sha256Hex } from './packVerifier';

/**
 * 全量查词词典（v1：ECDICT 45k 学习者向词条）。
 *
 * 数据包只收 2000 个精选词，卡上的同义候选、例句里点的词大多在包外——那时
 * `PackDictionary.lookup` 只能返回 null，UI 显示「词库未收录」。这一层补上兜底：
 * 按首字母分片、查哪个词只加载哪个片（最大片约 480KB），并缓存到 Cache Storage
 * 以便离线。分片自带不规则变形表（mice → mouse），规则的 -s/-ed/-ing 在运行时还原。
 *
 * 与 PackDictionary 的分工：PackDictionary 管「学习内容」，本层只管「释义能不能查到」。
 * 同一个词两边都有时，UI 优先用数据包（带义项权重与例句）。
 */

export interface DictSense {
  pos: string;
  cn: string;
}

export interface DictEntry {
  lemma: string;
  phonetic: string;
  senses: DictSense[];
  /** ECDICT 词频序号，越小越常用；0 = 未知 */
  rank: number;
  /** 实际命中的词形；变形查询时与 lemma 不同 */
  surface: string;
  inflected: boolean;
}

export interface DictShardInfo {
  id: string;
  file: string;
  entries: number;
  forms: number;
  bytes: number;
  sha256: string;
}

export interface DictManifest {
  version: string;
  fingerprint: string;
  generatedAt: string;
  count: number;
  formCount: number;
  source: { name: string; url: string; license: string; used: string };
  shards: DictShardInfo[];
}

interface ShardData {
  entries: DictEntry[];
  byLemma: Map<string, DictEntry>;
  forms: Record<string, string>;
}

export interface DictOptions {
  /** 默认 `${BASE_URL}dict/` */
  base?: string;
  fetchJson?: (url: string) => Promise<unknown>;
  /** 分片按原始文本取回：先校验 sha256 再解析，避免整包被中间层改写 */
  fetchText?: (url: string) => Promise<string>;
  cacheName?: string;
}

const CACHE_NAME = 'examflow-dict';

function defaultBase(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const rooted = base.endsWith('/') ? base : `${base}/`;
  return `${rooted}dict/`;
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

async function defaultFetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

function normalize(surface: string): string {
  return surface.trim().toLowerCase();
}

export function shardOf(word: string): string {
  const first = normalize(word).slice(0, 1);
  return first >= 'a' && first <= 'z' ? first : '_';
}

/** 释义按词性切行：`n. 债券；vt. 结合` → [{pos:'n.',cn:'债券'},{pos:'vt.',cn:'结合'}] */
export function splitSenses(cn: string): DictSense[] {
  const out: DictSense[] = [];
  for (const raw of cn.split('；')) {
    const piece = raw.trim();
    if (!piece) continue;
    const hit = /^([a-z]+\.)\s*(.*)$/i.exec(piece);
    if (hit) {
      out.push({ pos: hit[1]!, cn: hit[2]! });
    } else if (out.length > 0) {
      const last = out[out.length - 1]!;
      last.cn = `${last.cn}，${piece}`;
    } else {
      out.push({ pos: '', cn: piece });
    }
  }
  return out.length > 0 ? out : [{ pos: '', cn: cn.trim() }];
}

function parseEntry(row: unknown): DictEntry | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [lemma, phonetic, cn, rank] = row;
  if (typeof lemma !== 'string' || !lemma || typeof cn !== 'string' || !cn) return null;
  return {
    lemma,
    phonetic: typeof phonetic === 'string' ? phonetic : '',
    senses: splitSenses(cn),
    rank: typeof rank === 'number' ? rank : 0,
    surface: lemma,
    inflected: false,
  };
}

/** 规则变形候选（按可信度排序）；是否成立由「词典里确实有这个词」决定 */
export function inflectionCandidates(word: string): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    if (value.length >= 2 && value !== word && !out.includes(value)) out.push(value);
  };
  const w = normalize(word);
  if (w.length < 4) return out;

  if (w.endsWith('ies')) push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ves')) {
    push(`${w.slice(0, -3)}f`);
    push(`${w.slice(0, -3)}fe`);
  }
  if (w.endsWith('es')) push(w.slice(0, -2));
  if (w.endsWith('s')) push(w.slice(0, -1));

  if (w.endsWith('ied')) push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ed')) {
    push(w.slice(0, -2));
    push(w.slice(0, -1));
  }
  if (w.endsWith('ying')) push(`${w.slice(0, -4)}ie`);
  if (w.endsWith('ing')) {
    push(w.slice(0, -3));
    push(`${w.slice(0, -3)}e`);
  }

  if (w.endsWith('ier')) push(`${w.slice(0, -3)}y`);
  if (w.endsWith('iest')) push(`${w.slice(0, -4)}y`);
  if (w.endsWith('er')) {
    push(w.slice(0, -2));
    push(w.slice(0, -1));
  }
  if (w.endsWith('est')) {
    push(w.slice(0, -3));
    push(w.slice(0, -2));
  }

  if (w.endsWith('ily')) push(`${w.slice(0, -3)}y`);
  if (w.endsWith('ly')) push(w.slice(0, -2));

  const doubled = /([b-df-hj-np-tv-z])\1(ed|ing|er|est)$/.exec(w);
  if (doubled) push(w.slice(0, -(doubled[2]!.length + 1)));
  return out;
}

export class FullDictionary {
  private readonly base: string;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private readonly fetchText: (url: string) => Promise<string>;
  private readonly cacheName: string;
  private manifestPromise: Promise<DictManifest | null> | null = null;
  private readonly shards = new Map<string, Promise<ShardData | null>>();

  constructor(options: DictOptions = {}) {
    this.base = options.base ?? defaultBase();
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
    this.fetchText = options.fetchText ?? defaultFetchText;
    this.cacheName = options.cacheName ?? CACHE_NAME;
  }

  /** manifest 拉不到（离线且无缓存）时返回 null，调用方按「词典不可用」处理 */
  manifest(): Promise<DictManifest | null> {
    if (!this.manifestPromise) {
      this.manifestPromise = this.loadManifest().catch(() => null);
    }
    return this.manifestPromise;
  }

  async size(): Promise<number> {
    return (await this.manifest())?.count ?? 0;
  }

  async letters(): Promise<Array<{ id: string; entries: number }>> {
    const manifest = await this.manifest();
    return (manifest?.shards ?? []).map((s) => ({ id: s.id, entries: s.entries }));
  }

  async lookup(surface: string): Promise<DictEntry | null> {
    const key = normalize(surface);
    if (!key) return null;
    const exact = await this.findExact(key);
    if (exact) return exact;
    const lemma = await this.resolveLemma(key);
    if (!lemma) return null;
    const entry = await this.findExact(lemma);
    return entry ? { ...entry, surface: key, inflected: true } : null;
  }

  /** 前缀搜索只落在一个分片里，不需要全量索引 */
  async search(prefix: string, limit = 20): Promise<DictEntry[]> {
    const key = normalize(prefix);
    if (!key) return [];
    const shard = await this.shard(shardOf(key));
    if (!shard) return [];
    return shard.entries
      .filter((e) => e.lemma.startsWith(key))
      .sort((a, b) => (a.rank || Number.MAX_SAFE_INTEGER) - (b.rank || Number.MAX_SAFE_INTEGER) || a.lemma.localeCompare(b.lemma))
      .slice(0, limit);
  }

  async browse(letter: string, offset = 0, limit = 100): Promise<{ entries: DictEntry[]; total: number }> {
    const shard = await this.shard(shardOf(letter));
    if (!shard) return { entries: [], total: 0 };
    return { entries: shard.entries.slice(offset, offset + limit), total: shard.entries.length };
  }

  private async findExact(lemma: string): Promise<DictEntry | null> {
    const shard = await this.shard(shardOf(lemma));
    return shard?.byLemma.get(lemma) ?? null;
  }

  private async resolveLemma(surface: string): Promise<string | null> {
    const shard = await this.shard(shardOf(surface));
    if (!shard) return null;
    const irregular = shard.forms[surface];
    if (irregular) return irregular;
    for (const candidate of inflectionCandidates(surface)) {
      if (await this.findExact(candidate)) return candidate;
    }
    return null;
  }

  private shard(id: string): Promise<ShardData | null> {
    const cached = this.shards.get(id);
    if (cached) return cached;
    const task = this.loadShard(id).catch(() => null);
    this.shards.set(id, task);
    return task;
  }

  private async loadManifest(): Promise<DictManifest | null> {
    const url = `${this.base}manifest.json`;
    // manifest 走「网络优先、失败回落缓存」：词典重建后 fingerprint 会变，
    // 若先读缓存就永远发现不了新版本。
    try {
      const fresh = await this.fetchJson(url);
      void writeCache(this.cacheName, url, JSON.stringify(fresh));
      return fresh as DictManifest;
    } catch {
      const cached = await readCache(this.cacheName, url);
      return cached ? (JSON.parse(cached) as DictManifest) : null;
    }
  }

  private async loadShard(id: string): Promise<ShardData | null> {
    const manifest = await this.manifest();
    const info = manifest?.shards.find((s) => s.id === id);
    if (!manifest || !info) return null;

    // 缓存键带 fingerprint：词典内容变了但文件名没变，不带指纹会一直读到旧分片
    const url = `${this.base}${info.file}?v=${manifest.fingerprint}`;
    let text = await readCache(this.cacheName, url);
    if (!text) {
      text = await this.fetchText(url);
      if (typeof globalThis.crypto?.subtle !== 'undefined') {
        const digest = await sha256Hex(new TextEncoder().encode(text));
        if (digest !== info.sha256) throw new Error(`${info.file} sha256 不匹配`);
      }
      void writeCache(this.cacheName, url, text);
    }

    const payload = JSON.parse(text) as { e?: unknown[]; f?: Record<string, string> };
    const entries = (payload.e ?? []).map(parseEntry).filter((e): e is DictEntry => e !== null);
    const forms = payload.f ?? {};
    return { entries, byLemma: new Map(entries.map((e) => [e.lemma, e])), forms };
  }
}

async function readCache(name: string, url: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(name);
    const hit = await cache.match(url);
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

async function writeCache(name: string, url: string, text: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(name);
    await cache.put(url, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // 隐私模式或配额不足：忽略，下次仍走网络
  }
}

/** 应用内共享实例（分片缓存跨组件复用） */
export const fullDictionary = new FullDictionary();
