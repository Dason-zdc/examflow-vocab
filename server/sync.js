import { db, nextSeq } from './db.js';

/**
 * 同步引擎（服务端）：LWW 合并 + 增量 pull。
 *
 * 协议要点：
 * - 每个变更带客户端时钟 v（updated_at），相同主键保留 v 较大者（后写覆盖）。
 * - 删除用软删（deleted=1）而非物理删，保证其它设备的 pull 能感知。
 * - sync_seq 全局单调，pull 用 cursor=上次最大 sync_seq 做增量拉取。
 *
 * 约定：客户端传来的 data 是「线格式」（snake_case 字段，fsrs/fsrs_before 为 JSON 文本），
 * 服务端只按白名单列落库，不感知领域语义；pull 时原样回传，由客户端还原。
 */

const TABLES = {
  settings: {
    idCol: null,
    cols: [
      'exam', 'exam_date', 'day_start_hour', 'max_new_per_day', 'max_review_per_day',
      'exclude_basic_words', 'accent', 'auto_play_audio', 'data_pack_version',
      'last_backup_at', 'schema_version',
    ],
  },
  cards: { idCol: 'id', cols: ['exam', 'word_id', 'sense_id', 'kind', 'fsrs', 'suspended', 'last_first_review_day'] },
  review_logs: {
    idCol: 'id',
    cols: ['card_id', 'reviewed_at', 'study_day', 'rating', 'prejudged', 'corrected', 'session_only', 'duration_ms', 'fsrs_before', 'first_review_day_before'],
  },
  user_word_meta: { idCol: 'word_id', cols: ['starred', 'note'] },
  custom_words: { idCol: 'id', cols: ['lemma', 'phonetic', 'cn', 'source_sentence', 'created_at'] },
};

const KNOWN_TABLES = Object.keys(TABLES);

// 预编译每条表的 upsert / delete 语句
const STATEMENTS = {};
for (const [table, def] of Object.entries(TABLES)) {
  const idCol = def.idCol;
  const cols = def.cols;
  const idPart = idCol ? `, ${idCol}` : '';
  const idPlace = idCol ? ', ?' : '';
  const colAssign = cols.map((c) => `${c} = excluded.${c}`).join(', ');
  const colPlace = cols.map(() => ', ?').join('');

  const upsert = db.prepare(`
    INSERT INTO ${table}(user_id${idPart}, ${cols.join(', ')}, updated_at, deleted, sync_seq)
    VALUES (?${idPlace}${colPlace}, ?, 0, ?)
    ON CONFLICT(user_id${idCol ? `, ${idCol}` : ''}) DO UPDATE SET
      ${colAssign}, updated_at = excluded.updated_at, deleted = excluded.deleted, sync_seq = excluded.sync_seq
      WHERE excluded.updated_at > ${table}.updated_at
  `);

  const tombstone = db.prepare(`
    INSERT INTO ${table}(user_id${idPart}, updated_at, deleted, sync_seq)
    VALUES (?${idPlace}, ?, 1, ?)
    ON CONFLICT(user_id${idCol ? `, ${idCol}` : ''}) DO UPDATE SET
      deleted = 1, updated_at = excluded.updated_at, sync_seq = excluded.sync_seq
      WHERE excluded.updated_at > ${table}.updated_at
  `);

  STATEMENTS[table] = { upsert, tombstone };
}

function applyChange(userId, table, change) {
  const def = TABLES[table];
  if (!def) return;
  const seq = nextSeq();
  const idCol = def.idCol;
  const idVal = idCol ? (change.data?.[idCol] ?? null) : null;

  if (change.op === 'delete') {
    const stmt = STATEMENTS[table].tombstone;
    if (idCol) stmt.run(userId, idVal, change.v, seq);
    else stmt.run(userId, change.v, seq);
    return;
  }

  // upsert
  const cols = def.cols;
  const vals = cols.map((c) => (change.data ? change.data[c] : null));
  const stmt = STATEMENTS[table].upsert;
  const args = idCol ? [userId, idVal, ...vals, change.v, seq] : [userId, ...vals, change.v, seq];
  stmt.run(...args);
}

/** 应用一次 push：遍历客户端上报的所有表变更。 */
export function applyPush(userId, changes) {
  if (!changes || typeof changes !== 'object') return;
  for (const table of KNOWN_TABLES) {
    const list = changes[table];
    if (!Array.isArray(list)) continue;
    for (const change of list) {
      if (!change || typeof change !== 'object') continue;
      applyChange(userId, table, change);
    }
  }
}

/** 增量 pull：返回 sync_seq 大于 cursor 的所有行（含墓碑）。 */
export function applyPull(userId, cursor) {
  const out = {};
  for (const [table, def] of Object.entries(TABLES)) {
    const idCol = def.idCol;
    const selectCols = (idCol ? `${idCol}, ` : '') + def.cols.join(', ');
    const rows = db
      .prepare(`SELECT ${selectCols}, updated_at, deleted FROM ${table} WHERE user_id = ? AND sync_seq > ? ORDER BY sync_seq`)
      .all(userId, cursor);
    out[table] = rows.map((r) => {
      const row = { v: r.updated_at, deleted: Boolean(r.deleted) };
      if (idCol) row.id = r[idCol];
      for (const c of def.cols) row[c] = r[c];
      return row;
    });
  }
  return out;
}
