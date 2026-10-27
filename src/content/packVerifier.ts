import type { ExamCode, ExampleSentence, SenseExamStat, Word } from '../domain/types';
import { bytesToHex, sha256Bytes } from './sha256';

/**
 * 数据包校验（PRD §4 / §9）：
 * 1. sha256 与 manifest 一致（防篡改、防缓存串版本）；
 * 2. 形状断言——缺字段、类型错误的数据包必须在加载期炸掉，而不是运行期 undefined；
 * 3. 合规断言——本项目无真题语料：所有例句 provenance 必须为 ADAPTED，
 *    义项统计 kind 必须为 ESTIMATED（禁止把估计值伪装成真实考频）。
 */

export class PackFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackFormatError';
  }
}

/** sha256 hex；优先 WebCrypto（安全上下文），非 HTTPS 部署（crypto.subtle 缺失）降级纯 JS 实现 */
export async function sha256Hex(input: ArrayBuffer | Uint8Array): Promise<string> {
  const src = input instanceof Uint8Array ? input : new Uint8Array(input);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return bytesToHex(sha256Bytes(src));
  // 拷贝进独立 ArrayBuffer：规避 TS 5.9 下 Uint8Array<ArrayBufferLike> 与 BufferSource 的类型不匹配
  const view = new Uint8Array(src.length);
  view.set(src);
  const digest = await subtle.digest('SHA-256', view);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface ManifestChunkEntry {
  n: number;
  file: string;
  wordCount: number;
  sha256: string;
  bytes: number;
}

export interface PackManifest {
  exam: ExamCode;
  version: string;
  minAppVersion: string;
  generatedAt: string;
  wordCount: number;
  chunkSize: number;
  chunks: ManifestChunkEntry[];
  lemmaMap: { file: string; sha256: string; bytes: number; entries: number };
  deprecatedWordIds: string[];
  frequencyMethod: string;
  provenanceNote: string;
  sources: unknown[];
  license: string;
}

const HEX64 = /^[0-9a-f]{64}$/;

export function assertManifestShape(raw: unknown): PackManifest {
  if (typeof raw !== 'object' || raw === null) throw new PackFormatError('manifest 不是对象');
  const m = raw as Partial<PackManifest>;
  if (typeof m.exam !== 'string') throw new PackFormatError('manifest 缺少 exam');
  if (typeof m.version !== 'string' || m.version.length === 0) throw new PackFormatError('manifest 缺少 version');
  if (!Array.isArray(m.chunks) || m.chunks.length === 0) throw new PackFormatError('manifest 缺少 chunks');
  if (typeof m.lemmaMap !== 'object' || m.lemmaMap === null) throw new PackFormatError('manifest 缺少 lemmaMap');
  for (const [i, c] of m.chunks.entries()) {
    if (typeof c?.n !== 'number' || typeof c.file !== 'string' || typeof c.wordCount !== 'number') {
      throw new PackFormatError(`manifest chunks[${i}] 字段缺失`);
    }
    if (!HEX64.test(c.sha256 ?? '')) throw new PackFormatError(`manifest chunks[${i}].sha256 不是 64 位十六进制`);
    if (typeof c.bytes !== 'number' || c.bytes <= 0) throw new PackFormatError(`manifest chunks[${i}].bytes 非法`);
  }
  if (!HEX64.test(m.lemmaMap.sha256 ?? '')) throw new PackFormatError('manifest lemmaMap.sha256 非法');
  return m as PackManifest;
}

/** 数据包内的单词（比领域 Word 多携带 forms 与 sentences） */
export interface PackWord extends Word {
  forms: string[];
  sentences: ExampleSentence[];
}

export interface PackChunk {
  exam: ExamCode;
  version: string;
  chunk: number;
  wordCount: number;
  words: PackWord[];
}

const TIERS: ReadonlySet<string> = new Set(['CORE', 'ADVANCED', 'EXTENDED']);

/** 同义候选五态（数据包 v1.6 起）。UI 与 ETL 共用这一份口径。 */
const SYNONYM_STATUSES: ReadonlySet<string> = new Set(['DIRECT', 'INFERRED', 'REWRITE', 'CONFLICT', 'UNKNOWN']);
const MAX_SYNONYM_GROUPS = 3;
const MAX_SYNONYM_CANDIDATES = 4;

/**
 * 义项级同义替换的交付约束（US-08）。
 *
 * 数据包必须能证明「这条同义关系属于这个义项」：分组要有 synset 与 gloss，
 * 候选不能是本词，需改写的必须有模板，搭配不符的必须有理由。
 * 这些约束拦的正是旧词级并集实现的问题——它给出的候选既说不清属于哪个义项，
 * 也没有任何可用性标注。
 */
function assertSynonymGroups(raw: unknown, where: string, lemma: string): void {
  if (!Array.isArray(raw)) throw new PackFormatError(`${where}.synonymGroups 不是数组`);
  if (raw.length > MAX_SYNONYM_GROUPS) {
    throw new PackFormatError(`${where}.synonymGroups 超过 ${MAX_SYNONYM_GROUPS} 组`);
  }
  for (const [gi, group] of raw.entries()) {
    const gw = `${where}.synonymGroups[${gi}]`;
    if (typeof group?.synset !== 'string' || group.synset.length === 0) {
      throw new PackFormatError(`${gw}.synset 缺失（同义关系必须能回溯到义项）`);
    }
    if (typeof group.gloss !== 'string' || group.gloss.length === 0) {
      throw new PackFormatError(`${gw}.gloss 缺失（义项分组必须带释义）`);
    }
    if (group.frame !== undefined && typeof group.frame !== 'string') {
      throw new PackFormatError(`${gw}.frame 必须是字符串`);
    }
    if (!Array.isArray(group.candidates) || group.candidates.length === 0) {
      throw new PackFormatError(`${gw}.candidates 不能为空`);
    }
    if (group.candidates.length > MAX_SYNONYM_CANDIDATES) {
      throw new PackFormatError(`${gw}.candidates 超过 ${MAX_SYNONYM_CANDIDATES} 个`);
    }
    const seen = new Set<string>();
    for (const [ci, cand] of group.candidates.entries()) {
      const cw = `${gw}.candidates[${ci}]`;
      if (typeof cand?.lemma !== 'string' || !/^[a-z]{3,14}$/.test(cand.lemma)) {
        throw new PackFormatError(`${cw}.lemma 非法（只接受 3~14 位小写单词）`);
      }
      if (seen.has(cand.lemma)) throw new PackFormatError(`${cw}.lemma 重复`);
      seen.add(cand.lemma);
      if (cand.lemma === lemma.toLowerCase()) {
        throw new PackFormatError(`${cw}.lemma 不能是本词`);
      }
      if (typeof cand.pos !== 'string' || cand.pos.length === 0) throw new PackFormatError(`${cw}.pos 缺失`);
      if (typeof cand.status !== 'string' || !SYNONYM_STATUSES.has(cand.status)) {
        throw new PackFormatError(`${cw}.status=${String(cand.status)} 不在五态之内`);
      }
      if (typeof cand.inPack !== 'boolean') throw new PackFormatError(`${cw}.inPack 必须是布尔值`);
      if (cand.cn !== undefined && (typeof cand.cn !== 'string' || /[、,，;；/]/.test(cand.cn))) {
        throw new PackFormatError(`${cw}.cn 必须是义项级释义（不得含多义分隔符）`);
      }
      // 五态的可用性承诺：说「不能换」必须给理由，说「要改写」必须给模板
      if (cand.status === 'CONFLICT' && (typeof cand.note !== 'string' || cand.note.length === 0)) {
        throw new PackFormatError(`${cw} 判为搭配不符但没有 note`);
      }
      if (cand.status === 'REWRITE' && (typeof cand.rewrite !== 'string' || cand.rewrite.length === 0)) {
        throw new PackFormatError(`${cw} 判为需改写但没有 rewrite 模板`);
      }
    }
  }
}

function assertExamStat(stat: unknown, where: string): SenseExamStat {
  if (typeof stat !== 'object' || stat === null) throw new PackFormatError(`${where}.examStats 缺失`);
  const s = stat as Partial<SenseExamStat>;
  if (typeof s.senseWeight !== 'number' || !Number.isFinite(s.senseWeight) || s.senseWeight < 0 || s.senseWeight > 100) {
    throw new PackFormatError(`${where}.senseWeight 必须是 0~100 的有限数`);
  }
  if (typeof s.tier !== 'string' || !TIERS.has(s.tier)) {
    throw new PackFormatError(`${where}.tier 必须是 CORE/ADVANCED/EXTENDED，得到 ${String(s.tier)}`);
  }
  // 合规红线：估计值必须如实标记，且必须说明来源
  if (s.kind !== 'ESTIMATED') throw new PackFormatError(`${where}.kind 必须为 ESTIMATED（无真实考试语料，禁止把估计值伪装成真实统计）`);
  if (!Array.isArray(s.sources) || s.sources.length === 0) throw new PackFormatError(`${where}.sources 不能为空`);
  if (typeof s.isEccentric !== 'boolean') throw new PackFormatError(`${where}.isEccentric 必须是布尔值`);
  return s as SenseExamStat;
}

export function assertChunkShape(raw: unknown, expected: { exam: string; version: string; chunk: number }): PackChunk {
  if (typeof raw !== 'object' || raw === null) throw new PackFormatError('chunk 不是对象');
  const c = raw as Partial<PackChunk>;
  if (c.exam !== expected.exam) throw new PackFormatError(`chunk.exam=${String(c.exam)} 与 manifest 的 ${expected.exam} 不一致`);
  if (c.version !== expected.version) throw new PackFormatError(`chunk.version=${String(c.version)} 与 manifest 的 ${expected.version} 不一致`);
  if (c.chunk !== expected.chunk) throw new PackFormatError(`chunk.chunk=${String(c.chunk)} 与请求的 ${expected.chunk} 不一致`);
  if (!Array.isArray(c.words)) throw new PackFormatError('chunk.words 不是数组');
  if (typeof c.wordCount !== 'number' || c.wordCount !== c.words.length) {
    throw new PackFormatError(`chunk.wordCount=${String(c.wordCount)} 与 words 实际长度 ${c.words.length} 不一致`);
  }

  for (const [wi, w] of c.words.entries()) {
    const where = `chunk ${expected.chunk} words[${wi}](${String(w?.lemma ?? '?')})`;
    if (typeof w?.id !== 'string' || !w.id.startsWith('w_')) throw new PackFormatError(`${where}.id 非法`);
    if (typeof w.lemma !== 'string' || w.lemma.length === 0) throw new PackFormatError(`${where}.lemma 非法`);
    if (!Array.isArray(w.senses) || w.senses.length === 0) throw new PackFormatError(`${where}.senses 为空`);
    if (!Array.isArray(w.forms)) throw new PackFormatError(`${where}.forms 缺失`);
    if (!Array.isArray(w.sentences)) throw new PackFormatError(`${where}.sentences 缺失`);

    const senseIds = new Set<string>();
    let withExamStat = 0;
    for (const [si, s] of w.senses.entries()) {
      const sw = `${where}.senses[${si}]`;
      if (typeof s?.id !== 'string' || s.id.length === 0) throw new PackFormatError(`${sw}.id 非法`);
      if (senseIds.has(s.id)) throw new PackFormatError(`${sw}.id 重复`);
      senseIds.add(s.id);
      if (typeof s.pos !== 'string' || typeof s.cn !== 'string') throw new PackFormatError(`${sw}.pos/cn 缺失`);
      if (s.synonymGroups !== undefined) assertSynonymGroups(s.synonymGroups, sw, w.lemma);
      const stats = s.examStats?.[expected.exam as ExamCode];
      if (stats) {
        withExamStat += 1;
        assertExamStat(stats, sw);
      }
    }
    if (withExamStat === 0) throw new PackFormatError(`${where} 没有任何义项带 ${expected.exam} 统计`);

    // 合规红线：例句必须关联到本词真实存在的义项，且必须标注为仿真
    for (const [xi, x] of w.sentences.entries()) {
      const xw = `${where}.sentences[${xi}]`;
      if (x?.wordId !== w.id) throw new PackFormatError(`${xw}.wordId 与所属单词不一致`);
      if (typeof x.senseId !== 'string' || !senseIds.has(x.senseId)) {
        throw new PackFormatError(`${xw}.senseId=${String(x.senseId)} 不属于该词的义项集合`);
      }
      if (typeof x.en !== 'string' || typeof x.zh !== 'string') throw new PackFormatError(`${xw}.en/zh 缺失`);
      if (x.provenance?.type !== 'ADAPTED') {
        throw new PackFormatError(`${xw}.provenance.type 必须为 ADAPTED（本项目不使用真实考试语料）`);
      }
    }
  }
  return c as PackChunk;
}

export interface LemmaMap {
  exam: string;
  version: string;
  entries: number;
  map: Record<string, string>;
}

export function assertLemmaMapShape(raw: unknown): LemmaMap {
  if (typeof raw !== 'object' || raw === null) throw new PackFormatError('lemma-map 不是对象');
  const l = raw as Partial<LemmaMap>;
  if (typeof l.map !== 'object' || l.map === null) throw new PackFormatError('lemma-map 缺少 map');
  for (const [k, v] of Object.entries(l.map)) {
    if (typeof v !== 'string' || v.length === 0) throw new PackFormatError(`lemma-map[${k}] 的值不是非空字符串`);
  }
  if (typeof l.entries !== 'number' || l.entries !== Object.keys(l.map).length) {
    throw new PackFormatError(`lemma-map.entries=${String(l.entries)} 与 map 实际长度不一致`);
  }
  return l as LemmaMap;
}
