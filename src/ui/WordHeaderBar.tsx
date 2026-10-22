import type { PackWord } from '../content/packVerifier';
import { Kbd } from './primitives';
import { ICON_SIZE, ICON_STROKE, Star, Volume2 } from './icons';

/** P2-1 词头行：音标 + 发音 + 星标 + 拼写入口 + 键位提示，一行收敛原本散落的信息。 */
export interface WordHeaderBarProps {
  word: PackWord;
  starred: boolean;
  onToggleStar: () => void;
  onPlay: (accent: 'uk' | 'us') => void;
  onOpenSpell: () => void;
}

export function WordHeaderBar({ word, starred, onToggleStar, onPlay, onOpenSpell }: WordHeaderBarProps) {
  const uk = word.phoneticUk || '';
  const us = word.phoneticUs || '';

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-soft px-4 py-2.5 sm:px-6">
      <span className="font-word text-base font-emphasize text-fg">{word.lemma}</span>
      <div className="flex flex-wrap items-center gap-2">
        {uk ? (
          <button
            type="button"
            onClick={() => onPlay('uk')}
            aria-label={`朗读 ${word.lemma}（英式）`}
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Volume2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
            <span className="text-2xs text-meta">UK</span>
            <span className="font-word">{uk}</span>
          </button>
        ) : null}
        {us ? (
          <button
            type="button"
            onClick={() => onPlay('us')}
            aria-label={`朗读 ${word.lemma}（美式）`}
            className="inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-xs text-muted transition-colors duration-150 hover:bg-accent-soft hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Volume2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
            <span className="text-2xs text-meta">US</span>
            <span className="font-word">{us}</span>
          </button>
        ) : null}
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={onToggleStar}
          aria-pressed={starred}
          aria-label={starred ? '取消收藏' : '收藏'}
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
            starred ? 'border-accent bg-accent-soft text-accent-soft-fg' : 'border-line text-muted hover:text-fg-2'
          }`}
        >
          <Star size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} fill={starred ? 'currentColor' : 'none'} aria-hidden />
          {starred ? '已收藏' : '收藏'}
          <Kbd>C</Kbd>
        </button>
        <button
          type="button"
          onClick={onOpenSpell}
          className="inline-flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          拼写
          <Kbd>S</Kbd>
        </button>
      </div>
    </div>
  );
}
