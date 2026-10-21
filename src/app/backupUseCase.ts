import type { BackupFile } from '../storage/backupService';
import {
  cardFromBackup,
  exportBackup,
  reviewLogFromBackup,
  validateBackup,
} from '../storage/backupService';
import type { ExamFlowDB } from '../storage/db';
import { applyImportPlan, type ImportPlan } from './transactions';

export type ImportMode = 'overwrite' | 'merge';

export interface ImportOptions {
  mode?: ImportMode;
  /** 导入前调用，参数为当前数据的备份（PRD §7.2：导入前先自动导出当前数据） */
  onBeforeImport?: (current: BackupFile) => void | Promise<void>;
}

export interface ImportResult {
  cards: number;
  reviewLogs: number;
  userWordMeta: number;
  customWords: number;
  settings: boolean;
  mode: ImportMode;
}

/**
 * 备份导入用例（PRD §7.2）：
 * 1. 校验格式；
 * 2. 导入前先自动导出当前数据（onBeforeImport 回调由 UI 负责落盘）；
 * 3. merge 模式的冲突裁决在事务外完成（读现有行 → 算计划，纯函数）；
 * 4. 交给 src/app/transactions.ts 在单一 rw 事务内落库，失败整体回滚。
 */
export async function importBackup(
  db: ExamFlowDB,
  file: BackupFile,
  options: ImportOptions = {},
): Promise<ImportResult> {
  validateBackup(file);
  const mode = options.mode ?? 'overwrite';
  if (options.onBeforeImport) {
    await options.onBeforeImport(await exportBackup(db));
  }

  const incomingCards = file.cards.map(cardFromBackup);
  const incomingLogs = file.reviewLogs.map(reviewLogFromBackup);

  let userWordMeta = file.userWordMeta;
  let customWords = file.customWords;
  if (mode === 'merge') {
    // 按 updatedAt / createdAt 后写覆盖：本地更新的行保留本地值
    const [existingMeta, existingWords] = await Promise.all([
      db.userWordMeta.toArray(),
      db.customWords.toArray(),
    ]);
    const metaByWord = new Map(existingMeta.map((m) => [m.wordId, m]));
    userWordMeta = file.userWordMeta.map((m) => {
      const existing = metaByWord.get(m.wordId);
      return !existing || m.updatedAt >= existing.updatedAt ? m : existing;
    });
    const wordById = new Map(existingWords.map((w) => [w.id, w]));
    customWords = file.customWords.map((w) => {
      const existing = wordById.get(w.id);
      return !existing || w.createdAt >= existing.createdAt ? w : existing;
    });
  }

  const plan: ImportPlan = {
    mode,
    clearFirst: mode === 'overwrite',
    cards: incomingCards,
    reviewLogs: incomingLogs,
    userWordMeta,
    customWords,
    settings: file.settings,
  };
  await applyImportPlan(db, plan);

  return {
    cards: incomingCards.length,
    reviewLogs: incomingLogs.length,
    userWordMeta: file.userWordMeta.length,
    customWords: file.customWords.length,
    settings: Boolean(file.settings),
    mode,
  };
}
