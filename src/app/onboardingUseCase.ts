import type { Card, ExamCode, Settings } from '../domain/types';
import { buildCardsForWord } from '../domain/scheduler';
import type { PackDictionary } from '../content/dictionary';
import { SETTINGS_KEY, toCardRow, type ExamFlowDB } from '../storage/db';

/**
 * 装机 / 切换考试用例：为词书建卡。
 *
 * 幂等设计：卡片 ID 由 exam + senseId 决定（cardIdOf），重复执行只补缺的。
 * 不使用事务：bulkPut 分批落库，中途失败时重跑即可收敛——2000 词最多约 4000 行，
 * 单条 bulkPut 批量 500 行，避免长事务阻塞渲染线程。
 */

export interface EnsureCardsResult {
  created: number;
  skippedBasic: number;
  alreadyExists: number;
}

export async function ensureCardsForExam(
  db: ExamFlowDB,
  dictionary: PackDictionary,
  exam: ExamCode,
  options: { excludeBasic: boolean; batchSize?: number; onProgress?: (done: number, total: number) => void },
): Promise<EnsureCardsResult> {
  const now = Date.now();
  const batchSize = options.batchSize ?? 500;

  const existing = new Set(await db.cards.where('exam').equals(exam).primaryKeys());
  const candidates = dictionary.wordsForExam(exam);

  const pending: Card[] = [];
  let skippedBasic = 0;
  for (const word of candidates) {
    if (options.excludeBasic && word.isBasic) {
      skippedBasic += 1;
      continue;
    }
    for (const card of buildCardsForWord(word, exam, { now })) {
      if (existing.has(card.id)) continue;
      pending.push(card);
    }
  }

  let created = 0;
  for (let i = 0; i < pending.length; i += batchSize) {
    const batch = pending.slice(i, i + batchSize);
    await db.cards.bulkPut(batch.map(toCardRow));
    created += batch.length;
    options.onProgress?.(created, pending.length);
  }

  return { created, skippedBasic, alreadyExists: existing.size };
}

/** 读取设置；不存在时写入默认值（examDate 由引导流程另设） */
export async function ensureSettings(
  db: ExamFlowDB,
  defaults: Omit<Settings, 'examDate'>,
  examDate: string,
): Promise<Settings> {
  const row = await db.settings.get(SETTINGS_KEY);
  if (row) {
    const { id: _id, ...rest } = row;
    return rest as Settings;
  }
  const settings: Settings = { ...defaults, examDate };
  await db.settings.put({ id: SETTINGS_KEY, ...settings });
  return settings;
}

/** 整份保存设置（设置弹窗保存 / 标记备份时间用） */
export async function saveSettings(db: ExamFlowDB, next: Settings): Promise<Settings> {
  await db.settings.put({ id: SETTINGS_KEY, ...next });
  return next;
}

/** 切换考试：写设置 + 确保新考试卡片存在（幂等） */
export async function activateExam(
  db: ExamFlowDB,
  dictionary: PackDictionary,
  exam: ExamCode,
): Promise<{ settings: Settings; cards: EnsureCardsResult }> {
  const row = await db.settings.get(SETTINGS_KEY);
  const current = row ? ({ ...row } as unknown as Settings) : null;
  const settings: Settings = current
    ? { ...current, exam }
    : { exam, examDate: '', dayStartHour: 4, maxNewPerDay: 50, maxReviewPerDay: 300, excludeBasicWords: true, accent: 'uk', autoPlayAudio: false, dataPackVersion: '0.0.0', lastBackupAt: null, schemaVersion: 1 };
  await db.settings.put({ id: SETTINGS_KEY, ...settings });
  const cards = await ensureCardsForExam(db, dictionary, exam, { excludeBasic: settings.excludeBasicWords });
  return { settings, cards };
}
