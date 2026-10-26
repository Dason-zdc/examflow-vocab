import type { Confusable } from '../domain/types';
import { confusablePairsFor } from '../content/confusables';
import { Kbd } from './primitives';

/**
 * 易混词块：人工高危清单优先，未命中时降级为「词形相近」。
 *
 * 两档的区别不在条数，而在**信息性质**：
 * - 人工清单给的是「区别在哪」——一条能背下来的线索 + 一组对比例句；
 * - 降级层只给「可能混」——词 + 中文，并明确写「未必是高频混淆」。
 *
 * 之所以保留降级层：只认人工清单时这块只覆盖 2.4% 的词，92% 的卡片背面直接空掉。
 */

const FALLBACK_LIMIT = 2;

export function ConfusableBlock({
  lemma,
  lapses,
  confusables = [],
  open,
  onToggle,
  onOpenWord,
}: {
  lemma: string;
  /** 该卡历史 lapse 次数：答错过的词允许多看一对 */
  lapses?: number;
  /** 数据包里的形近词（ETL 生成），只在没有人工高危对时降级使用 */
  confusables?: Confusable[];
  open: boolean;
  onToggle: () => void;
  onOpenWord: (lemma: string) => void;
}) {
  const pairs = confusablePairsFor(lemma, { lapses: lapses ?? 0 });
  const fallback = pairs.length === 0 ? confusables.slice(0, FALLBACK_LIMIT) : [];
  if (pairs.length === 0 && fallback.length === 0) return null;

  const curated = pairs.length > 0;

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label={curated ? '易混词' : '词形相近'}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-emphasize text-fg">{curated ? '易混词' : '词形相近'}</span>
          {curated ? (
            <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-2xs font-emphasize text-warning">
              {pairs.length} 对
            </span>
          ) : (
            <span className="text-2xs text-meta">拼写或读音接近，未必是高频混淆</span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? '收起' : '展开'} <Kbd>F</Kbd>
        </button>
      </header>

      {open ? (
        curated ? (
          <ul className="mt-2.5 flex flex-col gap-2.5">
            {pairs.map((pair) => (
              <li key={pair.other} className="rounded-lg border border-line bg-sunken p-2.5">
                <div className="flex flex-wrap items-baseline gap-1.5">
                  <span className="font-word text-sm font-emphasize text-fg">{pair.self}</span>
                  <span className="text-2xs text-meta">vs</span>
                  <button
                    type="button"
                    onClick={() => onOpenWord(pair.other)}
                    className="font-word text-sm font-emphasize text-fg-2 underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {pair.other}
                  </button>
                </div>
                <p className="mt-1 text-xs leading-body text-fg-2">{pair.cue}</p>
                <ul className="mt-1.5 flex flex-col gap-1 border-t border-line-soft pt-1.5">
                  {pair.examples.map((ex) => (
                    <li key={ex.en} className="text-2xs leading-snug">
                      <span className="font-word text-fg-2">{ex.en}</span>
                      <span className="ml-1 text-muted">{ex.zh}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {fallback.map((item) => (
              <li key={item.lemma} className="inline-flex items-baseline gap-1 rounded-lg border border-line bg-warm px-2 py-1">
                <button
                  type="button"
                  onClick={() => onOpenWord(item.lemma)}
                  className="font-word text-xs font-emphasize text-fg-2 underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  {item.lemma}
                </button>
                {item.cn ? <span className="text-2xs text-muted">{item.cn}</span> : null}
              </li>
            ))}
          </ul>
        )
      ) : null}
    </section>
  );
}
