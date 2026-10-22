import { useState } from 'react';
import type { Derivative, WordFamily } from '../domain/types';
import { Kbd } from './primitives';

/** 背面「同源词群」（P1-5）：以词根为轴「一次记一串」，与形近词的「防错」职责分开。 */
export interface CardBackFamiliesProps {
  family?: WordFamily;
  derivatives?: Derivative[];
  onOpenWord: (lemma: string) => void;
  onAddWord?: (lemma: string, cn: string) => void;
}

export function CardBackFamilies({ family, derivatives, onOpenWord, onAddWord }: CardBackFamiliesProps) {
  const [open, setOpen] = useState(true);
  if (!family || family.members.length === 0) {
    return null;
  }
  const derived = (derivatives ?? []).filter((d) => d.kind === 'DERIVATION');

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label="同源词群">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-2xs font-emphasize text-accent-soft-fg">同源词群</span>
          <span className="font-word text-sm font-emphasize text-fg">{family.root}</span>
          <span className="text-sm text-muted">{family.rootMeaning}</span>
          {family.origin ? <span className="text-2xs text-meta">{family.origin}</span> : null}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? '收起' : `展开 ${family.members.length} 个`} <Kbd>T</Kbd>
        </button>
      </header>

      {open ? (
        <ul className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
          {family.members.map((m) => (
            <li key={m.lemma} className="rounded-lg border border-line-soft bg-sunken p-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenWord(m.lemma)}
                    className="font-word text-sm font-emphasize text-fg transition-colors duration-150 hover:text-accent-soft-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {m.lemma}
                  </button>
                  {m.pos ? <span className="text-2xs text-meta">{m.pos}</span> : null}
                  <span className="text-xs text-muted">{m.cn}</span>
                </div>
                {onAddWord ? (
                  <button
                    type="button"
                    onClick={() => onAddWord(m.lemma, m.cn)}
                    className="rounded-md border border-line px-1.5 py-0.5 text-2xs text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    加入生词本
                  </button>
                ) : null}
              </div>
              {m.formula ? <p className="mt-1 text-2xs leading-snug text-meta">{m.formula}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {derived.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line-soft pt-2">
          <span className="text-2xs font-emphasize text-meta">派生词</span>
          {derived.slice(0, 6).map((d) => (
            <button
              key={d.lemma}
              type="button"
              onClick={() => onOpenWord(d.lemma)}
              className="rounded-lg border border-line bg-warm px-2 py-0.5 text-2xs transition-colors duration-150 hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <strong className="font-word text-fg-2">{d.lemma}</strong>
              {d.cn ? <span className="ml-1 text-muted">{d.cn}</span> : null}
            </button>
          ))}
        </div>
      ) : null}

      <p className="mt-2 text-2xs text-meta">
        同源词由词根表按词素边界匹配后从词典召回，按常用度排序；公式只用可查到的词根与词缀成分。
      </p>
    </section>
  );
}
