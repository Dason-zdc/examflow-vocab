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
    await db.cards.bulkUpdate(ids.map((id) => ({ key: id, changes: { suspended: false } })));
  }
}

/**
 * 重置某考试的学习进度：删除该考试全部卡片与复习日志，再按当前词书重建新卡。
 * 破坏性操作：调用方（UI）必须先完成二次确认。
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
  await ensureCardsForExam(db, dictionary, exam, { excludeBasic: options.excludeBasic });
}
