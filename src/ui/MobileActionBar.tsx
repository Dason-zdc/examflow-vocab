import type { RatingCode } from '../domain/types';

/** 移动端底部操作栏（<768px）：评分与「下一个」固定在拇指热区，按钮 ≥44px。 */

export interface MobileActionBarProps {
  revealed: boolean;
  hasPending: boolean;
  /** 正面已选的预判评分：选中态与桌面一致 */
  prejudged: RatingCode | null;
  onCommitNext: () => void;
  onPrejudge: (rating: RatingCode) => void;
  onReveal: () => void;
}

const RATING_LABEL: Array<{ rating: RatingCode; text: string }> = [
  { rating: 'AGAIN', text: '不认识' },
  { rating: 'HARD', text: '模糊' },
  { rating: 'GOOD', text: '认识' },
];

export function MobileActionBar({ revealed, hasPending, prejudged, onCommitNext, onPrejudge, onReveal }: MobileActionBarProps) {
  return (
    <nav
      aria-label="学习操作"
      className="fixed inset-x-0 bottom-0 z-mobilebar grid gap-2 border-t border-line bg-surface px-3 pt-2 lg:hidden"
      style={{ paddingBottom: 'calc(var(--space-2) + env(safe-area-inset-bottom, 0px))' }}
    >
      {revealed ? (
        <button
          type="button"
          disabled={!hasPending}
          onClick={onCommitNext}
          className="min-h-[52px] rounded-md bg-accent text-base font-emphasize text-on-accent disabled:opacity-50"
        >
          下一个
        </button>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {RATING_LABEL.map((item) => {
              const selected = prejudged === item.rating;
              return (
                <button
                  key={item.rating}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => onPrejudge(item.rating)}
                  className={`min-h-12 rounded-md border text-sm font-emphasize transition-colors duration-150 active:scale-[0.97] ${
                    selected
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line-strong bg-surface text-fg-2'
                  }`}
                >
                  {item.text}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onReveal}
            className="min-h-11 rounded-md border border-dashed border-line-strong bg-surface text-sm text-muted"
          >
            直接看答案
          </button>
        </>
      )}
    </nav>
  );
}
