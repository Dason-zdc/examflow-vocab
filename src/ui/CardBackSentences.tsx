import { useState } from 'react';
import type { PackWord } from '../content/packVerifier';
import { SentenceTokens } from './SentenceTokens';
import { ICON_SIZE, ICON_STROKE, Volume2 } from './icons';
import { speak } from './speech';
import { isCorpusSentence, sentenceSourceLabel, tatoebaUrl } from './sentenceSource';

/** 背面例句区（P0-4 降噪）：每句可点词查询、可朗读；第二条起默认折叠，溯源编号收进 tooltip。 */
export interface CardBackSentencesProps {
  word: PackWord;
  currentSenseId: string;
  accent: 'uk' | 'us';
  onWord: (surface: string) => void;
}

export function CardBackSentences({ word, currentSenseId, accent, onWord }: CardBackSentencesProps) {
  const [expanded, setExpanded] = useState(false);
  const sentences = [...word.sentences].sort(
    (a, b) => Number(b.senseId === currentSenseId) - Number(a.senseId === currentSenseId),
  );
  const hasCorpus = sentences.some((s) => isCorpusSentence(s.provenance));
  const visible = expanded ? sentences : sentences.slice(0, 1);
  const hiddenCount = sentences.length - visible.length;

  return (
    <section className="rounded-xl border border-line bg-sunken p-4" aria-label="例句">
      <h3 className="mb-3 text-xs font-emphasize text-meta">例句（点击任意单词查词）</h3>
      {sentences.length === 0 ? (
        <p className="text-sm text-meta">
          该词暂无可溯源的语料例句。数据包 v1.3 起不再用模板句填充，宁缺毋滥。
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((sentence, index) => {
            const sense = word.senses.find((s) => s.id === sentence.senseId);
            const current = sentence.senseId === currentSenseId;
            const adapted = sentence.provenance.type === 'ADAPTED' ? sentence.provenance : null;
            const tip = adapted && adapted.sourceId
              ? `${sentenceSourceLabel(sentence.provenance)} · ${tatoebaUrl(adapted.sourceId)}`
              : sentenceSourceLabel(sentence.provenance);
            return (
              <li key={sentence.id} className={index > 0 ? 'border-t border-line-soft pt-3' : ''}>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    {sense ? (
                      <span
                        className={`rounded-sm px-2 py-0.5 text-2xs font-emphasize ${
                          current ? 'bg-accent text-on-accent' : 'bg-accent-soft text-accent-soft-fg'
                        }`}
                      >
                        {sense.pos} {sense.cn}
                      </span>
                    ) : null}
                    <span className="text-2xs text-meta" title={tip}>
                      {sentenceSourceLabel(sentence.provenance)}
                      {adapted && adapted.sourceId ? <span className="ml-1">#{adapted.sourceId}</span> : null}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => speak(sentence.en, accent)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Volume2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
                    朗读
                  </button>
                </div>
                <p className="text-sm leading-body text-fg-2 sm:text-base">
                  <SentenceTokens en={sentence.en} surface={sentence.surfaceForm} onWord={onWord} />
                </p>
                {sentence.zh ? <p className="mt-1 text-xs text-muted sm:text-sm">{sentence.zh}</p> : null}
              </li>
            );
          })}
        </ul>
      )}

      {hiddenCount > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-3 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {expanded ? '收起' : `展开其余 ${hiddenCount} 条例句`}
        </button>
      ) : null}

      {hasCorpus ? (
        <p className="mt-3 border-t border-line-soft pt-2 text-2xs text-meta">
          例句来自 Tatoeba 语料（CC BY 2.0 FR，真实人工撰写与翻译），编号可溯源。
        </p>
      ) : null}
    </section>
  );
}
