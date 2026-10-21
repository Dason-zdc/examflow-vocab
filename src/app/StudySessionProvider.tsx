import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import type { RatingCode, Settings } from '../domain/types';
import { beginReview, suspendWordForUndo, type PendingReview } from '../domain/reviewCommitter';
import { resumeWordCards } from '../domain/scheduler';
import type { Scheduler } from '../domain/scheduler';
import { createScheduler } from '../domain/scheduler';
import { SessionQueue, type RequeueResult, type RoundSummary } from '../domain/sessionQueue';
import { daysToExam, studyDayOf, systemClock, type Clock } from '../domain/clock';
import { fromCardRow, type ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import { buildSession, createSessionQueue, type SessionCardView } from './sessionBuilder';
import type { DailyPlan } from '../domain/planner';
import { commitReviewUseCase, undoReviewUseCase } from './reviewUseCase';
import {
  INITIAL,
  reducer,
  type Action,
  type SessionState,
  type SessionUndoEntry,
  type SessionPhase,
} from './sessionReducer';

export type { SessionPhase, SessionState, SessionUndoEntry, Action };

export interface StudySessionContextValue {
  state: SessionState;
  start: () => Promise<void>;
  reveal: () => void;
  /** 正面预判评分（1/2/3） */
  prejudge: (rating: RatingCode) => void;
  /** 背面改评分 */
  revise: (rating: RatingCode) => void;
  /** 离开卡片：一次性提交并推进队列 */
  commitAndNext: () => Promise<void>;
  undo: () => Promise<void>;
  suspendWord: (wordId: string) => Promise<void>;
  end: () => void;
}

const StudySessionContext = createContext<StudySessionContextValue | null>(null);

export interface StudySessionProviderProps {
  db: ExamFlowDB;
  dictionary: PackDictionary | null;
  settings: Settings | null;
  scheduler?: Scheduler;
  clock?: Clock;
  children: ReactNode;
}

export function StudySessionProvider({
  db,
  dictionary,
  settings,
  scheduler,
  clock = systemClock,
  children,
}: StudySessionProviderProps) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const sched = useMemo(() => scheduler ?? createScheduler(), [scheduler]);

  // 切换考试时重置会话，避免拿着旧考试的队列
  const exam = settings?.exam;
  useEffect(() => {
    dispatch({ type: 'RESET' });
  }, [exam]);

  const start = useCallback(async () => {
    if (stateRef.current.building) return;
    if (!dictionary || !settings) {
      dispatch({ type: 'BUILD_ERROR', message: '词书尚未加载完成，请稍候重试' });
      return;
    }
    /*
     * 考期未设置时不建会话：planDaily 内部会对 examDate 求日切，
     * 空串会让 parseDay 抛「非法日期」。ExamFlowApp 在 examDate 为空时
     * 恒渲染引导面板（state.error 无处展示），故不 dispatch、保持 idle；
     * 设置保存后由 Chrome 的 revision 效果重新调用 start()。
     */
    if (!settings.examDate) return;
    dispatch({ type: 'BUILD_START' });
    try {
      const now = clock.now();
      const rows = await db.cards.where('exam').equals(settings.exam).toArray();
      const cards = rows.map(fromCardRow);
      const cardById = new Map(cards.map((c) => [c.id, c]));

      // 当日已学：从今日日志反推 wordId，供兄弟卡错开
      const today = studyDayOf(now, settings.dayStartHour);
      const todayLogs = await db.reviewLogs.where('studyDay').equals(today).toArray();
      const studiedCardIds = new Set(todayLogs.map((l) => l.cardId));
      const studiedWordIds = [...new Set(cards.filter((c) => studiedCardIds.has(c.id)).map((c) => c.wordId))];

      const built = buildSession({
        cards,
        dictionary,
        exam: settings.exam,
        now,
        settings,
        scheduler: sched,
        studiedWordIds,
      });

      const queue = createSessionQueue(built.queueCardIds, clock);
      const firstCardId = queue.advance();
      dispatch({
        type: 'SESSION_READY',
        plan: built.plan,
        views: built.views,
        cards: cardById,
        queue,
        studiedWordIds,
        firstCardId,
      });
    } catch (err) {
      dispatch({ type: 'BUILD_ERROR', message: err instanceof Error ? err.message : String(err) });
    }
  }, [clock, db, dictionary, sched, settings]);

  const reveal = useCallback(() => {
    const s = stateRef.current;
    if (s.phase !== 'active' || s.revealed || !s.currentId) return;
    // 未预判时给默认 GOOD（prejudged = false）
    const pending = s.pending ?? beginReview(s.currentId, clock.now(), { prejudged: false });
    dispatch({ type: 'REVEAL', pending });
  }, [clock]);

  const prejudge = useCallback((rating: RatingCode) => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !s.currentId || s.revealed) return;
    if (s.pending) {
      // 正面改预判：不算「修正」，corrected 保持 false
      dispatch({ type: 'PENDING_SET', pending: { ...s.pending, rating, prejudged: true } });
      return;
    }
    dispatch({ type: 'PENDING_SET', pending: beginReview(s.currentId, clock.now(), { prejudged: true, rating }) });
  }, [clock]);

  const revise = useCallback((rating: RatingCode) => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !s.revealed) return;
    dispatch({ type: 'PENDING_RATING', rating });
  }, []);

  const commitAndNext = useCallback(async () => {
    const s = stateRef.current;
    if (s.phase !== 'active' || !s.currentId || !s.queue || !s.pending || !s.revealed) return;
    const card = s.cards.get(s.currentId);
    const view = s.views.get(s.currentId);
    if (!card || !view || !settings) return;

    const now = clock.now();
    try {
      const result = await commitReviewUseCase(db, {
        card,
        pending: s.pending,
        now,
        studyDay: studyDayOf(now, settings.dayStartHour),
        durationMs: Math.max(0, now - s.pending.shownAt),
        scheduler: sched,
        daysToExamValue: daysToExam(settings.examDate, now, settings.dayStartHour),
      });

      const requeue = s.queue.applyRating(s.currentId, s.pending.rating);
      const nextCardId = s.queue.advance();
      dispatch({
        type: 'COMMIT_DONE',
        card: result.card,
        log: result.log,
        requeue,
        nextCardId,
        summary: s.queue.isFinished ? s.queue.summary() : null,
        studiedWordId: view.word.id,
      });
    } catch (err) {
      dispatch({ type: 'BUILD_ERROR', message: `提交失败：${err instanceof Error ? err.message : String(err)}` });
    }
  }, [clock, db, sched, settings]);

  const undo = useCallback(async () => {
    const s = stateRef.current;
    const entry = s.undoEntry;
    if (!entry) return;
    try {
      if (entry.kind === 'REVIEW') {
        const card = s.cards.get(entry.log.cardId);
        if (!card) return;
        const restored = await undoReviewUseCase(db, { card, log: entry.log });
        dispatch({ type: 'UNDO_DONE', card: restored });
      } else {
        const rows = await db.cards.where('wordId').equals(entry.wordId).toArray();
        const affected = resumeWordCards(rows, entry.wordId);
        if (affected.length > 0) {
          await db.cards.bulkUpdate(affected.map((id) => ({ key: id, changes: { suspended: false } })));
        }
        dispatch({ type: 'RESET' });
      }
    } catch (err) {
      dispatch({ type: 'BUILD_ERROR', message: `撤销失败：${err instanceof Error ? err.message : String(err)}` });
    }
  }, [db]);

  const suspendWord = useCallback(
    async (wordId: string) => {
      try {
        const rows = await db.cards.where('wordId').equals(wordId).toArray();
        const cards = rows.map(fromCardRow);
        const entry = suspendWordForUndo(cards, wordId);
        const affected = entry.suspendedCardIds ?? [];
        if (affected.length > 0) {
          await db.cards.bulkUpdate(affected.map((id) => ({ key: id, changes: { suspended: true } })));
        }
        // 队列可能包含被斩的卡，直接重建会话
        dispatch({ type: 'RESET' });
      } catch (err) {
        dispatch({ type: 'BUILD_ERROR', message: `斩词失败：${err instanceof Error ? err.message : String(err)}` });
      }
    },
    [db],
  );

  const end = useCallback(() => {
    const s = stateRef.current;
    dispatch({ type: 'SESSION_END', summary: s.queue?.summary() ?? s.summary });
  }, []);

  const value = useMemo<StudySessionContextValue>(
    () => ({ state, start, reveal, prejudge, revise, commitAndNext, undo, suspendWord, end }),
    [state, start, reveal, prejudge, revise, commitAndNext, undo, suspendWord, end],
  );

  return <StudySessionContext.Provider value={value}>{children}</StudySessionContext.Provider>;
}

export function useStudySession(): StudySessionContextValue {
  const ctx = useContext(StudySessionContext);
  if (!ctx) throw new Error('useStudySession 必须在 <StudySessionProvider> 内使用');
  return ctx;
}

export type { PendingReview, RequeueResult, RoundSummary, SessionQueue, DailyPlan, SessionCardView };
