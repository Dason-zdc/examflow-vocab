import type { Card as FsrsCard } from 'ts-fsrs';
import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../domain/types';
import { SCHEMA_VERSION, SETTINGS_KEY, fromCardRow, type ExamFlowDB } from './db';

export const BACKUP_FORMAT = 'examflow-backup';
export const SUPPORTED_BACKUP_FORMAT_VERSION = 1;

/** JSON 里的 Date 一律用 ISO 字符串，避免往返后类型悄悄退化成字符串 */
export type JsonFsrsCard = Omit<FsrsCard, 'due' | 'last_review'> & {
  due: string;
  last_review: string | null;
};

export type BackupCard = Omit<Card, 'fsrs'> & { fsrs: JsonFsrsCard };
export type BackupReviewLog = Omit<ReviewLog, 'fsrsBefore'> & { fsrsBefore?: JsonFsrsCard };

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  formatVersion: number;
  exportedAt: string;
  schemaVersion: number;
  settings: Settings | null;
  cards: BackupCard[];
  reviewLogs: BackupReviewLog[];
  userWordMeta: UserWordMeta[];
  customWords: CustomWord[];
}

export class BackupFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupFormatError';
  }
}

function toJsonFsrs(card: FsrsCard): JsonFsrsCard {
  const { due, last_review, ...rest } = card;
  return { ...rest, due: due.toISOString(), last_review: last_review ? last_review.toISOString() : null };
}

function fromJsonFsrs(json: JsonFsrsCard): FsrsCard {
  const { due, last_review, ...rest } = json;
  return { ...rest, due: new Date(due), ...(last_review ? { last_review: new Date(last_review) } : {}) };
}

export function cardToBackup(card: Card): BackupCard {
  return { ...card, fsrs: toJsonFsrs(card.fsrs) };
}

export function cardFromBackup(json: BackupCard): Card {
  return { ...json, fsrs: fromJsonFsrs(json.fsrs) };
}

export function reviewLogToBackup(log: ReviewLog): BackupReviewLog {
  const { fsrsBefore, ...rest } = log;
  return fsrsBefore ? { ...rest, fsrsBefore: toJsonFsrs(fsrsBefore) } : { ...rest };
}

export function reviewLogFromBackup(json: BackupReviewLog): ReviewLog {
  const { fsrsBefore, ...rest } = json;
  return fsrsBefore ? { ...rest, fsrsBefore: fromJsonFsrs(fsrsBefore) } : { ...rest };
}

export async function exportBackup(db: ExamFlowDB): Promise<BackupFile> {
  const [cards, reviewLogs, userWordMeta, customWords, settings] = await Promise.all([
    db.cards.toArray(),
    db.reviewLogs.toArray(),
    db.userWordMeta.toArray(),
    db.customWords.toArray(),
    db.settings.get(SETTINGS_KEY),
  ]);

  // AI Key 属于本机凭证，不进备份文件（PRD 8.3）
  const { id: _id, updatedAt: _settingsVersion, aiApiKey: _aiKey, ...settingsValue } = settings ?? ({} as { id?: string; updatedAt?: number; aiApiKey?: string } & Settings);

  return {
    format: BACKUP_FORMAT,
    formatVersion: SUPPORTED_BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    schemaVersion: SCHEMA_VERSION,
    settings: settings ? (settingsValue as Settings) : null,
    cards: cards.map((row) => cardToBackup(fromCardRow(row))),
    reviewLogs: reviewLogs.map(({ updatedAt: _v, ...log }) => reviewLogToBackup(log)),
    userWordMeta,
    customWords: customWords.map(({ updatedAt: _v, ...word }) => word),
  };
}

export function parseBackup(text: string): BackupFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new BackupFormatError('备份文件不是合法 JSON');
  }
  return validateBackup(raw);
}

export function validateBackup(raw: unknown): BackupFile {
  if (typeof raw !== 'object' || raw === null) {
    throw new BackupFormatError('备份文件内容为空或不是对象');
  }
  const file = raw as Partial<BackupFile>;
  if (file.format !== BACKUP_FORMAT) {
    throw new BackupFormatError(`不是 ${BACKUP_FORMAT} 备份文件`);
  }
  if (typeof file.formatVersion !== 'number') {
    throw new BackupFormatError('备份文件缺少 formatVersion');
  }
  if (file.formatVersion > SUPPORTED_BACKUP_FORMAT_VERSION) {
    throw new BackupFormatError(
      `备份文件版本 ${file.formatVersion} 高于客户端支持的 ${SUPPORTED_BACKUP_FORMAT_VERSION}，请升级后再导入`,
    );
  }
  for (const key of ['cards', 'reviewLogs', 'userWordMeta', 'customWords'] as const) {
    if (!Array.isArray(file[key])) {
      throw new BackupFormatError(`备份文件缺少数组字段 ${key}`);
    }
  }
  return file as BackupFile;
}

export function serializeBackup(file: BackupFile): string {
  return JSON.stringify(file, null, 2);
}
