import type { SynonymGroup } from '../domain/types';
import { rewritesFor } from '../content/ieltsRewrites';

/**
 * 同义替换块：人工改写种子优先，回退 WordNet 义项级同义。
 *
 * 义项对齐是这里最容易出错的地方：ECDICT 的 sense 比 WordNet synset 粗
 * （一个词性、多义合并），同一 sense 下会挂多个 synset。`conclude`（结束、作结论、推断）
 * 就因此同时挂上了 reason 与 resolve。解决办法是用 sense.enDef 与 gloss 的实词重叠
 * 选出真正对应的一组，而不是把所有组平铺。
 *
 * 徽章只保留「需改写」；搭配不符用中性灰标「搭配不同」并把理由带出来——
 * 去掉徽章不等于去掉否定信息。
 */

export function IeltsRewriteBlock({
  lemma,
  senseCn,
  enDef = '',
  groups = [],
  onOpenWord,
}: {
  lemma: string;
  senseCn: string;
  /**
   * 该义项的英文释义。ECDICT 的 sense 比 WordNet synset 粗（一个词性多义合并），
   * 同一 sense 下会挂多个 synset；用 enDef 与 gloss 的实词重叠挑出真正对应的那一组，
   * 否则会出现 conclude 挂 reason / resolve 这种跨义项的候选。
   */
  enDef?: string;
  /** 数据包里的义项级同义 */
  groups?: SynonymGroup[];
  onOpenWord?: (lemma: string) => void;
}) {
  const curated = rewritesFor(lemma, senseCn);
  const fallback = candidatesFrom(groups, enDef);

  if (curated.length === 0 && fallback.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface p-4" aria-label="同义替换">
      <header className="flex flex-wrap items-baseline gap-2">
        <span className="text-sm font-emphasize text-fg">同义替换</span>
        <span className="text-2xs text-meta">按义项 · 标「需改写」的句子结构要动</span>
      </header>

      {curated.length > 0 ? (
        <ul className="mt-2 flex flex-col gap-1.5">
          {curated.map((item) => (
            <li key={item.phrase} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs">
              <span className="font-word font-emphasize text-fg-2">{item.phrase}</span>
              <span className="text-muted">{item.cn}</span>
              {item.needRewrite ? (
                <span className="rounded-sm bg-warning-soft px-1 text-2xs font-emphasize text-warning">需改写</span>
              ) : null}
              {item.note ? <span className="text-2xs text-meta">{item.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {fallback.length > 0 ? (
        <div className={curated.length > 0 ? 'mt-2 border-t border-line-soft pt-2' : 'mt-2'}>
          {fallback.map((group) => (
            <div key={group.gloss} className="flex flex-col gap-1 py-0.5">
              <div className="flex flex-wrap items-baseline gap-1.5 text-2xs text-meta">
                <span className="font-emphasize">{group.gloss}</span>
                {group.frame ? <span className="rounded-sm bg-sunken px-1 font-word">+ {group.frame}</span> : null}
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {group.items.map((item) => (
                  <li
                    key={`${group.gloss}-${item.phrase}`}
                    className="flex flex-col gap-0.5 rounded-lg border border-line bg-warm px-2 py-1"
                  >
                    <span className="flex flex-wrap items-baseline gap-1">
                      <button
                        type="button"
                        onClick={() => onOpenWord?.(item.phrase)}
                        className="font-word text-xs font-emphasize text-fg-2 underline decoration-dotted underline-offset-2 transition-colors duration-150 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      >
                        {item.phrase}
                      </button>
                      {item.cn ? <span className="text-2xs text-muted">{item.cn}</span> : null}
                      {item.needRewrite ? (
                        <span className="rounded-sm bg-warning-soft px-1 text-2xs font-emphasize text-warning">需改写</span>
                      ) : null}
                      {item.conflict ? (
                        <span className="rounded-sm bg-sunken px-1 text-2xs text-meta">搭配不同</span>
                      ) : null}
                    </span>
                    {item.note ? <span className="text-2xs leading-snug text-meta">{item.note}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <p className="mt-1.5 text-2xs leading-snug text-meta">
        {curated.length > 0
          ? '人工整理的写作改写，短语可直接替换；标「需改写」的要调整介词或句法。'
          : '候选来自 WordNet 义项级同义，按义项分组；「需改写」表示原句不能直接替换。'}
      </p>
    </section>
  );
}

interface FallbackGroup {
  gloss: string;
  frame?: string;
  items: Array<{ phrase: string; cn?: string; needRewrite?: boolean; conflict?: boolean; note?: string }>;
}

const MAX_GROUPS = 2;
const MAX_ITEMS_PER_GROUP = 2;

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'with', 'by', 'or', 'and', 'be', 'is', 'are',
  'was', 'were', 'that', 'this', 'it', 'for', 'from', 'as', 'at', 'into', 'about', 'after',
  'before', 'over', 'under', 'not', 'no', 'one', 'some', 'their', 'its',
]);

function tokens(text: string): Set<string> {
  const words = (text || '').toLowerCase().match(/[a-z]+/g) ?? [];
  return new Set(words.filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

/** enDef 与 gloss 的实词重叠数，用来判断这组同义属于哪个细分义项 */
function relevance(enDef: string, gloss: string): number {
  const a = tokens(enDef);
  const b = tokens(gloss);
  let hit = 0;
  for (const word of a) if (b.has(word)) hit += 1;
  return hit;
}

/**
 * 优先「需改写」（有模板、信息量最大），再按义项顺序补 DIRECT。
 * 组本身先按 enDef 相关性挑：只保留得分最高的一组（并列时最多两组）；
 * 全部为 0 说明 enDef 缺失或与 WordNet 措辞对不上——此时退回第一组，不臆测。
 */
function candidatesFrom(groups: SynonymGroup[], enDef: string): FallbackGroup[] {
  if (groups.length === 0) return [];
  const scored = groups.map((group) => ({ group, score: enDef ? relevance(enDef, group.gloss) : 0 }));
  const best = Math.max(...scored.map((entry) => entry.score));
  const picked = best > 0 ? scored.filter((entry) => entry.score === best) : [scored[0]!];

  const out: FallbackGroup[] = [];
  for (const { group } of picked) {
    const ordered = [...group.candidates].sort((a, b) => rank(a.status) - rank(b.status));
    const items = ordered.slice(0, MAX_ITEMS_PER_GROUP).map((cand) => ({
      phrase: cand.lemma,
      ...(cand.cn ? { cn: cand.cn } : {}),
      ...(cand.status === 'REWRITE' ? { needRewrite: true } : {}),
      // 搭配不符必须把理由带出来，否则 close 会被当成「可以直接换」
      ...(cand.status === 'CONFLICT' ? { conflict: true } : {}),
      ...(cand.note ? { note: cand.note } : cand.rewrite ? { note: cand.rewrite } : {}),
    }));
    if (items.length === 0) continue;
    out.push({
      gloss: group.gloss,
      ...(group.frame ? { frame: group.frame } : {}),
      items,
    });
    if (out.length >= MAX_GROUPS) break;
  }
  return out;
}

function rank(status: string): number {
  if (status === 'REWRITE') return 0;
  if (status === 'DIRECT') return 1;
  if (status === 'INFERRED') return 2;
  if (status === 'CONFLICT') return 3;
  return 4;
}
