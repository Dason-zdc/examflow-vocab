import { createEmptyCard } from 'ts-fsrs';
import type { CustomWord, ExamCode } from '../domain/types';
import { toCardRow, type ExamFlowDB } from '../storage/db';

/**
 * 点词即查 → 加入生词本（PRD 5.8）：
 * 词库外的词落成自定义词条，并立即生成一张 CUSTOM 卡进入新卡队列。
 * id 由 lemma 稳定哈希得到，重复加入不会产生重复词条/卡片。
 */

function hashId(value: string): string {
  let h = 5381;
  for (let i = 0; i < value.length; i += 1) {
    h = ((h << 5) + h + value.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

export interface AddCustomWordInput {
  lemma: string;
  phonetic?: string;
  cn?: string;
  sourceSentence?: string;
}

export interface AddCustomWordResult {
  wordId: string;
  cardId: string;
  alreadyExisted: boolean;
}

export async function addCustomWord(
  db: ExamFlowDB,
  input: AddCustomWordInput,
  exam: ExamCode,
): Promise<AddCustomWordResult> {
  const lemma = input.lemma.trim();
  if (!lemma) throw new Error('生词不能为空');

  const id = `cw_${hashId(lemma.toLowerCase())}`;
  const now = Date.now();
  const existing = await db.customWords.get(id);

  const word: CustomWord = {
    id,
    lemma,
    phonetic: input.phonetic?.trim() ?? '',
    cn: input.cn?.trim() ?? '',
    ...(input.sourceSentence ? { sourceSentence: input.sourceSentence } : {}),
    createdAt: existing?.createdAt ?? now,
  };
  await db.customWords.put({ ...word, updatedAt: now });

  const cardId = `${exam}:${id}`;
  const card = await db.cards.get(cardId);
  if (!card) {
    await db.cards.put(
      toCardRow(
        {
          id: cardId,
          exam,
          wordId: id,
          senseId: id,
          kind: 'CUSTOM',
          fsrs: createEmptyCard(new Date(now)),
          suspended: false,
          lastFirstReviewDay: null,
        },
        now,
      ),
    );
  }

  return { wordId: id, cardId, alreadyExisted: Boolean(existing) };
}

/** 删除自定义词及其卡片（生词本清理用） */
export async function removeCustomWord(db: ExamFlowDB, wordId: string): Promise<void> {
  await db.customWords.delete(wordId);
  const cardIds = await db.cards.where('wordId').equals(wordId).primaryKeys();
  if (cardIds.length > 0) await db.cards.bulkDelete(cardIds);
}
