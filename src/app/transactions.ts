import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../domain/types';
import { SETTINGS_KEY, toCardRow, type ExamFlowDB } from '../storage/db';

/**
 * 全项目唯一允许出现 db.transaction 的文件（门禁 5 / ADR-003）。
 *
 * 纪律：事务体内只允许 Dexie 操作与纯计算。
 * FSRS 调度、队列推进、撤销快照一律在进入事务之前由领域层纯函数算完，
 * 事务内 await 任何非 Dexie Promise 会触发隐式提交 / TransactionInactiveError。
 */

/** 一次评分提交的原子写：更新 Card + 写一条 ReviewLog */
export interface CommitPlan {
  cardAfter: Card;
  log: ReviewLog;
}

/**
 * 提交一次评分。
 * reviewLogs 用 add 而非 put：重复评分 ID 会触发 ConstraintError 让整个事务回滚，
 * 而不是静默覆盖——调用方必须保证 log.id 唯一（reviewLogId 由 cardId + reviewedAt 生成）。
 */
export async function applyCommitPlan(db: ExamFlowDB, plan: CommitPlan): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(toCardRow(plan.cardAfter));
    await db.reviewLogs.add(plan.log);
  });
}

/** 撤销一次评分提交：还原 Card + 删除对应 ReviewLog */
export async function applyUndoPlan(
  db: ExamFlowDB,
  plan: { cardAfter: Card; removedLogId: string },
): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(toCardRow(plan.cardAfter));
    await db.reviewLogs.delete(plan.removedLogId);
  });
}

/**
 * 会话状态持久化（架构文档 §7.3 的 sessionState 表）在 P0 未落库：
 * 当前 schemaVersion=1 无该表，日内队列只在内存中存在，刷新页面后按到期卡重建。
 * 若后续版本加入 sessionState 表，事务范围在这里扩展，调用方无感。
 */

/** 备份导入计划：纯数据，进入事务之前算完（含 merge 模式的冲突裁决） */
export interface ImportPlan {
  mode: 'overwrite' | 'merge';
  /** overwrite 模式先清空四张用户表 */
  clearFirst: boolean;
  cards: Card[];
  reviewLogs: ReviewLog[];
  userWordMeta: UserWordMeta[];
  customWords: CustomWord[];
  settings: Settings | null;
}

/** 备份导入：同一 rw 事务内完成，失败整体回滚（PRD §7.2） */
export async function applyImportPlan(db: ExamFlowDB, plan: ImportPlan): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, db.userWordMeta, db.customWords, db.settings, async () => {
    if (plan.clearFirst) {
      await Promise.all([
        db.cards.clear(),
        db.reviewLogs.clear(),
        db.userWordMeta.clear(),
        db.customWords.clear(),
      ]);
    }
    await db.cards.bulkPut(plan.cards.map(toCardRow));
    await db.reviewLogs.bulkPut(plan.reviewLogs);
    await db.userWordMeta.bulkPut(plan.userWordMeta);
    await db.customWords.bulkPut(plan.customWords);
    if (plan.settings) {
      await db.settings.put({ id: SETTINGS_KEY, ...plan.settings });
    }
  });
}

/** 重置某考试进度：删卡片 + 删复习日志，同一事务保证不会半截状态 */
export async function applyResetPlan(
  db: ExamFlowDB,
  plan: { cardIds: string[]; logIds: string[] },
): Promise<void> {
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    if (plan.cardIds.length > 0) await db.cards.bulkDelete(plan.cardIds);
    if (plan.logIds.length > 0) await db.reviewLogs.bulkDelete(plan.logIds);
  });
}
