import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from './config.js';

/**
 * SQLite 访问层（零依赖，使用 Node 内置 node:sqlite）。
 *
 * 同步模型：每个可同步表都带 updated_at（客户端时钟，用于 LWW 合并）与
 * deleted（软删/墓碑）。sync_seq_counter 提供全局单调游标，pull 接口用它做增量拉取。
 *
 * 约定：所有写都通过本模块暴露的函数，调用方不要自行拼 SQL，方便集中审查。
 */

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA busy_timeout = 5000;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pass_hash TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    user_id TEXT PRIMARY KEY,
    exam TEXT NOT NULL DEFAULT 'IELTS',
    exam_date TEXT NOT NULL DEFAULT '',
    day_start_hour INTEGER NOT NULL DEFAULT 4,
    max_new_per_day INTEGER NOT NULL DEFAULT 50,
    max_review_per_day INTEGER NOT NULL DEFAULT 300,
    exclude_basic_words INTEGER NOT NULL DEFAULT 1,
    accent TEXT NOT NULL DEFAULT 'uk',
    auto_play_audio INTEGER NOT NULL DEFAULT 0,
    data_pack_version TEXT NOT NULL DEFAULT '0.0.0',
    last_backup_at INTEGER,
    schema_version INTEGER NOT NULL DEFAULT 2,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS cards (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    exam TEXT,
    word_id TEXT,
    sense_id TEXT,
    kind TEXT,
    fsrs TEXT,
    suspended INTEGER NOT NULL DEFAULT 0,
    last_first_review_day TEXT,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER,
    PRIMARY KEY(user_id, id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS review_logs (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    card_id TEXT,
    reviewed_at INTEGER,
    study_day TEXT,
    rating TEXT,
    prejudged INTEGER,
    corrected INTEGER,
    session_only INTEGER,
    duration_ms INTEGER,
    fsrs_before TEXT,
    first_review_day_before TEXT,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER,
    PRIMARY KEY(user_id, id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS user_word_meta (
    user_id TEXT NOT NULL,
    word_id TEXT NOT NULL,
    starred INTEGER NOT NULL DEFAULT 0,
    note TEXT NOT NULL DEFAULT '',
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER,
    PRIMARY KEY(user_id, word_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS custom_words (
    id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    lemma TEXT,
    phonetic TEXT,
    cn TEXT,
    source_sentence TEXT,
    created_at INTEGER,
    updated_at INTEGER NOT NULL,
    deleted INTEGER NOT NULL DEFAULT 0,
    sync_seq INTEGER,
    PRIMARY KEY(user_id, id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS packs (
    pack_id TEXT PRIMARY KEY,
    version TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    word_count INTEGER NOT NULL DEFAULT 0,
    sense_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sync_seq_counter (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    value INTEGER NOT NULL
  );
`);

db.exec('INSERT OR IGNORE INTO sync_seq_counter(id, value) VALUES (1, 0);');

/** 取下一个全局同步序号（单调，用于 pull 游标与增量拉取）。 */
export function nextSeq() {
  db.exec('UPDATE sync_seq_counter SET value = value + 1 WHERE id = 1;');
  const row = db.prepare('SELECT value FROM sync_seq_counter WHERE id = 1').get();
  return row.value;
}

/** 当前全局同步序号。 */
export function currentSeq() {
  const row = db.prepare('SELECT value FROM sync_seq_counter WHERE id = 1').get();
  return row.value;
}
