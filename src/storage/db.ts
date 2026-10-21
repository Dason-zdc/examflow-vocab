import Dexie, { type Table } from 'dexie';
import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../domain/types';

export const SCHEMA_VERSION = 1;
export const DEFAULT_DB_NAME = 'examflow-vocab';
export const SETTINGS_KEY = 'default';

/**
 * 存储行：在领域 Card 之外只多一个 dueAt，用于给「到期查询」建索引。
 * 领域层不感知该字段，进出库时由 toCardRow / fromCardRow 同步，避免出现全表扫描。
 */
export interface CardRow extends Card {
  dueAt: number;
}

export interface SettingsRow extends Settings {
  id: string;
}

export interface PackChunkRow {
  key: string;
  exam: string;
  version: string;
  n: number;
  payload: unknown;
  cachedAt: number;
}

export function toCardRow(card: Card): CardRow {
  return { ...card, dueAt: card.fsrs.due.getTime() };
}

export function fromCardRow(row: CardRow): Card {
  const { dueAt: _dueAt, ...rest } = row;
  return rest;
}

export class ExamFlowDB extends Dexie {
  cards!: Table<CardRow, string>;
  reviewLogs!: Table<ReviewLog, string>;
  userWordMeta!: Table<UserWordMeta, string>;
  customWords!: Table<CustomWord, string>;
  settings!: Table<SettingsRow, string>;
  packChunks!: Table<PackChunkRow, string>;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    this.version(SCHEMA_VERSION).stores({
      cards: 'id, exam, wordId, senseId, kind, suspended, dueAt, [exam+dueAt], [exam+wordId]',
      reviewLogs: 'id, cardId, studyDay, reviewedAt, [cardId+studyDay]',
      userWordMeta: 'wordId, starred, updatedAt',
      customWords: 'id, lemma, createdAt',
      settings: 'id',
      packChunks: 'key, exam, [exam+version], cachedAt',
    });
  }
}

/** 读取已存在数据库的版本号；不存在或读取失败返回 0 */
export async function probeSchemaVersion(name: string = DEFAULT_DB_NAME): Promise<number> {
  let probe: Dexie | null = null;
  try {
    probe = new Dexie(name);
    await probe.open();
    return probe.verno;
  } catch {
    return 0;
  } finally {
    probe?.close();
  }
}

export interface OpenDatabaseOptions {
  name?: string;
  /**
   * 迁移前调用，参数为当前数据的快照（调用方负责落盘/导出）。
   * PRD §6：schemaVersion 变化时执行迁移脚本，迁移前自动生成一份本地备份。
   */
  onBeforeUpgrade?: (snapshot: unknown) => void | Promise<void>;
  /** 生成迁移前快照；默认直接传 null（无历史数据时不阻塞迁移） */
  snapshot?: (name: string) => Promise<unknown> | unknown;
}

export async function openDatabase(options: OpenDatabaseOptions = {}): Promise<ExamFlowDB> {
  const name = options.name ?? DEFAULT_DB_NAME;
  const current = await probeSchemaVersion(name);

  if (current > 0 && current < SCHEMA_VERSION && options.snapshot && options.onBeforeUpgrade) {
    const snapshot = await options.snapshot(name);
    await options.onBeforeUpgrade(snapshot);
  }

  const db = new ExamFlowDB(name);
  await db.open();
  return db;
}

/** 申请持久化存储，降低浏览器自动清理本地数据的概率（PRD §9） */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
