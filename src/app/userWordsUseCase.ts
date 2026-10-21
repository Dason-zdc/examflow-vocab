import type { ExamCode, UserWordMeta } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import { ensureCardsForExam } from './onboardingUseCase';
import { applyResetPlan } from './transactions';

/**
 * 用户自有数据用例（生词本 / 笔记 / 重置进度）。
 * 写路径统一走事务出口（ADR-003）；重置是低频破坏性操作，UI 必须二次确认后才调用。
 */

function metaKey(wordId: string): string {
  return wordId;
}

export async function setStarred(db: ExamFlowDB, wordId: string, starred: boolean): Promise<void> {
  const existing = await db.userWordMeta.get(metaKey(wordId));
  const row: UserWordMeta = {
    wordId,
    starred,
    note: existing?.note ?? '',
    updatedAt: Date.now(),
  };
  await db.userWordMeta.put(row);
}

export async function setNote(db: ExamFlowDB, wordId: string, note: string): Promise<void> {
  const existing = await db.userWordMeta.get(metaKey(wordId));
  const row: UserWordMeta = {
    wordId,
    starred: existing?.starred ?? false,
    note,
    updatedAt: Date.now(),
  };
  await db.userWordMeta.put(row);
}

/** 恢复已斩词：把该词全部卡片解除暂停 */
export async function resumeWord(db: ExamFlowDB, wordId: string): Promise<void> {
  const ids = await db.cards.where('wordId').equals(wordId).primaryKeys();
  if (ids.length > 0) {
    const now = Date.now();
    await db.cards.bulkUpdate(ids.map((id) => ({ key: id, changes: { suspended: false, updatedAt: now } })));
  }
}

/** 批量斩词（入门水平测试 / 生词本批量操作）：认识的词整体标为已掌握 */
export async function suspendWords(db: ExamFlowDB, wordIds: string[]): Promise<number> {
  const unique = [...new Set(wordIds)];
  if (unique.length === 0) return 0;
  const ids = await db.cards.where('wordId').anyOf(unique).primaryKeys();
  if (ids.length === 0) return 0;
  const now = Date.now();
  await db.cards.bulkUpdate(ids.map((id) => ({ key: id, changes: { suspended: true, updatedAt: now } })));
  return ids.length;
}

/**
 * 重置某考试的学习进度：删除该考试全部卡片与复习日志，再按当前词书重建新卡。
 * 破坏性操作：调用方（UI）必须先完成二次确认。
 *
 * 重建卡片的同步版本取 `now + 1000`：必须严格新于 applyResetPlan 登记的墓碑，
 * 否则云端会认为重建的空卡更旧，从而把旧进度拉回来。
 */
export async function resetExamProgress(
  db: ExamFlowDB,
  exam: ExamCode,
  dictionary: PackDictionary,
  options: { excludeBasic: boolean },
): Promise<void> {
  const cardIds = await db.cards.where('exam').equals(exam).primaryKeys();
  const logIds = await db.reviewLogs.where('cardId').startsWith(`${exam}:`).primaryKeys();
  await applyResetPlan(db, { cardIds, logIds });
  await ensureCardsForExam(db, dictionary, exam, {
    excludeBasic: options.excludeBasic,
    version: Date.now() + 1000,
  });
}
