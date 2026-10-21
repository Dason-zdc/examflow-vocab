import type { Card, RatingCode } from '../domain/types';
import type { SessionCardView } from '../app/sessionBuilder';
import { Badge, Button } from './primitives';
import {
  ICON_SIZE,
  ICON_STROKE,
  Languages,
  Scissors,
  Star,
  Undo2,
  Volume2,
} from './icons';
import { RATING_LABEL, kindLabel, statStrip, weightLabel } from './format';

/** 学习卡正面（UIUX P1）：词头 + 音标 + 挖空例句 + 预判评分 + 看答案 */

export interface CardFrontProps {
  view: SessionCardView;
  card: Card;
  retrievability: number;
  starred: boolean;
  undoAvailable: boolean;
  onToggleStar: () => void;
  onSuspend: () => void;
  onUndo: () => void;
  onPlay: (accent: 'uk' | 'us') => void;
  onReveal: () => void;
  onPrejudge: (rating: RatingCode) => void;
}

const RATING_ORDER: RatingCode[] = ['AGAIN', 'HARD', 'GOOD'];

export function CardFront({
  view,
  card,
  retrievability,
  starred,
  undoAvailable,
  onToggleStar,
  onSuspend,
  onUndo,
  onPlay,
  onReveal,
  onPrejudge,
}: CardFrontProps) {
  const { word, sense } = view;
  const stat = sense.examStats[card.exam];
  const sentences = view.sentences.slice(0, 2);

  return (
    <article className="flex flex-col gap-4" role="region" aria-label="学习卡片">
      <header className="flex flex-wrap items-center gap-2">
        <Badge tone={card.kind === 'ECCENTRIC' ? 'info' : 'neutral'}>{kindLabel(card)}</Badge>
        {view.tier === 'CORE' ? <Badge tone="accent">核心考点</Badge> : null}
        {sense.examStats[card.exam]?.isEccentric ? <Badge tone="info">含熟词僻义</Badge> : null}
        <span className="ml-auto font-word text-2xs text-meta tabular-nums">{statStrip(card.fsrs, retrievability)}</span>
        <button
          type="button"
          aria-label={starred ? '取消生词本标记' : '加入生词本'}
          title={starred ? '取消生词本标记' : '加入生词本'}
          aria-pressed={starred}
          onClick={onToggleStar}
          className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${starred ? 'text-warning' : 'text-muted'}`}
        >
          <Star size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} fill={starred ? 'currentColor' : 'none'} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="斩词（暂停该词全部卡片）"
          title="斩词"
          onClick={onSuspend}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-danger-soft hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Scissors size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="撤销上次评分"
          title="撤销上次评分"
          disabled={!undoAvailable}
          onClick={onUndo}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-warm hover:text-fg-2 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Undo2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </header>

      <div className="flex flex-col gap-2">
        <h1 className="font-word text-4xl font-announce leading-display tracking-display text-fg break-words">
          {word.lemma}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {stat ? <Badge tone="neutral">{weightLabel(stat.senseWeight)}</Badge> : null}
          <span className="font-word text-sm text-muted">/{word.phoneticUk || word.phoneticUs}/</span>
          <button
            type="button"
            onClick={() => onPlay('uk')}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-fg-2 transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Volume2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
            <span className="font-word">UK</span>
            <Languages size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="text-muted" />
          </button>
          <button
            type="button"
            onClick={() => onPlay('us')}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-fg-2 transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Volume2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
            <span className="font-word">US</span>
          </button>
        </div>
      </div>

      <div className="rounded-lg border border-line-soft bg-warm px-4 py-3">
        <p className="text-xs text-muted">先回忆这个单词在下面例句里的意思，再揭晓答案。</p>
        {sentences.length === 0 ? (
          <p className="mt-2 text-md text-meta">（暂无例句）</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {sentences.map((s) => (
              <li key={s.id} className="text-lg leading-body text-fg-2">
                <BlankedSentence en={s.en} surface={s.surfaceForm} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {RATING_ORDER.map((r, i) => (
            <button
              key={r}
              type="button"
              onClick={() => onPrejudge(r)}
              className="flex min-h-12 flex-col items-center justify-center rounded-md border border-line-strong bg-surface text-sm font-emphasize text-fg-2 transition-colors duration-150 hover:bg-warm active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <span>{RATING_LABEL[r]}</span>
              <span className="font-word text-2xs text-meta">{i + 1}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" block onClick={onReveal} className="border border-dashed border-line-strong">
          看答案 <kbd className="ml-1 font-word text-2xs text-meta">Space</kbd>
        </Button>
      </div>
    </article>
  );
}

/** 挖空目标词：正面不可点（避免提前看到答案） */
function BlankedSentence({ en, surface }: { en: string; surface: string }) {
  if (!surface) return <>{en}</>;
  const idx = en.toLowerCase().indexOf(surface.toLowerCase());
  if (idx < 0) return <>{en}</>;
  return (
    <>
      {en.slice(0, idx)}
      <span className="font-word text-meta" aria-label="目标词已挖空">
        {'_'.repeat(Math.min(12, surface.length))}
      </span>
      {en.slice(idx + surface.length)}
    </>
  );
}
