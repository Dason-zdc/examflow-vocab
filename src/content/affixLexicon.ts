import raw from './affix-lexicon.json';

/**
 * 词根词缀教学词典（人工校订）的类型化入口。
 *
 * 数据来源与口径：
 * - 释义为中文教学义，不是词典正文；词源只给「来源语言 + 原词」，不做长段考证。
 * - 只用查得到的成分拼记忆公式，不编造联想（延续项目既有的「不臆造词源」红线）。
 * - 该表同时被 Python 构建脚本读取（同根词网索引），改字段要两边一起改。
 *
 * 文件结构（affix-lexicon.json）：
 *   prefixes: [form, 中文释义, 直译成分, 来源语言, 词源原词]
 *   roots:    [form, 中文释义, 直译成分, 来源语言, 词源原词, 变体[]?]
 *   suffixes: [form, 中文释义, 直译模板, 来源语言, 词源原词, 词性]
 */

export type MorphKind = 'PREFIX' | 'ROOT' | 'SUFFIX';

export interface AffixEntry {
  /** 词表主条目，如 dict；变体 dic 命中的也是这一条 */
  form: string;
  kind: MorphKind;
  /** 教学释义，如「说、断言」 */
  cn: string;
  /** 第 3 步机械直译用的短义，如「说」；后缀是含 {core} 的模板 */
  literal: string;
  origin: string;
  sourceWord: string;
  variants: string[];
}

export interface CuratedWord {
  parts: Array<[MorphKind, string]>;
  /** 人工写好的直译，避免机械拼接在 showcase 词上读不通 */
  literal: string;
  /**
   * 人工指定的成分短义，覆盖词表默认值（如 con: '一起'、sist: '站'）。
   * 词表的短义是通用口径，具体到某个词会读不通——「共同站立」不如「站到一起」。
   */
  atoms?: Record<string, string>;
  /**
   * 这条记忆链的撰写来源。缺省视为 HUMAN（历史条目都是人工写的）；
   * AI_REVIEWED = 构建期由 AI 起草、人工抽检后入库，UI 必须标「助记」。
   */
  authoredBy?: 'HUMAN' | 'AI_DRAFTED' | 'AI_REVIEWED';
  /**
   * 词义演变链（BRIDGE 层，AI 起草须标注）：从词根本义到当前词义的逐步推演，
   * 每步一句话。展示于卡片背面「词义演变」可展开区。
   */
  story?: string[];
}

export interface AffixLexicon {
  version: string;
  prefixes: Map<string, AffixEntry>;
  roots: Map<string, AffixEntry>;
  suffixes: Map<string, AffixEntry>;
  /** 变体 → 主条目（dic → dict） */
  rootAliases: Map<string, AffixEntry>;
  curated: Map<string, CuratedWord>;
  blocked: Set<string>;
  /** 允许两个词根相连的「组合词根」（bene+dict、male+dict、ver+dict） */
  compoundRoots: Set<string>;
}

type Row = unknown[];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean) : [];
}

function makeEntry(row: Row, kind: MorphKind): AffixEntry | null {
  const form = text(row[0]).toLowerCase();
  const cn = text(row[1]);
  const literal = text(row[2]);
  if (!form || !cn) return null;
  return {
    form,
    kind,
    cn,
    literal: literal || cn,
    origin: text(row[3]) || '未标注',
    sourceWord: text(row[4]),
    variants: strings(row[5]).map((v) => v.toLowerCase()),
  };
}

function index(rows: Row[], kind: MorphKind): Map<string, AffixEntry> {
  const map = new Map<string, AffixEntry>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const entry = makeEntry(row, kind);
    if (entry && !map.has(entry.form)) map.set(entry.form, entry);
  }
  return map;
}

function parseCurated(value: unknown): Map<string, CuratedWord> {
  const out = new Map<string, CuratedWord>();
  if (!value || typeof value !== 'object') return out;
  for (const [word, item] of Object.entries(value as Record<string, unknown>)) {
    const record = item as { parts?: unknown; literal?: unknown; atoms?: unknown; authoredBy?: unknown; story?: unknown };
    if (!Array.isArray(record.parts)) continue;
    const parts: Array<[MorphKind, string]> = [];
    for (const part of record.parts) {
      if (!Array.isArray(part) || part.length < 2) continue;
      const kind = typeof part[0] === 'string' ? part[0].toUpperCase() : '';
      const form = part[1];
      if (kind !== 'PREFIX' && kind !== 'ROOT' && kind !== 'SUFFIX') continue;
      if (typeof form !== 'string') continue;
      parts.push([kind, form.toLowerCase()]);
    }
    if (parts.length > 0) {
      const atoms: Record<string, string> = {};
      if (record.atoms && typeof record.atoms === 'object' && !Array.isArray(record.atoms)) {
        for (const [k, v] of Object.entries(record.atoms as Record<string, unknown>)) {
          const gloss = text(v);
          if (k && gloss) atoms[k.toLowerCase()] = gloss;
        }
      }
      const authoredBy =
        record.authoredBy === 'AI_REVIEWED' ? 'AI_REVIEWED' : record.authoredBy === 'AI_DRAFTED' ? 'AI_DRAFTED' : 'HUMAN';
      const story = Array.isArray(record.story)
        ? record.story.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        : undefined;
      out.set(word.toLowerCase(), {
        parts,
        literal: text(record.literal),
        ...(Object.keys(atoms).length > 0 ? { atoms } : {}),
        authoredBy,
        ...(story && story.length > 0 ? { story } : {}),
      });
    }
  }
  return out;
}

function build(data: typeof raw): AffixLexicon {
  const prefixes = index(data.prefixes as Row[], 'PREFIX');
  const roots = index(data.roots as Row[], 'ROOT');
  const suffixes = index(data.suffixes as Row[], 'SUFFIX');

  const rootAliases = new Map<string, AffixEntry>();
  for (const entry of roots.values()) {
    for (const variant of entry.variants) {
      if (!rootAliases.has(variant) && !roots.has(variant)) rootAliases.set(variant, entry);
    }
  }

  return {
    version: text((data as { version?: unknown }).version) || '0.0.0',
    prefixes,
    roots,
    suffixes,
    rootAliases,
    curated: parseCurated((data as { curated?: unknown }).curated),
    blocked: new Set(strings((data as { blocked?: unknown }).blocked).map((w) => w.toLowerCase())),
    compoundRoots: new Set(['bene', 'male']),
  };
}

export const AFFIX_LEXICON: AffixLexicon = build(raw);

// ---------- AI 覆盖层：「问 AI 核对」写入的运行时词源，优先于打包词表 ----------

const aiOverrides = new Map<string, CuratedWord>();
let overridesLoaded = false;
const overrideListeners = new Set<() => void>();

/** JSON 里的 kind 是小写，内存口径是大写：入库前统一归一 */
function normalizeEntry(entry: CuratedWord): CuratedWord {
  return {
    ...entry,
    parts: entry.parts.map(([k, f]) => [k.toUpperCase() as MorphKind, f.toLowerCase()]),
  };
}

/** 查 curated：AI 覆盖层优先，其次打包词表 */
export function getCurated(word: string): CuratedWord | undefined {
  return aiOverrides.get(word) ?? AFFIX_LEXICON.curated.get(word);
}

/** 应用一条 AI 核对结果（立即生效并通知订阅者） */
export function applyAiOverride(word: string, entry: CuratedWord): void {
  aiOverrides.set(word.toLowerCase(), normalizeEntry(entry));
  for (const cb of overrideListeners) cb();
}

export function onAiOverridesChange(cb: () => void): () => void {
  overrideListeners.add(cb);
  return () => overrideListeners.delete(cb);
}

/** 测试用：清空覆盖层 */
export function resetAiOverrides(): void {
  aiOverrides.clear();
  for (const cb of overrideListeners) cb();
}

/** 启动时拉取后端持久化的覆盖层（离线/未启动后端时静默跳过） */
export async function loadAiOverrides(): Promise<void> {
  if (overridesLoaded) return;
  overridesLoaded = true;
  try {
    const res = await fetch('/api/v1/morph/overrides');
    if (!res.ok) return;
    const body = (await res.json()) as { overrides?: Record<string, CuratedWord> };
    for (const [w, entry] of Object.entries(body.overrides ?? {})) {
      if (entry && Array.isArray(entry.parts)) aiOverrides.set(w, normalizeEntry(entry));
    }
    if (aiOverrides.size > 0) for (const cb of overrideListeners) cb();
  } catch {
    /* 后端不可达：只用打包词表 */
  }
}

/** 词根主条目：先查主表，再查变体表 */
export function findRoot(form: string): AffixEntry | undefined {
  return AFFIX_LEXICON.roots.get(form) ?? AFFIX_LEXICON.rootAliases.get(form);
}

export function lexiconStats() {
  return {
    prefixes: AFFIX_LEXICON.prefixes.size,
    roots: AFFIX_LEXICON.roots.size,
    suffixes: AFFIX_LEXICON.suffixes.size,
    curated: AFFIX_LEXICON.curated.size,
    version: AFFIX_LEXICON.version,
  };
}
