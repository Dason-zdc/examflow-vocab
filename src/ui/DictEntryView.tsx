import type { DictEntry } from '../content/dict';
import { Badge } from './primitives';
import { rankLabel } from './format';

/**
 * 词典条目展示（数据包外的词靠它兜底）。
 * 与卡片背面的区别：这里只有「这个词是什么意思」，没有义项权重与例句，
 * 所以明确标注来源，避免被误当成学习词条。
 */
export function DictEntryView({ entry, compact = false }: { entry: DictEntry; compact?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-word text-2xl font-emphasize text-fg">{entry.lemma}</span>
        {entry.phonetic ? <span className="font-word text-sm text-muted">/{entry.phonetic}/</span> : null}
        <Badge tone="neutral">词典</Badge>
        <span className="text-2xs text-meta">{rankLabel(entry.rank)}</span>
      </div>

      {entry.inflected && entry.surface !== entry.lemma ? (
        <p className="text-2xs text-muted">
          查询词形 {entry.surface} → 原形 {entry.lemma}
        </p>
      ) : null}

      <ul className={compact ? 'flex flex-col gap-1' : 'flex flex-col gap-2'}>
        {entry.senses.map((sense, i) => (
          <li key={`${sense.pos}-${i}`} className="flex flex-wrap items-baseline gap-2">
            {sense.pos ? <span className="font-word text-sm text-muted">{sense.pos}</span> : null}
            <span className="text-md leading-body text-fg-2">{sense.cn}</span>
          </li>
        ))}
      </ul>

      <p className="text-2xs text-meta">来自 ECDICT 全量词典，未收录进当前考试词包，不计入学习计划。</p>
    </div>
  );
}
