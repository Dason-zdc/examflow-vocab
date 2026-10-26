import { useEffect, useMemo, useState } from 'react';
import type { ExamCode } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import { addCustomWord } from '../app/customWordsUseCase';
import { rootFamilies, RootFamilyIndex, type RootFamily, type RootFamilyWord } from '../content/rootFamilies';
import { Badge } from './primitives';

/**
 * 词根库（织网入口）：把构建期生成的 242 个词根家族摊开。
 *
 * 为什么单独做一页：卡片背面的四步法只覆盖能完整切分的词（23.4%），
 * 但「1 个词根 = 记一串词」这件事本身不依赖当前词——用户可以按词根浏览、
 * 搜索中文义，再把家族里的词加进生词本。
 */

export interface RootsViewProps {
  db: ExamFlowDB;
  exam: ExamCode;
  /** 数据包已收录的词不重复加入生词本 */
  inPack: (lemma: string) => boolean;
  /** 测试可注入；默认用应用内共享索引 */
  index?: RootFamilyIndex;
}

function countWords(families: RootFamily[]): number {
  return families.reduce((sum, f) => sum + f.words.length, 0);
}

export function RootsView({ db, exam, inPack, index = rootFamilies }: RootsViewProps) {
  const [families, setFamilies] = useState<RootFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [added, setAdded] = useState<Record<string, true>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void index
      .load()
      .then((map) => {
        if (!alive) return;
        const list = [...map.values()].sort(
          (a, b) => b.words.length - a.words.length || a.root.localeCompare(b.root),
        );
        setFamilies(list);
        setSelected((prev) => prev ?? list[0]?.root ?? null);
        setError(list.length === 0 ? '词根索引暂不可用，请检查网络后重试。' : null);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [index]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return families;
    return families.filter(
      (f) => f.root.includes(q) || f.cn.includes(q) || f.words.some((w) => w.lemma.includes(q)),
    );
  }, [families, query]);

  const current = filtered.find((f) => f.root === selected) ?? filtered[0] ?? null;

  async function add(word: RootFamilyWord) {
    await addCustomWord(db, { lemma: word.lemma, cn: word.cn }, exam);
    setAdded((prev) => ({ ...prev, [word.lemma]: true }));
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-emphasize text-fg">词根库</h2>
          <span className="text-xs text-muted">
            {families.length > 0
              ? `${families.length} 个词根 · ${countWords(families)} 个同根词 · 按家族大小排序`
              : '正在读取词根索引…'}
          </span>
        </div>
        <p className="mt-1 text-xs leading-snug text-muted">
          一个词根串起一串词。搜词根、搜中文义，或搜家族里的任意单词。
        </p>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜词根 / 中文义 / 同根词，如 dict、说、predict"
          aria-label="搜索词根"
          className="mt-3 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-md text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </section>

      {error ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{error}</p> : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_6fr]">
        <section className="flex flex-col gap-2" aria-busy={loading} aria-label="词根列表">
          {loading ? <p className="px-1 py-6 text-center text-sm text-muted">正在加载词根索引…</p> : null}
          {!loading && filtered.length === 0 && !error ? (
            <p className="px-1 py-6 text-center text-sm text-muted">没有匹配「{query.trim()}」的词根</p>
          ) : null}
          <ul className="flex max-h-[36rem] flex-col divide-y divide-line-soft overflow-auto rounded-xl border border-line bg-surface">
            {filtered.map((family) => (
              <li key={family.root}>
                <button
                  type="button"
                  onClick={() => setSelected(family.root)}
                  aria-current={current?.root === family.root ? 'true' : undefined}
                  className={`flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    current?.root === family.root ? 'bg-accent-soft' : 'hover:bg-warm'
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-word text-sm font-emphasize text-fg">{family.root}</span>
                    <span className="text-xs text-fg-2">{family.cn}</span>
                    <Badge tone="neutral">{family.words.length} 词</Badge>
                  </span>
                  <span className="line-clamp-1 text-2xs text-meta">
                    {family.words.slice(0, 4).map((w) => w.lemma).join(' / ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-line bg-surface p-4" aria-label="词根详情">
          {current ? <RootDetail family={current} inPack={inPack} added={added} onAdd={add} /> : (
            <p className="py-10 text-center text-sm text-muted">选择左侧词根查看同根词网</p>
          )}
        </section>
      </div>
    </div>
  );
}

function RootDetail({
  family,
  inPack,
  added,
  onAdd,
}: {
  family: RootFamily;
  inPack: (lemma: string) => boolean;
  added: Record<string, true>;
  onAdd: (word: RootFamilyWord) => Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2 border-b border-line-soft pb-3">
        <span className="font-word text-xl font-emphasize text-fg">{family.root}</span>
        <span className="text-md text-fg-2">{family.cn}</span>
        {family.origin ? <span className="text-2xs text-meta">源自{family.origin}</span> : null}
        <Badge tone="accent">{family.words.length} 个同根词</Badge>
      </div>

      <ul className="flex flex-col divide-y divide-line-soft">
        {family.words.map((word) => (
          <li key={word.lemma} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-2">
            <span className="font-word text-sm font-emphasize text-fg">{word.lemma}</span>
            {word.pos ? <span className="font-word text-2xs text-meta">{word.pos}</span> : null}
            <span className="text-sm text-fg-2">{word.cn}</span>
            <span className="ml-auto">
              {inPack(word.lemma) ? (
                <Badge tone="info">词库内</Badge>
              ) : added[word.lemma] ? (
                <Badge tone="success">已加入</Badge>
              ) : (
                <button
                  type="button"
                  onClick={() => void onAdd(word)}
                  aria-label={`加入生词本 ${word.lemma}`}
                  className="rounded-md border border-line px-2 py-1 text-2xs text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  加入生词本
                </button>
              )}
            </span>
            {word.formula ? <p className="w-full text-2xs text-meta">{word.formula}</p> : null}
          </li>
        ))}
      </ul>

      <p className="text-2xs leading-snug text-meta">
        公式只用词根表里可查到的成分拼接；同根词按词典常用度排序，已折叠同一派生链（如 predict / prediction）。
      </p>
    </div>
  );
}
