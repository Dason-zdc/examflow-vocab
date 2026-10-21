import type { Card, RatingCode } from '../domain/types';
import type { SessionCardView } from '../app/sessionBuilder';
import { Badge, Button, Kbd } from './primitives';
import { SentenceTokens } from './SentenceTokens';
import { Check, ICON_SIZE, ICON_STROKE, Scissors, Star, Undo2, Volume2 } from './icons';
import { kindLabel, statStrip, weightLabel } from './format';
import { sentenceSourceLabel } from './sentenceSource';

/** 学习卡正面（对齐原型）：词头 + 双音标胶囊 + 挖空例句 + 彩色评分卡 + 看答案。 */

export interface CardFrontProps {
  view: SessionCardView;
  card: Card;
  retrievability: number;
  starred: boolean;
  /** 正面已选的预判评分：选中态必须可见，否则点了没反馈 */
  prejudged: RatingCode | null;
  undoAvailable: boolean;
  onToggleStar: () => void;
  onSuspend: () => void;
  onUndo: () => void;
  onPlay: (accent: 'uk' | 'us') => void;
  onReveal: () => void;
  onPrejudge: (rating: RatingCode) => void;
  onLookupWord: (surface: string) => void;
}

const RATING_CARDS: Array<{ rating: RatingCode; label: string; hint: string; tone: 'danger' | 'warning' | 'success' }> = [
  { rating: 'AGAIN', label: '不认识', hint: '本轮重点重现', tone: 'danger' },
  { rating: 'HARD', label: '模糊', hint: '本轮再巩固一次', tone: 'warning' },
  { rating: 'GOOD', label: '认识', hint: '看答案后可改「记错了」', tone: 'success' },
];

const TONE_CLASS = {
  danger: 'border-danger-soft bg-danger-soft text-danger hover:border-danger',
  warning: 'border-warning-soft bg-warning-soft text-warning hover:border-warning',
  success: 'border-success-soft bg-success-soft text-success hover:border-success',
} as const;

/** 选中态：实色填充 + 白色文字 + 同色外环，保证一眼能看出「已经点了哪个」 */
const TONE_SELECTED = {
  danger: 'border-danger bg-danger text-on-accent ring-2 ring-danger ring-offset-2 ring-offset-surface',
  warning: 'border-warning bg-warning text-on-accent ring-2 ring-warning ring-offset-2 ring-offset-surface',
  success: 'border-success bg-success text-on-accent ring-2 ring-success ring-offset-2 ring-offset-surface',
} as const;

export function CardFront({
  view,
  card,
  retrievability,
  starred,
  prejudged,
  undoAvailable,
  onToggleStar,
  onSuspend,
  onUndo,
  onPlay,
  onReveal,
  onPrejudge,
  onLookupWord,
}: CardFrontProps) {
  const { word, sense } = view;
  const stat = sense.examStats[card.exam];
  const sentence = view.sentences[0];

  return (
    <article className="flex flex-col" role="region" aria-label="学习卡片">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-soft px-4 py-3 sm:px-6">
        <Badge tone={card.kind === 'ECCENTRIC' ? 'danger' : card.kind === 'CUSTOM' ? 'info' : 'neutral'}>{kindLabel(card)}</Badge>
        {view.tier === 'CORE' ? <Badge tone="accent">核心考点</Badge> : null}
        {stat?.isEccentric ? <Badge tone="danger">含熟词僻义</Badge> : null}
        <span className="ml-auto font-word text-2xs text-meta tabular-nums">{statStrip(card.fsrs, retrievability)}</span>
        <div className="flex items-center gap-0.5">
          <IconAction label={starred ? '取消生词本标记' : '加入生词本'} active={starred} onClick={onToggleStar}>
            <Star size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} fill={starred ? 'currentColor' : 'none'} aria-hidden />
          </IconAction>
          <IconAction label="斩词（暂停该词全部卡片）" onClick={onSuspend}>
            <Scissors size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
          </IconAction>
          <IconAction label="撤销上次评分" disabled={!undoAvailable} onClick={onUndo}>
            <Undo2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
          </IconAction>
        </div>
      </header>

      <div className="px-4 pb-3 pt-5 sm:px-6">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-2">
          <h1 className="break-words font-sans text-4xl font-announce tracking-display text-fg sm:text-5xl">{word.lemma}</h1>
          {stat ? <span className="rounded-pill bg-accent-soft px-2.5 py-0.5 text-xs font-emphasize text-accent-soft-fg">{weightLabel(stat.senseWeight)}</span> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <PronPill accent="UK" phonetic={word.phoneticUk} onClick={() => onPlay('uk')} />
          <PronPill accent="US" phonetic={word.phoneticUs} onClick={() => onPlay('us')} />
        </div>
      </div>

      <div className="border-t border-line-soft bg-sunken px-4 py-5 sm:px-6">
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-meta">
            <span className="min-w-0">
              {sentence
                ? card.kind === 'ECCENTRIC'
                  ? '熟词僻义卡：本句中它是什么意思？'
                  : '结合例句回忆它的考纲含义，再选择认识程度'
                : '该词暂无可溯源的语料例句，请直接回忆释义'}
            </span>
            {sentence ? (
              <span className="shrink-0 whitespace-nowrap text-2xs">{sentenceSourceLabel(sentence.provenance)}</span>
            ) : null}
          </div>
          {sentence ? (
            <p className="text-base font-medium leading-body text-fg-2 sm:text-lg">
              <SentenceTokens en={sentence.en} surface={sentence.surfaceForm} onWord={onLookupWord} blankTarget />
            </p>
          ) : (
            <p className="text-base text-meta">（暂无例句）</p>
          )}
          {sentence ? (
            <p className="mt-2 text-2xs text-meta">点击句中其他单词可查词；目标词在正面挖空，避免提前看答案。</p>
          ) : null}
        </div>

        <div className="mt-4 hidden flex-col gap-3 md:flex">
          <Button variant="ghost" block onClick={onReveal} className="border border-dashed border-line-strong bg-surface">
            直接看答案 <Kbd>Space</Kbd>
          </Button>
          <div className="grid grid-cols-3 gap-3">
            {RATING_CARDS.map((item, index) => {
              const selected = prejudged === item.rating;
              return (
                <button
                  key={item.rating}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${item.label}（快捷键 ${index + 1}）`}
                  onClick={() => onPrejudge(item.rating)}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-sm font-emphasize transition-colors duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected ? TONE_SELECTED[item.tone] : TONE_CLASS[item.tone]
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {selected ? <Check size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                    {item.label}
                    <Kbd>{index + 1}</Kbd>
                  </span>
                  <span className={`text-2xs font-read ${selected ? 'opacity-90' : 'opacity-80'}`}>
                    {selected ? '已选择，可看答案' : item.hint}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="text-center text-2xs text-meta" aria-live="polite">
            {prejudged
              ? `已预判为「${RATING_CARDS.find((c) => c.rating === prejudged)?.label}」，点「直接看答案」揭晓，答案页可改。`
              : '先在心里判断，再选择认识程度；接着会显示完整释义与例句。'}
          </p>
        </div>
        <p className="mt-3 text-center text-2xs text-meta md:hidden">点击下方按钮评分，或点「直接看答案」。</p>
      </div>
    </article>
  );
}

function PronPill({ accent, phonetic, onClick }: { accent: 'UK' | 'US'; phonetic: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`播放${accent === 'UK' ? '英' : '美'}音`}
      className="inline-flex items-center gap-2 rounded-xl bg-warm px-2.5 py-1.5 text-sm text-fg-2 transition-colors duration-150 hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <span className="text-2xs font-emphasize text-meta">{accent}</span>
      <span className="font-word">{phonetic || '—'}</span>
      <Volume2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
    </button>
  );
}

function IconAction({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? 'text-warning' : 'text-muted hover:text-fg-2'
      }`}
    >
      {children}
    </button>
  );
}
