import { useState } from 'react';
import type { ExamCode, Sense } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import { Badge, ProgressBar } from './primitives';
import { weightLabel } from './format';

/** 背面词典区（对齐原型）：义项权重 / 英文释义 双 Tab，覆盖该词全部义项。 */
export interface CardBackDictionaryProps {
  word: PackWord;
  sense: Sense;
  exam: ExamCode;
}

export function CardBackDictionary({ word, sense, exam }: CardBackDictionaryProps) {
  const [tab, setTab] = useState<'exam' | 'en'>('exam');
  const senses = [...word.senses]
    .filter((s) => s.examStats[exam])
    .sort((a, b) => (b.examStats[exam]?.senseWeight ?? 0) - (a.examStats[exam]?.senseWeight ?? 0));

  return (
    <section aria-label="义项与释义">
      <div className="mb-3 flex items-center gap-5 border-b border-line text-sm">
        {([
          ['exam', '义项权重（估计）'],
          ['en', '英文释义'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-selected={tab === key}
            role="tab"
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 pb-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              tab === key ? 'border-accent font-emphasize text-accent' : 'border-transparent text-muted hover:text-fg-2'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'exam' ? (
        <ul className="flex flex-col gap-2">
          {senses.map((s) => {
            const stat = s.examStats[exam]!;
            const current = s.id === sense.id;
            return (
              <li
                key={s.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-2.5 ${
                  current ? 'border-accent bg-accent-soft' : 'border-line bg-sunken'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm bg-surface px-1.5 py-0.5 font-word text-2xs font-emphasize text-muted">{s.pos}</span>
                  <span className="text-sm font-emphasize text-fg">{s.cn}</span>
                  {stat.isEccentric ? <Badge tone="danger">熟词僻义</Badge> : null}
                  {s.sentencePending ? <Badge tone="neutral">暂无语料例句</Badge> : null}
                  {current ? <span className="rounded-sm bg-accent px-1.5 py-0.5 text-2xs font-emphasize text-on-accent">本卡考点</span> : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-word text-2xs tabular-nums text-meta">{weightLabel(stat.senseWeight)}</span>
                  <span className="w-16 sm:w-24">
                    <ProgressBar value={stat.senseWeight} max={100} label={`${weightLabel(stat.senseWeight)}，满分 100`} />
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {senses.map((s, index) => (
            <li key={s.id} className="rounded-xl border border-line bg-sunken p-2.5 text-sm">
              <span className="font-word text-xs font-emphasize text-accent-soft-fg">
                {index + 1}. {s.pos}
              </span>{' '}
              <span className="font-emphasize text-fg">{s.cn}</span>
              <p className="mt-1 leading-snug text-muted">{s.enDef || '（暂无英文释义）'}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-2xs text-meta">权重为公开信号合成的估计值（满分 100），不是考试实测计数。</p>
    </section>
  );
}
