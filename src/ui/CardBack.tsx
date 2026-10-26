import { useState } from 'react';
import type { Card, RatingCode } from '../domain/types';
import type { PendingReview } from '../domain/reviewCommitter';
import type { RequeueResult } from '../domain/sessionQueue';
import type { SessionCardView } from '../app/sessionBuilder';
import { buildExamTip } from '../app/examTip';
import { Button, Kbd } from './primitives';
import { CardBackDictionary } from './CardBackDictionary';
import { CardBackSentences } from './CardBackSentences';
import { ConfusableBlock, ExamTipBlock, IeltsRewriteBlock } from './CardBackBlocks';
import { MorphologyCard } from './MorphologyCard';
import { WordHeaderBar } from './WordHeaderBar';
import { ICON_SIZE, ICON_STROKE, ArrowRight } from './icons';
import { BACK_RATING_LABEL } from './format';

/** 学习卡背面（P2-1 重构）：词头行 + 评分行 + 三 Tab（学习卡 / 词典 / 笔记）。 */
export interface CardBackProps {
  view: SessionCardView;
  card: Card;
  pending: PendingReview | null;
  lastRequeue: RequeueResult | null;
  note: string;
  accent: 'uk' | 'us';
  starred: boolean;
  etymologyOpen: boolean;
  onToggleEtymology: () => void;
  confusablesOpen: boolean;
  onToggleConfusables: () => void;
  onOpenWord: (lemma: string) => void;
  onLookupWord: (surface: string) => void;
  /** 跳到词根库页（未接入时卡片不显示入口） */
  onOpenRoots?: () => void;
  /** 已学过的词（FSRS reps > 0），用于挑 2–3 个同根词 */
  knownLemmas?: ReadonlySet<string>;
  onOpenSpell: () => void;
  onToggleStar: () => void;
  onPlay: (accent: 'uk' | 'us') => void;
  onRevise: (rating: RatingCode) => void;
  onCommitNext: () => void;
  onSaveNote: (note: string) => void;
}

const RATING_TONE: Record<RatingCode, { solid: string; outline: string }> = {
  AGAIN: { solid: 'border-danger bg-danger text-on-accent', outline: 'border-danger-soft bg-surface text-danger hover:bg-danger-soft' },
  HARD: { solid: 'border-warning bg-warning text-on-accent', outline: 'border-warning-soft bg-surface text-warning hover:bg-warning-soft' },
  GOOD: { solid: 'border-success bg-success text-on-accent', outline: 'border-success-soft bg-surface text-success hover:bg-success-soft' },
};

const RATING_ORDER: RatingCode[] = ['AGAIN', 'HARD', 'GOOD'];

const TABS = [
  ['study', '学习卡'],
  ['dict', '词典'],
  ['note', '笔记'],
] as const;

type TabKey = (typeof TABS)[number][0];

export function CardBack({
  view,
  card,
  pending,
  lastRequeue,
  note,
  accent,
  starred,
  etymologyOpen,
  onToggleEtymology,
  confusablesOpen,
  onToggleConfusables,
  onOpenWord,
  onLookupWord,
  onOpenRoots,
  knownLemmas,
  onOpenSpell,
  onToggleStar,
  onPlay,
  onRevise,
  onCommitNext,
  onSaveNote,
}: CardBackProps) {
  const { word, sense } = view;
  const [tab, setTab] = useState<TabKey>('study');
  const rating = pending?.rating ?? null;
  const tip = buildExamTip(word, sense, card.exam);

  return (
    <article role="region" aria-label="学习卡片答案">
      <RequeueBanner result={lastRequeue} />
      <WordHeaderBar word={word} starred={starred} onToggleStar={onToggleStar} onPlay={onPlay} onOpenSpell={onOpenSpell} />

      <div className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 sm:px-6">
        <span className="mr-1 text-xs text-muted">本次评分</span>
        {RATING_ORDER.map((r) => (
          <button
            key={r}
            type="button"
            aria-pressed={rating === r}
            onClick={() => onRevise(r)}
            className={`inline-flex items-center gap-1 rounded-lg border-2 px-3 py-1.5 text-sm font-emphasize transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              rating === r ? RATING_TONE[r].solid : RATING_TONE[r].outline
            }`}
          >
            {BACK_RATING_LABEL[r]} <Kbd>{r === 'AGAIN' ? '1' : r === 'HARD' ? '2' : '3'}</Kbd>
          </button>
        ))}
        {pending?.prejudged ? <span className="text-2xs text-meta">正面预判</span> : null}
        {pending?.corrected ? <span className="text-2xs text-warning">已修正</span> : null}
      </div>

      <div className="flex items-center gap-5 border-b border-line px-4 text-sm sm:px-6">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              tab === key ? 'border-accent font-emphasize text-accent' : 'border-transparent text-muted hover:text-fg-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-5 px-4 pb-24 pt-4 sm:px-6 md:pb-6">
        {tab === 'study' ? (
          <>
            <CardBackSentences word={word} currentSenseId={sense.id} accent={accent} onWord={onLookupWord} />
            <MorphologyCard
              lemma={word.lemma}
              senseCn={sense.cn}
              forms={word.forms}
              {...(knownLemmas ? { knownLemmas } : {})}
              open={etymologyOpen}
              onToggle={onToggleEtymology}
              onOpenWord={onOpenWord}
              {...(onOpenRoots ? { onOpenRoots } : {})}
            />
            <ConfusableBlock
              lemma={word.lemma}
              lapses={card.fsrs.lapses}
              confusables={word.confusables}
              open={confusablesOpen}
              onToggle={onToggleConfusables}
              onOpenWord={onOpenWord}
            />
            <IeltsRewriteBlock
              lemma={word.lemma}
              senseCn={sense.cn}
              {...(sense.enDef ? { enDef: sense.enDef } : {})}
              groups={sense.synonymGroups ?? []}
              onOpenWord={onOpenWord}
            />
          </>
        ) : null}

        {tab === 'dict' ? <CardBackDictionary word={word} sense={sense} exam={card.exam} /> : null}

        {tab === 'note' ? <ExamTipBlock tip={tip} note={note} onSave={onSaveNote} /> : null}

        <div className="hidden md:flex md:flex-col md:gap-2">
          <Button variant="primary" block disabled={!rating} onClick={onCommitNext} aria-describedby={rating ? undefined : 'next-hint'}>
            下一个
            <ArrowRight size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
          </Button>
          {!rating ? (
            <p id="next-hint" className="text-center text-2xs text-meta">
              先选择评分，再进入下一张
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function RequeueBanner({ result }: { result: RequeueResult | null }) {
  if (!result) {
    return (
      <div className="border-b border-line-soft bg-sunken px-4 py-2 text-xs text-muted sm:px-6">
        看完答案后，请选择本次的认识程度再继续
      </div>
    );
  }
  if (result.outcome === 'PASSED') {
    return (
      <div className="border-b border-success-soft bg-success-soft px-4 py-2 text-xs text-success sm:px-6">
        本轮通关，进入下一张后提交评分
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between gap-2 border-b border-warning-soft bg-warning-soft px-4 py-2 text-xs text-warning sm:px-6">
      <span>
        稍后将继续安排这个单词的学习
        {result.outcome === 'DEFERRED' ? '（本轮末尾）' : ''}
      </span>
      <span className="font-word tabular-nums">本轮 {result.points}/2</span>
    </div>
  );
}
