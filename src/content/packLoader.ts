import type { ExamCode } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import {
  assertChunkShape,
  assertLemmaMapShape,
  assertManifestShape,
  sha256Hex,
  type LemmaMap,
  type PackChunk,
  type PackManifest,
  type PackWord,
} from './packVerifier';
import { getCachedChunk, invalidateStaleChunks, putCachedChunk } from './packCache';

/**
 * 数据包加载编排（PRD §4）：
 *   manifest（网络）→ 逐 chunk（缓存命中则跳过网络）→ sha256 → 形状断言 → 入库缓存
 * 离线兜底：manifest 拉取失败时，退回 IndexedDB 中该考试最近使用的版本。
 */

export interface LoadedPack {
  exam: ExamCode;
  version: string;
  manifest: PackManifest;
  words: PackWord[];
  lemmaMap: Record<string, string>;
  wordById: Map<string, PackWord>;
  /** 本次加载中来自缓存 / 网络的分块数，UI 可展示「已离线可用」 */
  stats: { fromCache: number; fromNetwork: number; offline: boolean };
}

export interface LoadPackOptions {
  exam: ExamCode;
  db: ExamFlowDB;
  /** 默认 `${BASE_URL}packs/${exam}/...` */
  fetchJson?: (url: string) => Promise<unknown>;
  fetchBytes?: (url: string) => Promise<Uint8Array>;
  onProgress?: (done: number, total: number) => void;
}

const LEMMA_MAP_CHUNK_N = -1;

function defaultBase(): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  return base.endsWith('/') ? base : `${base}/`;
}

/**
 * 数据包请求一律绕过 HTTP 缓存。
 *
 * 原因：chunk 文件名不带版本号（chunk-0.json），而生产静态服务对 .json 下发
 * `Cache-Control: public, max-age=3600`（server.js 的 serveFile）。版本升级后，
 * 浏览器里残留的上一代 manifest + chunk 会自相一致（sha256 也是上一代的），
 * 于是 sha256 校验通过、形状断言才炸出 `chunk.version=1.4.0 与 manifest 的 1.5.0 不一致`。
 * `cache: 'reload'` 强制回源，代价只是每次加载多一次网络；离线场景本就靠
 * IndexedDB 兜底（见 loadFromCache），不受影响。
 */
export async function fetchPackJson(url: string): Promise<unknown> {
  const res = await fetch(url, { cache: 'reload' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.json();
}

export async function fetchPackBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: 'reload' });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** 从缓存还原整个包（离线模式）：取该考试最近使用的版本 */
async function loadFromCache(db: ExamFlowDB, exam: ExamCode): Promise<LoadedPack> {
  const rows = await db.packChunks.where('exam').equals(exam).toArray();
  const chunks = rows.filter((r) => r.n >= 0);
  if (chunks.length === 0) {
    throw new Error(`离线且本地没有 ${exam} 数据包缓存，请联网后重试`);
  }
  const byVersion = new Map<string, typeof chunks>();
  for (const row of chunks) {
    const list = byVersion.get(row.version) ?? [];
    list.push(row);
    byVersion.set(row.version, list);
  }
  let best = chunks[0];
  if (!best) throw new Error('缓存读取异常');
  let bestAt = best.cachedAt;
  for (const row of chunks) {
    if (row.cachedAt >= bestAt) {
      best = row;
      bestAt = row.cachedAt;
    }
  }
  const version = best.version;
  const selected = (byVersion.get(version) ?? []).sort((a, b) => a.n - b.n);

  const words: PackWord[] = [];
  for (const row of selected) {
    const chunk = assertChunkShape(row.payload, { exam, version, chunk: row.n });
    words.push(...chunk.words);
  }
  const lemmaRow = rows.find((r) => r.n === LEMMA_MAP_CHUNK_N && r.version === version);
  const lemmaMap = lemmaRow ? assertLemmaMapShape(lemmaRow.payload).map : {};

  const manifest: PackManifest = {
    exam,
    version,
    minAppVersion: '0.0.0',
    generatedAt: '',
    wordCount: words.length,
    chunkSize: 0,
    chunks: [],
    lemmaMap: { file: '', sha256: '', bytes: 0, entries: Object.keys(lemmaMap).length },
    deprecatedWordIds: [],
    frequencyMethod: '',
    provenanceNote: '',
    sources: [],
    license: '',
  };
  return {
    exam,
    version,
    manifest,
    words,
    lemmaMap,
    wordById: new Map(words.map((w) => [w.id, w])),
    stats: { fromCache: selected.length, fromNetwork: 0, offline: true },
  };
}

export async function loadPack(options: LoadPackOptions): Promise<LoadedPack> {
  const { exam, db, onProgress } = options;
  const fetchJson = options.fetchJson ?? fetchPackJson;
  const fetchBytes = options.fetchBytes ?? fetchPackBytes;
  const base = defaultBase();

  let manifest: PackManifest;
  try {
    manifest = assertManifestShape(await fetchJson(`${base}packs/${exam}/manifest.json`));
  } catch (err) {
    // 网络不可用时退回缓存版本；缓存也没有则抛出原始网络错误
    try {
      return await loadFromCache(db, exam);
    } catch {
      throw err;
    }
  }

  const words: PackWord[] = [];
  let fromCache = 0;
  let fromNetwork = 0;
  const total = manifest.chunks.length + 1; // +1 = lemma-map
  let done = 0;

  for (const entry of manifest.chunks) {
    onProgress?.(done, total);
    const cached = await getCachedChunk(db, exam, manifest.version, entry.n);
    let chunk: PackChunk;
    if (cached) {
      chunk = assertChunkShape(cached.payload, { exam, version: manifest.version, chunk: entry.n });
      fromCache += 1;
    } else {
      const bytes = await fetchBytes(`${base}packs/${exam}/${entry.file}`);
      const hash = await sha256Hex(bytes);
      if (hash !== entry.sha256) {
        throw new Error(`数据包校验失败：${entry.file} sha256 不匹配（manifest=${entry.sha256}，实际=${hash}）`);
      }
      const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
      chunk = assertChunkShape(parsed, { exam, version: manifest.version, chunk: entry.n });
      await putCachedChunk(db, { exam, version: manifest.version, n: entry.n, payload: parsed });
      fromNetwork += 1;
    }
    words.push(...chunk.words);
    done += 1;
  }

  // lemma-map：缓存 sentinel n = -1
  onProgress?.(done, total);
  let lemmaMap: Record<string, string> = {};
  const lemmaCached = await getCachedChunk(db, exam, manifest.version, LEMMA_MAP_CHUNK_N);
  if (lemmaCached) {
    lemmaMap = assertLemmaMapShape(lemmaCached.payload).map;
    fromCache += 1;
  } else {
    const bytes = await fetchBytes(`${base}packs/${exam}/${manifest.lemmaMap.file}`);
    const hash = await sha256Hex(bytes);
    if (hash !== manifest.lemmaMap.sha256) {
      throw new Error(`数据包校验失败：lemma-map.json sha256 不匹配`);
    }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    lemmaMap = assertLemmaMapShape(parsed).map;
    await putCachedChunk(db, { exam, version: manifest.version, n: LEMMA_MAP_CHUNK_N, payload: parsed });
    fromNetwork += 1;
  }
  done += 1;
  onProgress?.(done, total);

  await invalidateStaleChunks(db, { exam, version: manifest.version });

  const deprecated = new Set(manifest.deprecatedWordIds);
  const usable = words.filter((w) => !deprecated.has(w.id));
  // manifest.wordCount 是发布口径；deprecated 词会让可用数略少，两者不强制相等
  if (usable.length === 0) throw new Error(`数据包 ${exam} 没有任何可用单词`);

  return {
    exam,
    version: manifest.version,
    manifest,
    words: usable,
    lemmaMap,
    wordById: new Map(usable.map((w) => [w.id, w])),
    stats: { fromCache, fromNetwork, offline: false },
  };
}

export type { LemmaMap, PackChunk, PackManifest, PackWord };
