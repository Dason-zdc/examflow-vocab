import { useEffect, useState } from 'react';
import type { Card, RatingCode } from '../domain/types';
import type { PendingReview } from '../domain/reviewCommitter';
import type { RequeueResult } from '../domain/sessionQueue';
import type { SessionCardView } from '../app/sessionBuilder';
import { Badge, Button, ProgressBar } from './primitives';
import { ConfusableBlock, EtymologyBlock } from './CardBackBlocks';
import { ICON_SIZE, ICON_STROKE, ArrowRight, Pencil } from './icons';
import { BACK_RATING_LABEL, RATING_LABEL, weightLabel } from './format';

/** 学习卡背面（UIUX P1）：评分条 + 结果横幅 + 义项权重 + 例句 + 词根 + 形近词 + 笔记。
 * 词根/形近词的折叠态由 StudyView 持有（快捷键 R/F 驱动、换卡重置）。 */

export interface CardBackProps {
  view: SessionCardView;
  card: Card;
  pending: PendingReview | null;
  lastRequeue: RequeueResult | null;
  note: string;
  etymologyOpen: boolean;
  onToggleEtymology: () => void;
  confusablesOpen: boolean;
  onToggleConfusables: () => void;
  onOpenWord: (lemma: string) => void;
  onRevise: (rating: RatingCode) => void;
  onCommitNext: () => void;
  onSaveNote: (note: string) => void;
}

const RATING_ORDER: RatingCode[] = ['AGAIN', 'HARD', 'GOOD'];

export function CardBack({
  view,
  card,
  pending,
  lastRequeue,
  note,
  etymologyOpen,
  onToggleEtymology,
  confusablesOpen,
  onToggleConfusables,
  onOpenWord,
  onRevise,
  onCommitNext,
  onSaveNote,
}: CardBackProps) {
  const { word, sense } = view;
  const stat = sense.examStats[card.exam];
  const rating = pending?.rating ?? null;

  return (
    <article className="flex flex-col gap-4" role="region" aria-label="学习卡片答案">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">本次评分：</span>
        {rating ? (
          <Badge tone={rating === 'GOOD' ? 'success' : rating === 'HARD' ? 'warn' : 'danger'}>{RATING_LABEL[rating]}</Badge>
        ) : (
          <span className="text-sm text-meta">未评分</span>
        )}
        {pending?.prejudged ? <Badge tone="neutral">正面预判</Badge> : null}
        {pending?.corrected ? <Badge tone="warn">已修正</Badge> : null}
        <span className="ml-auto" aria-live="polite">
          <RequeueBanner result={lastRequeue} />
        </span>
      </div>

      <section className="flex flex-col gap-2" aria-label="义项与权重">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-word text-sm text-muted">{sense.pos}</span>
          <span className="text-md font-emphasize text-fg">{sense.cn}</span>
          {stat ? (
            <span className="ml-auto flex items-center gap-2">
              <span className="font-word text-2xs text-meta tabular-nums">{weightLabel(stat.senseWeight)}</span>
              <ProgressBar value={stat.senseWeight} max={100} label={`${weightLabel(stat.senseWeight)}，满分 100`} />
            </span>
          ) : null}
        </div>
        {sense.enDef ? <p className="text-sm leading-body text-muted">{sense.enDef}</p> : null}
        <p className="text-2xs text-meta">
          权重为公开信号合成的估计值（{stat?.sources.join('、') ?? '无来源'}），不是考试出现次数。
        </p>
      </section>

      {view.sentences.length > 0 ? (
        <section className="flex flex-col gap-2 rounded-lg bg-sunken px-4 py-3" aria-label="例句">
          {view.sentences.map((s) => (
            <div key={s.id} className="flex flex-col gap-1">
              <p className="text-lg leading-body text-fg-2">
                <Highlighted en={s.en} surface={s.surfaceForm} />
              </p>
              <p className="text-sm leading-body text-muted">{s.zh}</p>
            </div>
          ))}
        </section>
      ) : null}

      {word.etymology ? (
        <EtymologyBlock etymology={word.etymology} open={etymologyOpen} onToggle={onToggleEtymology} />
      ) : null}

      {word.confusables.length > 0 ? (
        <ConfusableBlock
          confusables={word.confusables}
          open={confusablesOpen}
          onToggle={onToggleConfusables}
          onOpenWord={onOpenWord}
        />
      ) : null}

      <NotesBlock note={note} onSave={onSaveNote} />

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2">
          {RATING_ORDER.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={rating === r}
              onClick={() => onRevise(r)}
              className={[
                'flex min-h-12 items-center justify-center rounded-md border text-sm font-emphasize transition-colors duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                rating === r
                  ? r === 'GOOD'
                    ? 'border-success-soft bg-success-soft text-success'
                    : r === 'HARD'
                      ? 'border-warning-soft bg-warning-soft text-warning'
                      : 'border-danger-soft bg-danger-soft text-danger'
                  : 'border-line-strong bg-surface text-fg-2 hover:bg-warm',
              ].join(' ')}
            >
              {BACK_RATING_LABEL[r]}
            </button>
          ))}
        </div>
        <Button variant="primary" block disabled={!rating} onClick={onCommitNext} aria-describedby={rating ? undefined : 'next-hint'}>
          下一个
          <ArrowRight size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
        </Button>
        {!rating ? (
          <p id="next-hint" className="text-center text-2xs text-meta">
            先选择评分，再进入下一张
          </p>
        ) : null}
      </div>
    </article>
  );
}

function RequeueBanner({ result }: { result: RequeueResult | null }) {
  if (!result) return <span className="text-xs text-meta">本轮 0/2</span>;
  if (result.outcome === 'PASSED') {
    return (
      <Badge tone="success">
        已通关 · 本轮 {result.points}/2
      </Badge>
    );
  }
  if (result.outcome === 'REINSERTED') {
    return (
      <Badge tone="warn">
        待巩固 · 本轮 {result.points}/2 · 间隔 {result.gapCards ?? 3} 张
      </Badge>
    );
  }
  return (
    <Badge tone="warn">
      待巩固 · 本轮 {result.points}/2 · 本轮末尾重现
    </Badge>
  );
}

function NotesBlock({ note, onSave }: { note: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  useEffect(() => setDraft(note), [note]);

  return (
    <section className="border-t border-line-soft pt-3" aria-label="笔记">
      {editing ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="笔记"
            placeholder="写下你的助记或易错点"
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              保存笔记
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(note);
                setEditing(false);
              }}
            >
              取消
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Pencil size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
          {note ? <span className="line-clamp-2 leading-body text-fg-2">{note}</span> : <span>添加笔记</span>}
        </button>
      )}
    </section>
  );
}

function Highlighted({ en, surface }: { en: string; surface: string }) {
  if (!surface) return <>{en}</>;
  const idx = en.toLowerCase().indexOf(surface.toLowerCase());
  if (idx < 0) return <>{en}</>;
  return (
    <>
      {en.slice(0, idx)}
      <strong className="font-word font-emphasize text-fg">{en.slice(idx, idx + surface.length)}</strong>
      {en.slice(idx + surface.length)}
    </>
  );
}
