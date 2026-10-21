import type { Card, ReviewLog } from '../domain/types';
import {
  commitReview,
  undoReview,
  type CommitInput,
  type PendingReview,
} from '../domain/reviewCommitter';
import type { Scheduler } from '../domain/scheduler';
import type { ExamFlowDB } from '../storage/db';
import { applyCommitPlan, applyUndoPlan } from './transactions';

/**
 * 评分提交用例（PRD §5.2.5）：
 * 领域纯函数算完（FSRS、日志、快照）→ 唯一事务出口落库 → 返回新卡镜像。
 * 调用方（StudySessionProvider）拿到结果后再推进队列，事务内不做任何队列操作。
 */
export async function commitReviewUseCase(
  db: ExamFlowDB,
  input: Omit<CommitInput, 'scheduler'> & { scheduler: Scheduler },
): Promise<{ card: Card; log: ReviewLog; sessionOnly: boolean }> {
  const result = commitReview(input);
  await applyCommitPlan(db, { cardAfter: result.card, log: result.log });
  return result;
}

/** 撤销最近一次评分提交：还原 FSRS 与每日首评标记，删除日志（PRD §5.2.6） */
export async function undoReviewUseCase(
  db: ExamFlowDB,
  input: { card: Card; log: ReviewLog },
): Promise<Card> {
  const restored = undoReview(input.card, input.log);
  await applyUndoPlan(db, { cardAfter: restored, removedLogId: input.log.id });
  return restored;
}

/** 斩词用例：暂停该词全部卡片并返回受影响 ID（供 UI 记录撤销项） */
export { suspendWordForUndo } from '../domain/reviewCommitter';
export type { PendingReview };
