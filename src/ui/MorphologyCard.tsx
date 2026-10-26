import { useEffect, useMemo, useState } from 'react';
import { analyzeMorphology, cleanGloss, type MorphPart } from '../content/morphology';
import { loadAiOverrides, onAiOverridesChange } from '../content/affixLexicon';
import { Badge, Kbd } from './primitives';
import { MorphAsk } from './MorphAsk';
import { useRootFamily } from './useRootFamily';

void loadAiOverrides();

/**
 * 词根记忆链（卡片背面）。
 *
 * 形态：`con(一起) + sist(站) → 站到一起 → 由…组成`，一行说完，不再是四步表格。
 *
 * 三条口径：
 * 1. 只展示人工/AI 起草后入库的记忆链（analyzeMorphology.showOnCard）；
 *    自动拆分只进词根库，避免「corporate → 使身体」这种半成品上卡。
 * 2. 同根词只挑 2–3 个「已经学过」的，不铺整张网；没学过就不显示这一行。
 * 3. 链尾词义默认遮住，点开才出现——把它变成一次主动回忆，而不是阅读材料。
 */
export interface MorphologyCardProps {
  lemma: string;
  /** 当前义项中文，用作链尾的「实际词义」 */
  senseCn: string;
  forms?: string[];
  open: boolean;
  onToggle: () => void;
  /** 已学过的词（按 FSRS reps > 0 筛），用于挑同根词 */
  knownLemmas?: ReadonlySet<string>;
  /** 点同根词跳转 */
  onOpenWord?: (lemma: string) => void;
  /** 查词弹窗里的速览：只留记忆链，不显示同根词与明细 */
  compact?: boolean;
  /** 跳到「词根库」页（不传则不显示入口） */
  onOpenRoots?: () => void;
}

interface Atom {
  form: string;
  gloss: string;
}

/** 后缀的短义是「使{core}的」这类模板，展示时要用教学义的第一段 */
function displayGloss(part: MorphPart): string {
  return part.kind === 'SUFFIX' ? cleanGloss(part.cn) : part.gloss;
}

function atomsOf(parts: MorphPart[]): Atom[] {
  return parts.map((p) => ({ form: p.form, gloss: displayGloss(p) }));
}

/** 义项首段保留省略号：「由…组成」不能洗成「由组成」 */
function senseHead(cn: string): string {
  return cn.split(/[；;]/)[0]?.trim() || cn;
}

const SOURCE_BADGE = {
  HUMAN: { label: '人工助记', tone: 'success' as const },
  AI_DRAFTED: { label: '助记 · AI 起草', tone: 'warn' as const },
  AI_REVIEWED: { label: '助记 · 已复核', tone: 'info' as const },
};

export function MorphologyCard({
  lemma,
  senseCn,
  forms,
  open,
  onToggle,
  knownLemmas,
  onOpenWord,
  compact = false,
  onOpenRoots,
}: MorphologyCardProps) {
  const [aiTick, setAiTick] = useState(0);
  useEffect(() => onAiOverridesChange(() => setAiTick((v) => v + 1)), []);
  // aiTick 变化（AI 覆盖层更新）时强制重新分析当前词
  const morph = useMemo(() => analyzeMorphology(lemma), [lemma, aiTick]);
  const [revealed, setRevealed] = useState(compact);
  const [detail, setDetail] = useState(false);
  const { family } = useRootFamily(morph && morph.showOnCard ? morph.root.key : null);

  const knownRootWords = useMemo(() => {
    if (!morph || !knownLemmas || !family) return [];
    return family.words
      .filter((w) => w.lemma !== lemma && knownLemmas.has(w.lemma))
      .slice(0, 3);
  }, [morph, knownLemmas, family, lemma]);

  // 红线：没有人工背书的记忆链不上学习卡——但保留「问 AI 核对」入口，
  // AI 核对通过后覆盖层生效，本组件会重新分析并渲染完整卡片
  if (!morph || !morph.showOnCard) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4" aria-label="词根记忆链">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-2xs font-emphasize text-accent-soft-fg">词根</span>
            <span className="text-xs text-meta">暂无人工背书的拆解</span>
          </div>
          {!compact ? <MorphAsk lemma={lemma} /> : null}
        </header>
      </section>
    );
  }

  const atoms = atomsOf(morph.parts);
  const meaning = senseHead(senseCn) || '以词典释义为准';
  const sourceKey: keyof typeof SOURCE_BADGE =
    morph.authoredBy === 'AI_DRAFTED' || morph.authoredBy === 'AI_REVIEWED' ? morph.authoredBy : 'HUMAN';
  const source = SOURCE_BADGE[sourceKey];
  const formula = atoms.map((a) => a.form).join(' + ');

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label="词根记忆链">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-2xs font-emphasize text-accent-soft-fg">词根</span>
          <span className="font-word text-sm font-emphasize text-fg">{formula}</span>
          <Badge tone={source.tone}>{source.label}</Badge>
        </div>
        <div className="flex items-center gap-3">
          {!compact ? <MorphAsk lemma={lemma} /> : null}
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {open ? '收起' : '展开'} <Kbd>R</Kbd>
          </button>
        </div>
      </header>

      {open ? (
        <div className="mt-2.5 flex flex-col gap-2 border-t border-line-soft pt-2.5">
          {/* 一行记忆链 */}
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-relaxed" data-testid="memory-chain">
            {atoms.map((a, i) => (
              <span key={`${a.form}-${i}`} className="inline-flex items-baseline gap-0.5">
                {i > 0 ? <span aria-hidden className="mr-0.5 text-meta">+</span> : null}
                <span className="font-word font-emphasize text-fg">{a.form}</span>
                <span className="text-2xs text-muted">({a.gloss})</span>
              </span>
            ))}
            <span aria-hidden className="mx-0.5 text-meta">→</span>
            <span className="text-fg-2">{morph.bridge}</span>
            <span aria-hidden className="mx-0.5 text-meta">→</span>
            {revealed ? (
              <strong className="font-emphasize text-accent-soft-fg">{meaning}</strong>
            ) : (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                aria-label={`回忆词义：${formula} = ?`}
                title="先自己想一想，再点开"
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-dashed border-accent bg-accent-soft px-1.5 font-emphasize text-accent-soft-fg transition-colors duration-150 hover:bg-accent hover:text-on-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                ?
              </button>
            )}
          </p>

          {!revealed ? <p className="text-2xs text-meta">先按成分推一遍，再点「?」对答案。</p> : null}

          {knownRootWords.length > 0 && !compact ? (
            <p className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-2xs text-muted">
              <span className="font-emphasize text-meta">同根</span>
              {knownRootWords.map((w, i) => (
                <span key={w.lemma} className="inline-flex items-baseline gap-1">
                  {i > 0 ? <span aria-hidden className="text-meta">·</span> : null}
                  <button
                    type="button"
                    onClick={() => onOpenWord?.(w.lemma)}
                    className="font-word text-xs text-fg-2 underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {w.lemma}
                  </button>
                </span>
              ))}
              <span className="text-meta">（只列学过的）</span>
            </p>
          ) : null}

          {!compact ? (
            <div className="flex flex-wrap items-center gap-3 text-2xs">
              <button
                type="button"
                onClick={() => setDetail((v) => !v)}
                aria-expanded={detail}
                className="text-accent transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                {detail ? '收起拆解' : '拆解 · 演变 · 同根词'}
              </button>
              {onOpenRoots ? (
                <button
                  type="button"
                  onClick={onOpenRoots}
                  className="text-accent transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  词根库
                </button>
              ) : null}
            </div>
          ) : null}

          {detail && !compact ? (
            <ul className="flex flex-col gap-1 rounded-lg bg-sunken px-2 py-1.5">
              {morph.parts.map((part, i) => (
                <li key={`${part.form}-${i}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-2xs">
                  <span className="w-16 shrink-0 font-word font-emphasize text-fg-2">{part.form}</span>
                  <span className="text-fg-2">{part.cn}</span>
                  <span className="text-meta">
                    {part.origin}
                    {part.sourceWord ? ` · ${part.sourceWord}` : ''}
                    {part.variant ? ` · ${part.key} 的变体` : ''}
                  </span>
                </li>
              ))}
              {morph.silentE ? <li className="text-2xs text-meta">词尾 e 不发音</li> : null}
            </ul>
          ) : null}

          {detail && morph.story && morph.story.length > 0 ? (
            <div className="rounded-lg bg-sunken px-2 py-1.5" aria-label="词义演变" data-testid="morph-story">
              <p className="text-2xs font-emphasize text-meta">词义演变</p>
              <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-4 text-2xs leading-snug text-fg-2">
                {morph.story.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          ) : null}

          {detail && family && family.words.length > 0 ? (
            <div className="rounded-lg bg-sunken px-2 py-1.5" aria-label="同根词拓展" data-testid="morph-cognates">
              <p className="text-2xs font-emphasize text-meta">
                同根词拓展（{family.cn ? `${family.root} = ${family.cn}` : family.root}）
              </p>
              <ul className="mt-1 flex flex-col gap-0.5 text-2xs leading-snug">
                {family.words.slice(0, 6).map((w) => (
                  <li key={w.lemma} className="flex flex-wrap items-baseline gap-x-1.5">
                    <span className="font-word font-emphasize text-fg-2">{w.lemma}</span>
                    <span className="text-meta">{w.formula}</span>
                    <span className="text-fg-2">{w.cn}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {forms && forms.length > 0 ? <p className="text-2xs text-meta">词形变化：{forms.join(' / ')}</p> : null}
          <p className="text-2xs leading-snug text-meta">
            {String(morph.authoredBy) === 'AI_DRAFTED'
              ? '拆分依据人工校订词表；推演句由 AI 起草，尚未逐词复核，只作记忆抓手。'
              : morph.note}
          </p>
        </div>
      ) : null}
    </section>
  );
}
