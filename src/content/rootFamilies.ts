/**
 * 织网数据：词根 → 同根词（构建期从 45k 词典生成，见 scripts/build_root_families.py）。
 *
 * 为什么按需加载：卡片只关心当前词的词根，没必要把 4 MB 词典全拉进来。
 * 单文件约 180 KB，首次进入卡片背面时拉一次，之后走内存 + Cache Storage。
 * 与全量词典（public/dict/*.json）同域同源，离线时命中缓存即可用。
 */

export interface RootFamilyWord {
  lemma: string;
  pos: string;
  cn: string;
  formula: string;
}

export interface RootFamily {
  root: string;
  cn: string;
  origin: string;
  words: RootFamilyWord[];
}

interface Payload {
  version?: string;
  roots?: Record<string, { cn?: string; origin?: string; words?: unknown[] }>;
}

const CACHE_NAME = 'examflow-roots';
const FILE = 'root-families.json';

function defaultBase(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const rooted = base.endsWith('/') ? base : `${base}/`;
  return `${rooted}dict/`;
}

function parseWord(row: unknown): RootFamilyWord | null {
  if (!Array.isArray(row) || row.length < 4) return null;
  const [lemma, pos, cn, , formula] = row;
  if (typeof lemma !== 'string' || !lemma) return null;
  return {
    lemma,
    pos: typeof pos === 'string' ? pos : '',
    cn: typeof cn === 'string' ? cn : '',
    formula: typeof formula === 'string' ? formula : '',
  };
}

export class RootFamilyIndex {
  private readonly base: string;
  private readonly fetchJson: (url: string) => Promise<unknown>;
  private task: Promise<Map<string, RootFamily>> | null = null;

  constructor(options: { base?: string; fetchJson?: (url: string) => Promise<unknown> } = {}) {
    this.base = options.base ?? defaultBase();
    this.fetchJson = options.fetchJson ?? defaultFetchJson;
  }

  /** 拉取失败（离线且无缓存）时返回空表，调用方按「暂无同根词」处理 */
  load(): Promise<Map<string, RootFamily>> {
    if (!this.task) this.task = this.fetchAll().catch(() => new Map());
    return this.task;
  }

  async family(root: string | null | undefined): Promise<RootFamily | null> {
    if (!root) return null;
    const all = await this.load();
    return all.get(root) ?? null;
  }

  /** 指定词根在家族中的位置（当前词可能不在索引里） */
  private async fetchAll(): Promise<Map<string, RootFamily>> {
    const url = `${this.base}${FILE}`;
    const raw = await this.fetchJson(url);
    const data = (raw ?? {}) as Payload;
    const out = new Map<string, RootFamily>();
    for (const [root, value] of Object.entries(data.roots ?? {})) {
      const words = (value.words ?? []).map(parseWord).filter((w): w is RootFamilyWord => w !== null);
      if (words.length === 0) continue;
      out.set(root, {
        root,
        cn: typeof value.cn === 'string' ? value.cn : '',
        origin: typeof value.origin === 'string' ? value.origin : '',
        words,
      });
    }
    return out;
  }
}

async function defaultFetchJson(url: string): Promise<unknown> {
  const cached = await readCache(url);
  if (cached) return JSON.parse(cached);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  const text = await res.text();
  void writeCache(url, text);
  return JSON.parse(text);
}

async function readCache(url: string): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    return hit ? await hit.text() : null;
  } catch {
    return null;
  }
}

async function writeCache(url: string, text: string): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(url, new Response(text, { headers: { 'Content-Type': 'application/json' } }));
  } catch {
    // 隐私模式或配额不足：忽略，下次仍走网络
  }
}

/** 应用内共享实例 */
export const rootFamilies = new RootFamilyIndex();
