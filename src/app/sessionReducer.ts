import type { Card, RatingCode, ReviewLog } from '../domain/types';
import { reviseRating, type PendingReview } from '../domain/reviewCommitter';
import type { RequeueResult, RoundSummary, SessionQueue } from '../domain/sessionQueue';
import type { DailyPlan } from '../domain/planner';
import type { SessionCardView } from './sessionBuilder';

/**
 * 学习会话状态机的纯 reducer 部分（PRD §5.2）：
 * 正面预判(1/2/3) → Space 揭示 → 背面确认/改评分 → 离开卡片时一次性提交。
 * 副能力（读库/提交）在 StudySessionProvider 中，经 useCase 出口执行。
 */

export type SessionPhase = 'idle' | 'active' | 'summary';

/** 可撤销的最近一次操作（PRD §5.2.6：仅最近一次） */
export type SessionUndoEntry =
  | { kind: 'REVIEW'; log: ReviewLog }
  | { kind: 'SUSPEND'; wordId: string };

export interface SessionState {
  phase: SessionPhase;
  building: boolean;
  error: string | null;
  plan: DailyPlan | null;
  views: Map<string, SessionCardView>;
  /** 卡片内存镜像：提交/撤销后同步更新，避免每步都读库 */
  cards: Map<string, Card>;
  queue: SessionQueue | null;
  currentId: string | null;
  revealed: boolean;
  pending: PendingReview | null;
  /** 背面横幅：本轮积分 / 重排间隔 */
  lastRequeue: RequeueResult | null;
  undoEntry: SessionUndoEntry | null;
  studiedWordIds: string[];
  summary: RoundSummary | null;
}

export const INITIAL: SessionState = {
  phase: 'idle',
  building: false,
  error: null,
  plan: null,
  views: new Map(),
  cards: new Map(),
  queue: null,
  currentId: null,
  revealed: false,
  pending: null,
  lastRequeue: null,
  undoEntry: null,
  studiedWordIds: [],
  summary: null,
};

export type Action =
  | { type: 'RESET' }
  | { type: 'BUILD_START' }
  | { type: 'BUILD_ERROR'; message: string }
  | {
      type: 'SESSION_READY';
      plan: DailyPlan;
      views: Map<string, SessionCardView>;
      cards: Map<string, Card>;
      queue: SessionQueue;
      studiedWordIds: string[];
      firstCardId: string | null;
    }
  | { type: 'REVEAL'; pending: PendingReview }
  | { type: 'PENDING_SET'; pending: PendingReview }
  | { type: 'PENDING_RATING'; rating: RatingCode }
  | {
      type: 'COMMIT_DONE';
      card: Card;
      log: ReviewLog;
      requeue: RequeueResult;
      nextCardId: string | null;
      summary: RoundSummary | null;
      studiedWordId: string;
    }
  | { type: 'UNDO_DONE'; card: Card }
  | { type: 'SESSION_END'; summary: RoundSummary | null };

export function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'RESET':
      return { ...INITIAL, views: new Map(), cards: new Map() };
    case 'BUILD_START':
      return { ...state, building: true, error: null };
    case 'BUILD_ERROR':
      return { ...state, building: false, error: action.message };
    case 'SESSION_READY': {
      const cards = new Map(state.cards);
      for (const [id, card] of action.cards) cards.set(id, card);
      return {
        ...state,
        building: false,
        error: null,
        phase: action.firstCardId ? 'active' : 'summary',
        plan: action.plan,
        views: action.views,
        cards,
        queue: action.queue,
        studiedWordIds: action.studiedWordIds,
        currentId: action.firstCardId,
        revealed: false,
        pending: null,
        lastRequeue: null,
        undoEntry: null,
        summary: action.firstCardId ? null : { learned: 0, passed: 0, pending: 0 },
      };
    }
    case 'REVEAL':
      return { ...state, revealed: true, pending: action.pending };
    case 'PENDING_SET':
      return { ...state, pending: action.pending };
    case 'PENDING_RATING':
      return state.pending ? { ...state, pending: reviseRating(state.pending, action.rating) } : state;
    case 'COMMIT_DONE': {
      const cards = new Map(state.cards);
      cards.set(action.card.id, action.card);
      const studied = state.studiedWordIds.includes(action.studiedWordId)
        ? state.studiedWordIds
        : [...state.studiedWordIds, action.studiedWordId];
      return {
        ...state,
        cards,
        studiedWordIds: studied,
        lastRequeue: action.requeue,
        currentId: action.nextCardId,
        revealed: false,
        pending: null,
        undoEntry: { kind: 'REVIEW', log: action.log },
        phase: action.nextCardId ? 'active' : 'summary',
        summary: action.summary,
      };
    }
    case 'UNDO_DONE': {
      const cards = new Map(state.cards);
      cards.set(action.card.id, action.card);
      return { ...state, cards, undoEntry: null };
    }
    case 'SESSION_END':
      return { ...state, phase: 'summary', summary: action.summary ?? state.summary };
    default:
      return state;
  }
}
