import { AFFIX_LEXICON, findRoot, getCurated, type AffixEntry, type CuratedWord, type MorphKind } from './affixLexicon';

/**
 * 词素切分：把长单词拆成「前缀* + 词根 + 后缀*」，供背面的四步记忆法使用。
 *
 * 设计取舍（为什么不是「见到词根就拆」）：
 * - 只在词素边界上拆：每个字母都必须被某个成分解释（允许词尾不发音的 e），
 *   否则 `city` 会被拆成 cit(唤起) + y，属于典型误伤。
 * - 词根是必需成分。只有前后缀、没有词根时不展示拆解，避免把任意单词硬凑成公式。
 * - 顺序受约束：前缀只能在词首、后缀只能在词根之后，最多 2 个前缀 / 3 个后缀。
 * - 允许两个词根相连的只有 bene / male / ver 这类组合词根（benediction、verdict）。
 * - 打分偏向更长的词根与更少的成分；同分时取成分更少、词根更长的方案。
 * - 所有成分都来自人工校订词表（affix-lexicon.json），中文释义不由模型生成。
 *
 * 输出分两档口径：CURATED = 人工校订整词；AUTO = 按上表自动切分（UI 必须标注）。
 */

export interface MorphPart {
  kind: MorphKind;
  /** 词中实际出现的字母（变体命中时与 key 不同，如 dic → dict） */
  form: string;
  /** 词表主条目（变体归一） */
  key: string;
  cn: string;
  /**
   * 一行记忆链用的短义，如「站」「一起」。
   * 与 cn 分开是必须的：cn 是教学义（含「…」「的」这类占位），直接拼接会产出
   * 「使标记的的」这种叠字；短义来自词表第 3 列，再由人工 atoms 覆盖。
   */
  gloss: string;
  origin: string;
  sourceWord: string;
  start: number;
  end: number;
  variant: boolean;
}

export interface Morphology {
  word: string;
  parts: MorphPart[];
  root: MorphPart;
  /** 第 2 步溯源用的成分链（中文短义） */
  chain: string[];
  /** 第 3 步机械直译（只按成分拼接，不等于词典释义） */
  literal: string;
  /** 一行记忆链的中间推演，如「站到一起」；人工条目的 literal 就是推演句 */
  bridge: string;
  /** 词尾不发音的 e（microscope → micro+scop+e） */
  silentE: boolean;
  confidence: 'CURATED' | 'AUTO';
  /** 记忆链的撰写来源；AUTO 无人工背书，不上学习卡 */
  authoredBy: 'HUMAN' | 'AI_DRAFTED' | 'AI_REVIEWED' | 'NONE';
  /**
   * 是否允许出现在学习卡背面。
   * 口径：自动拆分只进词根库；只有人工（或 AI 起草 + 人审）的记忆链才上卡。
   */
  showOnCard: boolean;
  /** 自动拆分中证据较强的一档（词根 ≥4 字母、成分齐全） */
  strong: boolean;
  note: string;
  /** 词义演变链（仅 curated 有）：从词根本义到当前词义的逐步推演 */
  story?: string[];
}

/**
 * 最短可拆长度（2026-10-26 红线两度调整：6 → 5 → 4）。
 * 拆分可靠性由「词素边界全覆盖 + 人工 curated 优先」保证，而不是一刀切词长；
 * 误拆词（dice/mine/sale 等假同源）走 blocked 名单逐词拦截，
 * cite/excite「唤起」族与 civitas「公民」族的同形冲突也用 blocked 处理。
 * 3 字母以下仍拒绝。
 */
const MIN_WORD = 4;
const MAX_WORD = 24;
const MAX_PREFIXES = 2;
const MAX_SUFFIXES = 3;
const MAX_AFFIX_LEN = 12;

/** un-/non-/il-/ir- 无歧义地表否定；in-/im- 另可表「向内」，只在人工校订词里按否定处理 */
const HARD_NEGATIONS = new Set(['un', 'non', 'il', 'ir']);

/** 两字母后缀的成立条件：词够长，且词根够长 */
const SHORT_SUFFIX_RULES: Record<string, { word: number; root: number }> = {
  al: { word: 6, root: 3 },
  ic: { word: 6, root: 3 },
  fy: { word: 6, root: 3 },
  or: { word: 6, root: 3 },
  y: { word: 7, root: 4 },
};

interface Draft {
  kind: MorphKind;
  entry: AffixEntry;
  form: string;
  start: number;
  end: number;
}

interface State {
  pos: number;
  phase: 0 | 1 | 2;
  score: number;
  parts: Draft[];
  roots: number;
}

function entryFor(kind: MorphKind, form: string): AffixEntry | undefined {
  if (kind === 'PREFIX') return AFFIX_LEXICON.prefixes.get(form);
  if (kind === 'SUFFIX') return AFFIX_LEXICON.suffixes.get(form);
  return findRoot(form);
}

function draftsAt(word: string, pos: number, kind: MorphKind): Draft[] {
  const out: Draft[] = [];
  const max = Math.min(MAX_AFFIX_LEN, word.length - pos);
  // e- 是 ex- 的弱化形式（evidence / emerge），只在词首、且词足够长时单独成前缀
  const min = kind === 'PREFIX' && pos === 0 && word[0] === 'e' && word.length >= 8 ? 1 : 2;
  for (let len = max; len >= min; len -= 1) {
    const form = word.slice(pos, pos + len);
    const entry = kind === 'ROOT' ? findRoot(form) : entryFor(kind, form);
    if (!entry) continue;
    if (kind === 'ROOT' && len < 3) continue;
    out.push({ kind, entry, form, start: pos, end: pos + len });
  }
  return out;
}

function tally(parts: Draft[], kind: MorphKind): number {
  return parts.filter((p) => p.kind === kind).length;
}

function lastRoot(parts: Draft[]): Draft | undefined {
  return [...parts].reverse().find((p) => p.kind === 'ROOT');
}

function relax(states: Map<string, State>, next: State): void {
  const key = `${next.pos}:${next.phase}`;
  const prev = states.get(key);
  if (!prev || next.score > prev.score + 1e-9) states.set(key, next);
}

function shortSuffixAllowed(form: string, wordLen: number, rootLen: number): boolean {
  const rule = SHORT_SUFFIX_RULES[form];
  if (!rule) return form.length >= 3;
  return wordLen >= rule.word && rootLen >= rule.root;
}

/** DP：state = (位置, 阶段)，阶段 0 前缀区 / 1 词根区 / 2 后缀区 */
function segment(word: string): { parts: Draft[]; silentE: boolean } | null {
  const n = word.length;
  const states = new Map<string, State>();
  states.set('0:0', { pos: 0, phase: 0, score: 0, parts: [], roots: 0 });

  for (let pos = 0; pos < n; pos += 1) {
    for (const phase of [0, 1, 2] as const) {
      const node = states.get(`${pos}:${phase}`);
      if (!node) continue;

      if (phase === 0) {
        if (tally(node.parts, 'PREFIX') < MAX_PREFIXES) {
          for (const draft of draftsAt(word, pos, 'PREFIX')) {
            if (draft.end >= n) continue;
            relax(states, {
              ...node,
              pos: draft.end,
              score: node.score + 2.2 * draft.form.length,
              parts: [...node.parts, draft],
            });
          }
        }
        for (const draft of draftsAt(word, pos, 'ROOT')) {
          relax(states, {
            ...node,
            pos: draft.end,
            phase: 1,
            score: node.score + 4.0 * draft.form.length + (draft.entry.form === draft.form ? 1 : 0),
            parts: [...node.parts, draft],
            roots: node.roots + 1,
          });
        }
      }

      const root = lastRoot(node.parts);
      if (phase === 1 && node.roots === 1 && root && AFFIX_LEXICON.compoundRoots.has(root.entry.form)) {
        for (const draft of draftsAt(word, pos, 'ROOT')) {
          relax(states, {
            ...node,
            pos: draft.end,
            score: node.score + 3.6 * draft.form.length,
            parts: [...node.parts, draft],
            roots: node.roots + 1,
          });
        }
      }

      if (phase >= 1 && tally(node.parts, 'SUFFIX') < MAX_SUFFIXES && root) {
        for (const draft of draftsAt(word, pos, 'SUFFIX')) {
          if (!shortSuffixAllowed(draft.form, n, root.form.length)) continue;
          relax(states, {
            ...node,
            pos: draft.end,
            phase: 2,
            score: node.score + 2.4 * draft.form.length - 0.6,
            parts: [...node.parts, draft],
          });
        }
      }
    }
  }

  const candidates: Array<{ parts: Draft[]; silentE: boolean; score: number }> = [];
  for (const [key, state] of states) {
    if (state.roots < 1) continue;
    const end = key.split(':')[0];
    if (end === String(n)) {
      candidates.push({ parts: state.parts, silentE: false, score: state.score - excessPenalty(state.parts.length) });
    } else if (end === String(n - 1) && word[n - 1] === 'e') {
      candidates.push({ parts: state.parts, silentE: true, score: state.score - excessPenalty(state.parts.length) - 1.2 });
    }
  }
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 1e-9) return b.score - a.score;
    if (a.parts.length !== b.parts.length) return a.parts.length - b.parts.length;
    return rootLen(b.parts) - rootLen(a.parts);
  });
  const best = candidates[0]!;
  return { parts: best.parts, silentE: best.silentE };
}

function excessPenalty(count: number): number {
  return 0.3 * Math.max(0, count - 3);
}

function rootLen(parts: Draft[]): number {
  return parts.find((p) => p.kind === 'ROOT')?.form.length ?? 0;
}

function toPart(draft: Draft): MorphPart {
  return {
    kind: draft.kind,
    form: draft.form,
    key: draft.entry.form,
    cn: draft.entry.cn,
    gloss: cleanGloss(draft.entry.literal || draft.entry.cn),
    origin: draft.entry.origin,
    sourceWord: draft.entry.sourceWord,
    start: draft.start,
    end: draft.end,
    variant: draft.form !== draft.entry.form,
  };
}

/**
 * 短义清洗：去掉词表里的省略号与首尾虚词。
 * 不做这步，`…的行为、结果` 会进记忆链变成「使标记的的」。
 */
export function cleanGloss(text: string): string {
  const cleaned = text
    .split(/[、；;，,]/)
    .map((seg) => seg.replace(/…/g, '').replace(/^的+/, '').replace(/的+$/, '').trim())
    .find(Boolean);
  return cleaned ?? text.replace(/…/g, '').trim();
}

function shortCn(part: MorphPart): string {
  return cleanGloss(part.cn);
}

/** 组合词根（bene+dict）里最后一个词根才是家族轴心 */
function mainRoot(parts: MorphPart[]): MorphPart | undefined {
  return [...parts].reverse().find((p) => p.kind === 'ROOT');
}

function suffixTemplate(part: MorphPart): string {
  return AFFIX_LEXICON.suffixes.get(part.key)?.literal ?? part.cn;
}

/** 机械直译：否定前缀整体包在最外层，其余前缀按顺序贴词根，后缀从内到外逐层套模板 */
export function composeLiteral(parts: MorphPart[]): string {
  const root = mainRoot(parts);
  if (!root) return '';
  const suffixes = parts.filter((p) => p.kind === 'SUFFIX');
  const prefixes = parts.filter((p) => p.kind === 'PREFIX');
  const negated = prefixes.filter((p) => HARD_NEGATIONS.has(p.key));
  const inline = prefixes.filter((p) => !HARD_NEGATIONS.has(p.key));

  // 一律用短义拼接：cn 是教学义，带「…」「的」，拼出来就是叠字
  let core = `${inline.map((p) => p.gloss).join('')}${root.gloss}`;
  for (const suffix of suffixes) {
    core = suffixTemplate(suffix).replace('{core}', core);
  }
  return `${negated.map(() => '不').join('')}${core}`;
}

function build(
  word: string,
  parts: MorphPart[],
  silentE: boolean,
  confidence: 'CURATED' | 'AUTO',
  literal?: string,
  authoredBy: 'HUMAN' | 'AI_DRAFTED' | 'AI_REVIEWED' | 'NONE' = 'NONE',
  story?: string[],
): Morphology {
  const root = mainRoot(parts)!;
  const computed = literal && literal.trim() ? literal.trim() : composeLiteral(parts);
  const strong = root.form.length >= 4 && parts.length >= 2 && parts.every((p) => p.cn.length > 0);
  const source = root.sourceWord ? `（${root.sourceWord}）` : '';
  const curated = confidence === 'CURATED';
  return {
    word,
    parts,
    root,
    chain: parts.map(shortCn),
    literal: computed,
    bridge: computed,
    silentE,
    confidence,
    authoredBy: curated ? (authoredBy === 'NONE' ? 'HUMAN' : authoredBy) : 'NONE',
    // 红线：自动拆分只进词根库，不上学习卡
    showOnCard: curated,
    strong,
    note: curated
      ? `人工校订的拆解：词根 ${root.form} 源自${root.origin}${source}。`
      : `按词根词缀表自动切分：词根 ${root.form} 源自${root.origin}${source}，未逐词人工复核，仅供词根库检索。`,
    ...(curated && story && story.length > 0 ? { story } : {}),
  };
}

function fromCurated(word: string, curated: CuratedWord): Morphology | null {
  const parts: MorphPart[] = [];
  let cursor = 0;
  for (const [kind, form] of curated.parts) {
    const entry = entryFor(kind, form);
    if (!entry) return null;
    if (word.slice(cursor, cursor + form.length) !== form) return null;
    const override = curated.atoms?.[form] ?? curated.atoms?.[entry.form];
    parts.push({
      kind,
      form,
      key: entry.form,
      cn: entry.cn,
      gloss: override ? cleanGloss(override) : cleanGloss(entry.literal || entry.cn),
      origin: entry.origin,
      sourceWord: entry.sourceWord,
      start: cursor,
      end: cursor + form.length,
      variant: form !== entry.form,
    });
    cursor += form.length;
  }
  const silentE = cursor === word.length - 1 && word[cursor] === 'e';
  if (cursor !== word.length && !silentE) return null;
  if (parts.filter((p) => p.kind === 'ROOT').length === 0) return null;
  return build(word, parts, silentE, 'CURATED', curated.literal, curated.authoredBy ?? 'HUMAN', curated.story);
}

export function analyzeMorphology(lemma: string): Morphology | null {
  const word = lemma.trim().toLowerCase().replace(/[^a-z]/g, '');
  if (word.length < MIN_WORD || word.length > MAX_WORD) return null;
  if (AFFIX_LEXICON.blocked.has(word)) return null;

  const curated = getCurated(word);
  if (curated) {
    const hit = fromCurated(word, curated);
    if (hit) return hit;
  }

  const split = segment(word);
  if (!split) return null;
  return build(word, split.parts.map(toPart), split.silentE, 'AUTO');
}

/** 词根家族键：用于「织网」查同根词（变体归一到主条目） */
export function familyKey(morph: Morphology | null): string | null {
  return morph?.root.key ?? null;
}
