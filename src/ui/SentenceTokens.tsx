import type { MouseEvent } from 'react';

/** 例句分词渲染：每个英文单词可点击查词；正面把目标词挖空，避免提前看到答案。 */
export interface SentenceTokensProps {
  en: string;
  surface?: string;
  onWord: (word: string) => void;
  blankTarget?: boolean;
}

export function SentenceTokens({ en, surface = '', onWord, blankTarget = false }: SentenceTokensProps) {
  const tokens = en.split(/([A-Za-z][A-Za-z'’-]*)/g);
  return (
    <>
      {tokens.map((token, i) => {
        if (!/^[A-Za-z]/.test(token)) return <span key={i}>{token}</span>;
        const isTarget = surface.length > 0 && token.toLowerCase() === surface.toLowerCase();
        if (isTarget && blankTarget) {
          return (
            <span key={i} className="font-word text-meta" aria-label="目标词已挖空">
              {'_'.repeat(Math.min(12, surface.length))}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              onWord(token);
            }}
            aria-label={`查询 ${token}`}
            className={`rounded-sm font-word transition-colors duration-150 hover:bg-accent-soft hover:text-accent-soft-fg hover:underline hover:decoration-dotted hover:decoration-accent hover:underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:underline ${
              isTarget ? 'font-emphasize text-fg' : 'text-fg-2'
            }`}
          >
            {token}
          </button>
        );
      })}
    </>
  );
}
