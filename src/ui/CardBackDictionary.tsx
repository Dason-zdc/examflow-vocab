import { useState } from 'react';
import type { ExamCode, Sense } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import { Badge, ProgressBar } from './primitives';
import { weightLabel } from './format';

/** 背面词典区（P0-3 收敛）：按词性合并的义项一行展示，权重与英文释义收进「详情」，空值不渲染占位。 */
export interface CardBackDictionaryProps {
  word: PackWord;
  sense: Sense;
  exam: ExamCode;
}

export function CardBackDictionary({ word, sense, exam }: CardBackDictionaryProps) {
  const [open, setOpen] = useState(false);
  const senses = [...word.senses]
    .filter((s) => s.examStats[exam])
    .sort((a, b) => (b.examStats[exam]?.senseWeight ?? 0) - (a.examStats[exam]?.senseWeight ?? 0));

  return (
    <section aria-label="义项与释义">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-emphasize text-meta">释义（按词性）</h3>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="rounded-sm text-2xs text-accent transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? '收起权重' : '详情'}
        </button>
      </div>

      <ul className="flex flex-col gap-1.5">
        {senses.map((s) => {
          const stat = s.examStats[exam]!;
          const current = s.id === sense.id;
          return (
            <li
              key={s.id}
              className={`rounded-lg px-2 py-1.5 ${current ? 'bg-accent-soft' : ''}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-sm bg-surface px-1.5 py-0.5 font-word text-2xs font-emphasize text-muted">{s.pos}</span>
                <span className={`text-sm font-emphasize ${current ? 'text-accent-soft-fg' : 'text-fg'}`}>{s.cn}</span>
                {stat.isEccentric ? <Badge tone="danger">熟词僻义</Badge> : null}
                {s.sentencePending ? <Badge tone="neutral">暂无语料例句</Badge> : null}
                {current ? (
                  <span className="rounded-sm bg-accent px-1.5 py-0.5 text-2xs font-emphasize text-on-accent">本卡考点</span>
                ) : null}
              </div>
              {open ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-2 border-t border-line-soft pt-1.5">
                  <span className="font-word text-2xs tabular-nums text-meta">{weightLabel(stat.senseWeight)}</span>
                  <span className="w-24 shrink-0">
                    <ProgressBar value={stat.senseWeight} max={100} label={`${weightLabel(stat.senseWeight)}，满分 100`} />
                  </span>
                  {s.enDef ? (
                    <span className="flex-1 text-2xs italic leading-snug text-muted">{s.enDef}</span>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-2 text-2xs text-meta">权重为公开信号合成的估计值（满分 100），不是考试实测计数。</p>
    </section>
  );
}
