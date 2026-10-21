import { useEffect, useMemo, useState } from 'react';
import type { RatingCode, Settings } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import type { PackWord } from '../content/packVerifier';
import type { Scheduler } from '../domain/scheduler';
import type { CoverageStats } from '../app/queries';
import { useStudySession } from '../app/StudySessionProvider';
import { setNote, setStarred } from '../app/userWordsUseCase';
import { useUserWordMeta } from '../app/queries';
import { CardFront } from './CardFront';
import { CardBack } from './CardBack';
import { WordPreviewModal } from './WordPreviewModal';
import { DailyPlanPanel } from './DailyPlanPanel';
import { BackupPanel } from './BackupPanel';
import { HotkeyPanel } from './HotkeyPanel';
import { RoundSummaryView } from './RoundSummaryView';
import { useStudyHotkeys } from './useStudyHotkeys';
import { speak } from './speech';

/** 学习页（UIUX P1）：卡片 + 右侧栏面板；桌面快捷键与移动端底栏共用同一组 handler。 */

export interface StudyViewProps {
  db: ExamFlowDB;
  dictionary: PackDictionary;
  settings: Settings;
  scheduler: Scheduler;
  now: number;
  coverage: CoverageStats | undefined;
  persisted: boolean | undefined;
  extraNewToday: number;
  onExtraNew: (n: number) => void;
  onOpenSettings: () => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
}

const RATING_BY_KEY: Record<'1' | '2' | '3', RatingCode> = { '1': 'AGAIN', '2': 'HARD', '3': 'GOOD' };

export function StudyView({
  db,
  dictionary,
  settings,
  scheduler,
  now,
  coverage,
  persisted,
  extraNewToday,
  onExtraNew,
  onOpenSettings,
  onExport,
  onImport,
}: StudyViewProps) {
  const session = useStudySession();
  const metas = useUserWordMeta(db);
  const { state } = session;

  const currentId = state.currentId;
  const view = currentId ? state.views.get(currentId) : undefined;
  const card = currentId ? state.cards.get(currentId) : undefined;

  const starred = view ? (metas?.find((m) => m.wordId === view.word.id)?.starred ?? false) : false;
  const note = view ? (metas?.find((m) => m.wordId === view.word.id)?.note ?? '') : '';

  const retrievability = useMemo(
    () => (card ? scheduler.retrievability(card.fsrs, now) : 0),
    [card, scheduler, now],
  );

  // 新卡自动发音（设置项）
  useEffect(() => {
    if (!settings.autoPlayAudio || !view || !card) return;
    if (card.fsrs.reps > 0) return;
    speak(view.word.lemma, settings.accent);
  }, [currentId, settings.autoPlayAudio, settings.accent, view, card]);

  // 背面次要区块折叠态（快捷键 R/F 驱动）；换卡即重置，不残留上一张的展开态
  const [etymologyOpen, setEtymologyOpen] = useState(false);
  const [confusablesOpen, setConfusablesOpen] = useState(false);
  useEffect(() => {
    setEtymologyOpen(false);
    setConfusablesOpen(false);
  }, [currentId]);

  // 形近词词条弹窗（PRD AC-05.2）：查不到也照常弹窗，展示「词库未收录」
  const [preview, setPreview] = useState<{ lemma: string; word: PackWord | null } | null>(null);

  const hotkeys = useMemo(
    () => {
      function revealOrNext() {
        if (state.phase !== 'active') return;
        if (state.revealed) {
          if (state.pending) void session.commitAndNext();
        } else {
          session.reveal();
        }
      }
      return {
        onRevealOrNext: revealOrNext,
        // → / Enter 与 Space 同行为：同一实现
        onNext: revealOrNext,
        onRate: (key: '1' | '2' | '3') => {
          if (state.phase !== 'active') return;
          const rating = RATING_BY_KEY[key];
          if (state.revealed) session.revise(rating);
          else session.prejudge(rating);
        },
        onPlay: (shift: boolean) => {
          if (!view) return;
          const accent = shift ? (settings.accent === 'uk' ? 'us' : 'uk') : settings.accent;
          speak(view.word.lemma, accent);
        },
        onSuspend: () => {
          if (view && state.phase === 'active') void session.suspendWord(view.word.id);
        },
        onUndo: () => void session.undo(),
        // R / F 只在背面有意义：正面按下无副作用
        onToggleEtymology: () => {
          if (state.revealed) setEtymologyOpen((v) => !v);
        },
        onToggleConfusables: () => {
          if (state.revealed) setConfusablesOpen((v) => !v);
        },
      };
    },
    [state, session, view, settings.accent],
  );
  // 词条弹窗打开时让位：Esc 与焦点由弹窗自理
  useStudyHotkeys(hotkeys, state.phase === 'active' && preview === null);

  const remainingToday = useMemo(() => {
    const reviewLeft = Math.max(0, (state.plan?.reviewCount ?? 0) - (coverage?.reviewedToday ?? 0));
    const newLeft = Math.max(0, (state.plan?.newCount ?? 0) - (coverage?.newLearnedToday ?? 0));
    return reviewLeft + newLeft;
  }, [state.plan, coverage]);

  if (state.phase === 'idle' || state.building) {
    return (
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[8fr_4fr]">
        <div className="flex flex-col gap-3" aria-busy>
          <div className="h-6 w-40 animate-pulse rounded bg-warm" />
          <div className="h-12 w-64 animate-pulse rounded bg-warm" />
          <div className="h-24 w-full animate-pulse rounded bg-warm" />
          <div className="h-12 w-full animate-pulse rounded bg-warm" />
        </div>
        <div className="flex flex-col gap-4">
          <DailyPlanPanel plan={null} settings={settings} coverage={coverage} extraNewToday={extraNewToday} onExtraNew={onExtraNew} onOpenSettings={onOpenSettings} />
          <BackupPanel settings={settings} persisted={persisted} onExport={onExport} onImport={onImport} />
          <HotkeyPanel />
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="rounded-lg border border-line bg-surface px-6 py-10 text-center" role="alert">
        <p className="text-md text-danger">{state.error}</p>
        <button type="button" onClick={() => void session.start()} className="mt-3 text-sm text-accent underline">
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[8fr_4fr]">
      <div className="flex flex-col gap-4">
        {state.phase === 'summary' || !view || !card ? (
          <RoundSummaryView
            summary={state.summary ?? { learned: 0, passed: 0, pending: 0 }}
            remainingToday={remainingToday}
            onStartNext={() => void session.start()}
            onExtraNew={onExtraNew}
            onUndo={() => void session.undo()}
            undoAvailable={state.undoEntry !== null}
          />
        ) : state.revealed ? (
          <CardBack
            view={view}
            card={card}
            pending={state.pending}
            lastRequeue={state.lastRequeue}
            note={note}
            etymologyOpen={etymologyOpen}
            onToggleEtymology={() => setEtymologyOpen((v) => !v)}
            confusablesOpen={confusablesOpen}
            onToggleConfusables={() => setConfusablesOpen((v) => !v)}
            onOpenWord={(lemma) => setPreview({ lemma, word: dictionary.lookup(lemma) ?? null })}
            onRevise={(r) => session.revise(r)}
            onCommitNext={() => void session.commitAndNext()}
            onSaveNote={(n) => void setNote(db, view.word.id, n)}
          />
        ) : (
          <CardFront
            view={view}
            card={card}
            retrievability={retrievability}
            starred={starred}
            undoAvailable={state.undoEntry !== null}
            onToggleStar={() => void setStarred(db, view.word.id, !starred)}
            onSuspend={() => void session.suspendWord(view.word.id)}
            onUndo={() => void session.undo()}
            onPlay={(accent) => speak(view.word.lemma, accent)}
            onReveal={() => session.reveal()}
            onPrejudge={(r) => session.prejudge(r)}
          />
        )}

        {/* 移动端底栏（<768px）：与桌面按钮同一组 handler */}
        {state.phase === 'active' ? (
          <nav
            aria-label="学习操作"
            className="fixed inset-x-0 bottom-0 z-mobilebar grid gap-2 border-t border-line bg-surface px-3 pt-2 lg:hidden"
            style={{ paddingBottom: 'calc(var(--space-2) + env(safe-area-inset-bottom, 0px))' }}
          >
            {state.revealed ? (
              <button
                type="button"
                disabled={!state.pending}
                onClick={() => void session.commitAndNext()}
                className="min-h-[52px] rounded-md bg-accent text-base font-emphasize text-on-accent disabled:opacity-50"
              >
                下一个
              </button>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(['AGAIN', 'HARD', 'GOOD'] as RatingCode[]).map((r, i) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => session.prejudge(r)}
                      className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-emphasize text-fg-2 active:scale-[0.97]"
                    >
                      {['不认识', '模糊', '认识'][i]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => session.reveal()}
                  className="min-h-11 rounded-md border border-dashed border-line-strong bg-surface text-sm text-muted"
                >
                  直接看答案
                </button>
              </>
            )}
          </nav>
        ) : null}
        <div className="h-20 lg:hidden" aria-hidden />
      </div>

      {preview ? (
        <WordPreviewModal lemma={preview.lemma} word={preview.word} exam={settings.exam} onClose={() => setPreview(null)} />
      ) : null}

      <aside className="flex flex-col gap-4" aria-label="学习侧栏">
        <DailyPlanPanel plan={state.plan} settings={settings} coverage={coverage} extraNewToday={extraNewToday} onExtraNew={onExtraNew} onOpenSettings={onOpenSettings} />
        <BackupPanel settings={settings} persisted={persisted} onExport={onExport} onImport={onImport} />
        <HotkeyPanel />
      </aside>
    </div>
  );
}
