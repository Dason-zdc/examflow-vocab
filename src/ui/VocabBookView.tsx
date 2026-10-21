import { useMemo, useState } from 'react';
import type { Card, ExamCode, UserWordMeta } from '../domain/types';
import type { PackDictionary } from '../content/dictionary';
import type { ExamFlowDB } from '../storage/db';
import { useCardsForExam, useUserWordMeta } from '../app/queries';
import { resumeWord, setStarred } from '../app/userWordsUseCase';
import { Badge, Button } from './primitives';
import { ICON_SIZE, ICON_STROKE, RotateCcw, Star, Trash2 } from './icons';
import { formatMonthDay, kindLabel, stateLabel, weightLabel } from './format';

/** 词库与生词本（UIUX P3）：按词聚合卡片，筛选 + 星标 + 恢复已斩 + 重置进度 */

export interface VocabBookViewProps {
  db: ExamFlowDB;
  exam: ExamCode;
  dictionary: PackDictionary;
  onReset: () => Promise<void>;
  /** 头部搜索框带入的查询词（命中 lemma 前缀或包含） */
  initialQuery?: string;
}

type Filter = 'all' | 'starred' | 'suspended';

const FILTER_LABEL: Record<Filter, string> = { all: '全部', starred: '生词本', suspended: '已斩' };

export function VocabBookView({ db, exam, dictionary, onReset, initialQuery = '' }: VocabBookViewProps) {
  const cards = useCardsForExam(db, exam);
  const metas = useUserWordMeta(db);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const metaByWord = useMemo(() => {
    const m = new Map<string, UserWordMeta>();
    for (const row of metas ?? []) m.set(row.wordId, row);
    return m;
  }, [metas]);

  const groups = useMemo(() => groupByWord(cards ?? [], dictionary), [cards, dictionary]);

  const filtered = groups.filter((g) => {
    if (initialQuery) {
      const q = initialQuery.trim().toLowerCase();
      if (q && !g.lemma.toLowerCase().includes(q)) return false;
    }
    if (filter === 'starred') return metaByWord.get(g.wordId)?.starred === true;
    if (filter === 'suspended') return g.cards.every((c) => c.suspended);
    return true;
  });

  if (!cards || !metas) {
    return (
      <div className="flex flex-col gap-3" aria-busy>
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-warm" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center gap-2">
        <div>
          <h1 className="text-2xl font-emphasize text-fg">词库与生词本</h1>
          <p className="text-sm text-muted">每个词按义项拆成主义项卡与熟词僻义卡分别调度。</p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line-strong" role="tablist" aria-label="筛选">
            {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => setFilter(f)}
                className={`min-h-11 px-3 text-sm transition-colors duration-150 first:rounded-l-md last:rounded-r-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  filter === f ? 'bg-accent-soft text-accent-soft-fg' : 'text-muted hover:bg-warm'
                }`}
              >
                {FILTER_LABEL[f]}
              </button>
            ))}
          </div>
          {confirmingReset ? (
            <span className="flex items-center gap-2" role="alert">
              <span className="text-xs text-danger">将删除该考试全部学习记录，不可恢复。确认？</span>
              <Button
                variant="danger"
                loading={resetting}
                onClick={() => {
                  setResetting(true);
                  void onReset().finally(() => {
                    setResetting(false);
                    setConfirmingReset(false);
                  });
                }}
              >
                确认重置
              </Button>
              <Button variant="ghost" onClick={() => setConfirmingReset(false)}>
                取消
              </Button>
            </span>
          ) : (
            <Button variant="ghost" onClick={() => setConfirmingReset(true)}>
              <Trash2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
              重置学习进度
            </Button>
          )}
        </div>
      </header>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-10 text-center text-sm text-muted">
          {filter === 'starred' ? '还没有加入生词本的词。在学习页点词头旁的星标即可加入。' : filter === 'suspended' ? '没有已斩的词' : '还没有学习记录，开始今天的第一张卡'}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg border border-line bg-surface">
          {filtered.map((g) => (
            <li key={g.wordId} className="flex flex-wrap items-start gap-3 px-4 py-3 transition-colors duration-150 hover:bg-warm">
              <div className="flex min-w-48 flex-1 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-word text-lg font-emphasize text-fg">{g.lemma}</span>
                  <span className="font-word text-xs text-muted">/{g.phonetic}/</span>
                  <Badge tone="neutral">{weightLabel(g.topWeight)}</Badge>
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {g.cards.map((c) => (
                    <li key={c.id} className="text-xs text-muted">
                      <span className={c.suspended ? 'line-through' : ''}>
                        {kindLabel(c)} · {senseCn(c, dictionary)} · {stateLabel(c.fsrs.state)} · S {Math.round(c.fsrs.stability)}d · 到期 {formatMonthDay(c.fsrs.due.getTime())}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex items-center">
                {g.cards.every((c) => c.suspended) ? (
                  <button
                    type="button"
                    onClick={() => void resumeWord(db, g.wordId)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm text-muted transition-colors duration-150 hover:bg-warm hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <RotateCcw size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
                    恢复
                  </button>
                ) : null}
                <StarToggle db={db} wordId={g.wordId} starred={metaByWord.get(g.wordId)?.starred === true} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function senseCn(card: Card, dictionary: PackDictionary): string {
  const word = dictionary.getWord(card.wordId);
  const sense = word?.senses.find((s) => s.id === card.senseId);
  const cn = sense?.cn ?? '词条缺失';
  return cn.length > 8 ? `${cn.slice(0, 8)}…` : cn;
}

function StarToggle({ db, wordId, starred }: { db: ExamFlowDB; wordId: string; starred: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={starred ? '取消生词本标记' : '加入生词本'}
      aria-pressed={starred}
      title={starred ? '取消生词本标记' : '加入生词本'}
      onClick={() => {
        setBusy(true);
        void setStarred(db, wordId, !starred).finally(() => setBusy(false));
      }}
      className={`inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${starred ? 'text-warning' : 'text-muted'}`}
    >
      <Star size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} fill={starred ? 'currentColor' : 'none'} aria-hidden />
    </button>
  );
}

interface WordGroup {
  wordId: string;
  lemma: string;
  phonetic: string;
  topWeight: number;
  cards: Card[];
}

function groupByWord(cards: Card[], dictionary: PackDictionary): WordGroup[] {
  const byWord = new Map<string, Card[]>();
  for (const c of cards) {
    const list = byWord.get(c.wordId);
    if (list) list.push(c);
    else byWord.set(c.wordId, [c]);
  }
  const groups: WordGroup[] = [];
  for (const [wordId, list] of byWord) {
    const word = dictionary.getWord(wordId);
    let topWeight = 0;
    for (const c of list) {
      const sense = word?.senses.find((s) => s.id === c.senseId);
      const w = sense?.examStats[c.exam]?.senseWeight ?? 0;
      if (w > topWeight) topWeight = w;
    }
    groups.push({
      wordId,
      lemma: word?.lemma ?? wordId,
      phonetic: word?.phoneticUk || word?.phoneticUs || '',
      topWeight,
      cards: [...list].sort((a, b) => a.senseId.localeCompare(b.senseId)),
    });
  }
  return groups.sort((a, b) => b.topWeight - a.topWeight || a.lemma.localeCompare(b.lemma));
}
