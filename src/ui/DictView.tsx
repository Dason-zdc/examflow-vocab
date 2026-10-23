import { useEffect, useState } from 'react';
import type { ExamCode } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import { addCustomWord } from '../app/customWordsUseCase';
import { fullDictionary, type DictEntry, type FullDictionary } from '../content/dict';
import { Badge, Button } from './primitives';
import { DictEntryView } from './DictEntryView';

/**
 * 词典页（全量查词）：44k 词条按首字母分片，搜索只命中一个分片。
 * 与「词库与生词本」的区别：那边是学习计划里的卡，这边是任意词的释义；
 * 词包外的词可以一键加入生词本（转成 CUSTOM 卡）。
 */

export interface DictViewProps {
  db: ExamFlowDB;
  exam: ExamCode;
  /** 数据包已收录的判定：这些词不该重复加生词本 */
  inPack: (lemma: string) => boolean;
  /** 头部搜索框带入的查询词 */
  initialQuery?: string;
  dict?: FullDictionary;
}

const PAGE = 100;

export function DictView({ db, exam, inPack, initialQuery = '', dict = fullDictionary }: DictViewProps) {
  const [query, setQuery] = useState(initialQuery);
  const [letter, setLetter] = useState('a');
  const [letters, setLetters] = useState<Array<{ id: string; entries: number }>>([]);
  const [entries, setEntries] = useState<DictEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DictEntry | null>(null);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    void dict.letters().then((rows) => {
      if (alive) setLetters(rows);
    });
    void dict.size().then((n) => {
      if (alive) setCount(n);
    });
    return () => {
      alive = false;
    };
  }, [dict]);

  useEffect(() => {
    const q = query.trim();
    let alive = true;
    setLoading(true);
    setError(null);
    const task = q ? dict.search(q, 30) : dict.browse(letter, 0, PAGE);
    void task
      .then((result) => {
        if (!alive) return;
        if (Array.isArray(result)) {
          setEntries(result);
          setTotal(result.length);
        } else {
          setEntries(result.entries);
          setTotal(result.total);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!alive) return;
        setError('词典加载失败：请检查网络，或稍后重试。');
        setEntries([]);
        setTotal(0);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [query, letter, dict]);

  async function loadMore() {
    const next = await dict.browse(letter, entries.length, PAGE);
    setEntries((prev) => [...prev, ...next.entries]);
    setTotal(next.total);
  }

  async function add(entry: DictEntry) {
    await addCustomWord(
      db,
      { lemma: entry.lemma, phonetic: entry.phonetic, cn: entry.senses.map((s) => `${s.pos} ${s.cn}`.trim()).join('；') },
      exam,
    );
    setAdded(entry.lemma);
  }

  const activeLetter = query.trim() ? '' : letter;

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-emphasize text-fg">词典</h2>
          <span className="text-xs text-muted">
            {count > 0 ? `全量 ${count.toLocaleString('zh-CN')} 词 · 按首字母分片加载` : '正在读取词典索引…'}
          </span>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          placeholder="查任意单词（支持前缀，如 tram）"
          aria-label="查任意单词"
          className="mt-3 h-11 w-full rounded-lg border border-line-strong bg-surface px-3 text-md text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
        {!query.trim() ? (
          <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="按首字母浏览">
            {letters.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={activeLetter === item.id}
                onClick={() => {
                  setLetter(item.id);
                  setSelected(null);
                }}
                className={`h-8 min-w-8 rounded-md px-1 text-xs font-word transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  activeLetter === item.id ? 'bg-accent-soft text-accent-soft-fg' : 'text-muted hover:bg-warm hover:text-fg-2'
                }`}
              >
                {item.id === '_' ? '其它' : item.id.toUpperCase()}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[5fr_6fr]">
        <section className="flex flex-col gap-2" aria-busy={loading}>
          {error ? <p className="rounded-lg bg-warning-soft px-3 py-2 text-sm text-warning">{error}</p> : null}
          {loading ? <p className="px-1 py-6 text-center text-sm text-muted">正在加载词条…</p> : null}
          {!loading && entries.length === 0 && !error ? (
            <p className="px-1 py-6 text-center text-sm text-muted">没有匹配「{query.trim()}」的词条</p>
          ) : null}
          <ul className="flex flex-col divide-y divide-line-soft overflow-hidden rounded-xl border border-line bg-surface">
            {entries.map((entry) => (
              <li key={entry.lemma}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(entry);
                    setAdded(null);
                  }}
                  aria-current={selected?.lemma === entry.lemma ? 'true' : undefined}
                  className={`flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                    selected?.lemma === entry.lemma ? 'bg-accent-soft' : 'hover:bg-warm'
                  }`}
                >
                  <span className="flex flex-wrap items-baseline gap-2">
                    <span className="font-word text-sm font-emphasize text-fg">{entry.lemma}</span>
                    {entry.phonetic ? <span className="font-word text-2xs text-meta">/{entry.phonetic}/</span> : null}
                  </span>
                  <span className="line-clamp-1 text-xs text-muted">
                    {entry.senses[0]?.pos} {entry.senses[0]?.cn}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {!query.trim() && entries.length < total ? (
            <Button variant="ghost" onClick={() => void loadMore()}>
              继续加载（{entries.length} / {total}）
            </Button>
          ) : null}
        </section>

        <section className="rounded-xl border border-line bg-surface p-4">
          {selected ? (
            <div className="flex flex-col gap-3">
              <DictEntryView entry={selected} />
              <div className="flex items-center gap-2 border-t border-line-soft pt-3">
                {inPack(selected.lemma) ? (
                  <Badge tone="info">已在当前考试词库</Badge>
                ) : added === selected.lemma ? (
                  <Badge tone="success">已加入生词本</Badge>
                ) : (
                  <Button variant="primary" onClick={() => void add(selected)}>
                    加入生词本
                  </Button>
                )}
                <span className="text-2xs text-meta">加入后会生成自定义卡，按新卡队列复习。</span>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-muted">选择左侧词条查看完整释义</p>
          )}
        </section>
      </div>
    </div>
  );
}
