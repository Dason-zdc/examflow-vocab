import type { SynonymGroup, SynonymStatus } from '../domain/types';
import type { BadgeTone } from './primitives';
import { Badge } from './primitives';

/**
 * 义项级同义替换（US-08）。
 *
 * 旧实现把同义集成员压成一个词级列表，用户看到 `lie`「躺着」`dwell`「居住」并列，
 * 却不知道它们只对 `consist in` 成立、更看不到 `consist of` 的正确答案 `comprise`。
 * 这里按 WordNet 义项分组：每组一个释义 + 一个搭配框架，候选标注能否直接替换。
 */
const STATUS_META: Record<SynonymStatus, { label: string; tone: BadgeTone; hint: string }> = {
  DIRECT: { label: '可替换', tone: 'success', hint: '同一义项，语料与官方框架都没有冲突' },
  INFERRED: { label: '框架一致', tone: 'info', hint: '语料未覆盖该词形，但官方句法框架与该义项一致' },
  REWRITE: { label: '需改写', tone: 'warn', hint: '同一义项，但介词或及物性与原句不同' },
  CONFLICT: { label: '搭配不符', tone: 'danger', hint: '该义项的语料显示它用别的介词，不能原句替换' },
  UNKNOWN: { label: '待验证', tone: 'neutral', hint: '语料与官方框架都不足以判断' },
};

export function SynonymGroups({ groups, onOpenWord }: { groups: SynonymGroup[]; onOpenWord: (lemma: string) => void }) {
  if (groups.length === 0) {
    return <span className="text-xs text-meta">该义项暂无同义替换数据</span>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      {groups.map((group) => (
        <div key={group.synset} className="flex flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-1.5 text-2xs text-meta">
            <span className="font-emphasize">{group.gloss}</span>
            {group.frame ? <span className="rounded-sm bg-sunken px-1 font-word">+ {group.frame}</span> : null}
          </div>
          {group.candidates.map((cand) => {
            const meta = STATUS_META[cand.status];
            return (
              <div key={cand.lemma} className="rounded-lg border border-line bg-warm px-2 py-1" title={meta.hint}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {cand.inPack ? (
                    <button
                      type="button"
                      onClick={() => onOpenWord(cand.lemma)}
                      className="font-word text-xs font-emphasize text-fg-2 underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {cand.lemma}
                    </button>
                  ) : (
                    <span className="font-word text-xs font-emphasize text-fg-2">{cand.lemma}</span>
                  )}
                  <span className="text-2xs text-meta">{cand.pos}</span>
                  {cand.cn ? <span className="text-2xs text-muted">{cand.cn}</span> : null}
                  <Badge tone={meta.tone}>{meta.label}</Badge>
                </div>
                {cand.rewrite ? <div className="mt-0.5 font-word text-2xs text-fg-2">{cand.rewrite}</div> : null}
                {cand.note ? <div className="mt-0.5 text-2xs leading-snug text-muted">{cand.note}</div> : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
