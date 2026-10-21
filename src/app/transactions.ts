import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../domain/types';
import {
  SETTINGS_KEY,
  SYNC_STATE_KEY,
  toCardRow,
  type ExamFlowDB,
  type SyncTable,
} from '../storage/db';

/**
 * 全项目唯一允许出现 db.transaction 的文件（门禁 5 / ADR-003）。
 *
 * 纪律：事务体内只允许 Dexie 操作与纯计算。
 * FSRS 调度、队列推进、撤销快照一律在进入事务之前由领域层纯函数算完，
 * 事务内 await 任何非 Dexie Promise 会触发隐式提交 / TransactionInactiveError。
 */

/** 一次评分提交的原子写：更新 Card + 写一条 ReviewLog（带同步版本） */
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
  const now = Date.now();
  await db.transaction('rw', db.cards, db.reviewLogs, async () => {
    await db.cards.put(toCardRow(plan.cardAfter, now));
    await db.reviewLogs.add({ ...plan.log, updatedAt: now });
  });
}

/** 撤销一次评分提交：还原 Card + 删除对应 ReviewLog（并登记删除墓碑） */
export async function applyUndoPlan(
  db: ExamFlowDB,
  plan: { cardAfter: Card; removedLogId: string },
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cards, db.reviewLogs, db.syncOutbox, db.syncState, async () => {
    await db.cards.put(toCardRow(plan.cardAfter, now));
    await db.reviewLogs.delete(plan.removedLogId);
    await tombstoneIfSyncing(db, 'reviewLogs', plan.removedLogId, now);
  });
}

/**
 * 会话状态持久化（架构文档 §7.3 的 sessionState 表）在 P0 未落库：
 * 当前 schemaVersion 无该表，日内队列只在内存中存在，刷新页面后按到期卡重建。
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
  const now = Date.now();
  // 导入行必须严格新于清空时登记的墓碑，否则服务端 LWW 会把导入结果当作旧数据丢弃
  const version = now + 1000;
  await db.transaction(
    'rw',
    [db.cards, db.reviewLogs, db.userWordMeta, db.customWords, db.settings, db.syncOutbox, db.syncState],
    async () => {
      if (plan.clearFirst) {
        // 清空前记录旧主键：overwrite 导入需要把「旧数据已删除」同步到云端
        const [oldCardIds, oldLogIds] = await Promise.all([
          db.cards.toCollection().primaryKeys(),
          db.reviewLogs.toCollection().primaryKeys(),
        ]);
        for (const id of oldCardIds) await tombstoneIfSyncing(db, 'cards', id, now);
        for (const id of oldLogIds) await tombstoneIfSyncing(db, 'reviewLogs', id, now);
        await Promise.all([
          db.cards.clear(),
          db.reviewLogs.clear(),
          db.userWordMeta.clear(),
          db.customWords.clear(),
        ]);
      }
      await db.cards.bulkPut(plan.cards.map((c) => toCardRow(c, version)));
      await db.reviewLogs.bulkPut(plan.reviewLogs.map((l) => ({ ...l, updatedAt: version })));
      await db.userWordMeta.bulkPut(plan.userWordMeta);
      await db.customWords.bulkPut(plan.customWords.map((w) => ({ ...w, updatedAt: version })));
      if (plan.settings) {
        await db.settings.put({ id: SETTINGS_KEY, ...plan.settings, updatedAt: version });
      }
    },
  );
}

/** 重置某考试进度：删卡片 + 删复习日志，同一事务保证不会半截状态 */
export async function applyResetPlan(
  db: ExamFlowDB,
  plan: { cardIds: string[]; logIds: string[] },
): Promise<void> {
  const now = Date.now();
  await db.transaction('rw', db.cards, db.reviewLogs, db.syncOutbox, db.syncState, async () => {
    if (plan.cardIds.length > 0) await db.cards.bulkDelete(plan.cardIds);
    if (plan.logIds.length > 0) await db.reviewLogs.bulkDelete(plan.logIds);
    for (const id of plan.cardIds) await tombstoneIfSyncing(db, 'cards', id, now);
    for (const id of plan.logIds) await tombstoneIfSyncing(db, 'reviewLogs', id, now);
  });
}

/** ========== 云同步：pull 合并（LWW） ========== */

/** 服务端下发的单行变更（data 已由调用方还原为领域对象） */
export interface PullRecord<T> {
  id: string;
  /** 客户端时钟版本（updated_at） */
  v: number;
  deleted: boolean;
  data: T | null;
}

export interface PullPlan {
  cards: PullRecord<Card>[];
  reviewLogs: PullRecord<ReviewLog>[];
  userWordMeta: PullRecord<UserWordMeta>[];
  customWords: PullRecord<CustomWord>[];
  settings: PullRecord<Settings> | null;
}

/**
 * 把服务端增量合并进本地库，逐行 LWW：
 * - 远端版本 <= 本地版本 → 保留本地（本地更新更晚）
 * - 远端是墓碑 → 删本地行
 * - 本地有更新的待推送删除 → 不复活
 * 返回实际应用的变更数。
 */
export async function mergePull(db: ExamFlowDB, plan: PullPlan): Promise<number> {
  let applied = 0;
  await db.transaction(
    'rw',
    [db.cards, db.reviewLogs, db.userWordMeta, db.customWords, db.settings, db.syncOutbox],
    async () => {
      for (const rec of plan.cards) if (await mergeCard(db, rec)) applied += 1;
      for (const rec of plan.reviewLogs) if (await mergeLog(db, rec)) applied += 1;
      for (const rec of plan.userWordMeta) if (await mergeMeta(db, rec)) applied += 1;
      for (const rec of plan.customWords) if (await mergeCustomWord(db, rec)) applied += 1;
      if (plan.settings && (await mergeSettings(db, plan.settings))) applied += 1;
    },
  );
  return applied;
}

async function mergeCard(db: ExamFlowDB, rec: PullRecord<Card>): Promise<boolean> {
  const local = await db.cards.get(rec.id);
  if (rec.v <= (local?.updatedAt ?? 0)) return false;
  if (rec.deleted) {
    if (local) await db.cards.delete(rec.id);
    await clearPending(db, 'cards', rec.id);
    return Boolean(local);
  }
  if ((await pendingDeleteAt(db, 'cards', rec.id)) >= rec.v) return false;
  if (!rec.data) return false;
  await db.cards.put(toCardRow(rec.data, rec.v));
  return true;
}

async function mergeLog(db: ExamFlowDB, rec: PullRecord<ReviewLog>): Promise<boolean> {
  const local = await db.reviewLogs.get(rec.id);
  if (rec.v <= (local?.updatedAt ?? 0)) return false;
  if (rec.deleted) {
    if (local) await db.reviewLogs.delete(rec.id);
    await clearPending(db, 'reviewLogs', rec.id);
    return Boolean(local);
  }
  if (!rec.data) return false;
  await db.reviewLogs.put({ ...rec.data, updatedAt: rec.v });
  return true;
}

async function mergeMeta(db: ExamFlowDB, rec: PullRecord<UserWordMeta>): Promise<boolean> {
  const key = rec.data?.wordId ?? rec.id;
  const local = await db.userWordMeta.get(key);
  if (rec.v <= (local?.updatedAt ?? 0)) return false;
  if (rec.deleted) {
    if (local) await db.userWordMeta.delete(key);
    await clearPending(db, 'userWordMeta', key);
    return Boolean(local);
  }
  if (!rec.data) return false;
  await db.userWordMeta.put({ ...rec.data, updatedAt: rec.v });
  return true;
}

async function mergeCustomWord(db: ExamFlowDB, rec: PullRecord<CustomWord>): Promise<boolean> {
  const local = await db.customWords.get(rec.id);
  if (rec.v <= (local?.updatedAt ?? 0)) return false;
  if (rec.deleted) {
    if (local) await db.customWords.delete(rec.id);
    await clearPending(db, 'customWords', rec.id);
    return Boolean(local);
  }
  if (!rec.data) return false;
  await db.customWords.put({ ...rec.data, updatedAt: rec.v });
  return true;
}

async function mergeSettings(db: ExamFlowDB, rec: PullRecord<Settings>): Promise<boolean> {
  const local = await db.settings.get(SETTINGS_KEY);
  const localV = local?.updatedAt ?? 0;
  // 本地是「未初始化」设置（examDate 为空）时，云端设置无条件接管：
  // 新设备加入同步不该用本地默认值覆盖掉云端既定考期。
  const pristine = !local || local.examDate === '';
  if (!pristine && rec.v <= localV) return false;
  if (rec.deleted) {
    if (local) await db.settings.delete(SETTINGS_KEY);
    return Boolean(local);
  }
  if (!rec.data) return false;
  // AI 配置不参与同步：保留本机凭证，只接受云端的计划类设置
  await db.settings.put({
    id: SETTINGS_KEY,
    ...rec.data,
    aiBaseUrl: local?.aiBaseUrl ?? '',
    aiApiKey: local?.aiApiKey ?? '',
    aiModel: local?.aiModel ?? '',
    updatedAt: rec.v,
  });
  return true;
}

/** 登记删除墓碑（仅在已登录开启同步时；否则本地删除不会影响云端，无需记录） */
async function tombstoneIfSyncing(db: ExamFlowDB, table: SyncTable, rowId: string, at: number): Promise<void> {
  const state = await db.syncState.get(SYNC_STATE_KEY);
  if (!state?.enabled || !state.token) return;
  await db.syncOutbox.add({ table, rowId, at });
}

async function pendingDeleteAt(db: ExamFlowDB, table: SyncTable, rowId: string): Promise<number> {
  const rows = await db.syncOutbox.where('[table+rowId]').equals([table, rowId]).toArray();
  return rows.reduce((max, row) => Math.max(max, row.at), 0);
}

async function clearPending(db: ExamFlowDB, table: SyncTable, rowId: string): Promise<void> {
  await db.syncOutbox.where('[table+rowId]').equals([table, rowId]).delete();
}
