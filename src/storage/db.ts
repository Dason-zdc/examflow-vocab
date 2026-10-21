import Dexie, { type Table } from 'dexie';
import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../domain/types';

export const SCHEMA_VERSION = 3;
export const DEFAULT_DB_NAME = 'examflow-vocab';
export const SETTINGS_KEY = 'default';
export const SYNC_STATE_KEY = 'default';

/**
 * 存储行：在领域对象之外只多同步/索引字段，领域层不感知。
 * - dueAt：到期查询索引
 * - updatedAt：同步版本（LWW 合并用；缺省视为 0，不会被推送覆盖）
 * 进出库时由 toCardRow / fromCardRow 等函数同步，避免全表扫描与字段泄漏。
 */
export interface CardRow extends Card {
  dueAt: number;
  updatedAt?: number;
}

export interface SettingsRow extends Settings {
  id: string;
  updatedAt?: number;
}

export interface ReviewLogRow extends ReviewLog {
  updatedAt?: number;
}

export interface CustomWordRow extends CustomWord {
  updatedAt?: number;
}

export interface PackChunkRow {
  key: string;
  exam: string;
  version: string;
  n: number;
  payload: unknown;
  cachedAt: number;
}

/** 同步表名（与后端 REST 字段一致） */
export type SyncTable = 'cards' | 'reviewLogs' | 'userWordMeta' | 'customWords' | 'settings';

/** 删除墓碑队列：本地物理删除后需把「已删除」推给服务端，否则会被其它设备拉回 */
export interface SyncOutboxRow {
  seq?: number;
  table: SyncTable;
  rowId: string;
  at: number;
}

/** 同步会话状态（单行）：令牌、游标、开关、最近一次结果 */
export interface SyncStateRow {
  id: string;
  enabled: boolean;
  token: string | null;
  userId: string | null;
  username: string | null;
  pullCursor: number;
  pushCursor: number;
  lastSyncAt: number | null;
  lastStatus: 'idle' | 'ok' | 'error';
  lastError: string | null;
  /** 首次启用 / 导入后需要整库推送一次 */
  fullPushPending: boolean;
}

/** 拼写练习日志（PRD 5.7）：只影响练习统计，不参与识记卡调度 */
export interface SpellingLogRow {
  id: string;
  wordId: string;
  /** 是否一次拼对（含提示后拼对 false） */
  correct: boolean;
  /** 使用提示（Tab 显示下一个字母）的次数 */
  hintsUsed: number;
  typed: string;
  createdAt: number;
}

export function toCardRow(card: Card, updatedAt: number = Date.now()): CardRow {
  return { ...card, dueAt: card.fsrs.due.getTime(), updatedAt };
}

export function fromCardRow(row: CardRow): Card {
  const { dueAt: _dueAt, updatedAt: _updatedAt, ...rest } = row;
  return rest;
}

export class ExamFlowDB extends Dexie {
  cards!: Table<CardRow, string>;
  reviewLogs!: Table<ReviewLogRow, string>;
  userWordMeta!: Table<UserWordMeta, string>;
  customWords!: Table<CustomWordRow, string>;
  settings!: Table<SettingsRow, string>;
  packChunks!: Table<PackChunkRow, string>;
  syncOutbox!: Table<SyncOutboxRow, number>;
  syncState!: Table<SyncStateRow, string>;
  spellingLogs!: Table<SpellingLogRow, string>;

  constructor(name: string = DEFAULT_DB_NAME) {
    super(name);
    // v1 保留：已部署的 PWA 用户从 v1 升到 v2 时只新增表与索引，不动历史数据
    this.version(1).stores({
      cards: 'id, exam, wordId, senseId, kind, suspended, dueAt, [exam+dueAt], [exam+wordId]',
      reviewLogs: 'id, cardId, studyDay, reviewedAt, [cardId+studyDay]',
      userWordMeta: 'wordId, starred, updatedAt',
      customWords: 'id, lemma, createdAt',
      settings: 'id',
      packChunks: 'key, exam, [exam+version], cachedAt',
    });
    this.version(2).stores({
      cards: 'id, exam, wordId, senseId, kind, suspended, dueAt, [exam+dueAt], [exam+wordId], updatedAt',
      reviewLogs: 'id, cardId, studyDay, reviewedAt, [cardId+studyDay], updatedAt',
      userWordMeta: 'wordId, starred, updatedAt',
      customWords: 'id, lemma, createdAt, updatedAt',
      settings: 'id',
      packChunks: 'key, exam, [exam+version], cachedAt',
      syncOutbox: '++seq, table, rowId, at, [table+rowId]',
      syncState: 'id',
    });
    this.version(SCHEMA_VERSION).stores({
      cards: 'id, exam, wordId, senseId, kind, suspended, dueAt, [exam+dueAt], [exam+wordId], updatedAt',
      reviewLogs: 'id, cardId, studyDay, reviewedAt, [cardId+studyDay], updatedAt',
      userWordMeta: 'wordId, starred, updatedAt',
      customWords: 'id, lemma, createdAt, updatedAt',
      settings: 'id',
      packChunks: 'key, exam, [exam+version], cachedAt',
      syncOutbox: '++seq, table, rowId, at, [table+rowId]',
      syncState: 'id',
      spellingLogs: 'id, wordId, createdAt',
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
