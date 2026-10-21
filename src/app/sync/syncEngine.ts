import type { ExamFlowDB, SyncStateRow } from '../../storage/db';
import { SETTINGS_KEY, SYNC_STATE_KEY } from '../../storage/db';
import { mergePull } from '../transactions';
import { ApiError, apiRequest } from './apiClient';
import { encodeCard, encodeCustom, encodeLog, encodeMeta, encodeSettings, toPullPlan } from './wire';
import type { AuthResponse, PushChange, PushChanges, SyncRunResult, WireChanges } from './types';

/** 同步引擎（客户端）：pull 合并 → push 增量，离线优先，本地库始终是主数据源。 */

export const EMPTY_SYNC_STATE: SyncStateRow = {
  id: SYNC_STATE_KEY,
  enabled: false,
  token: null,
  userId: null,
  username: null,
  pullCursor: 0,
  pushCursor: 0,
  lastSyncAt: null,
  lastStatus: 'idle',
  lastError: null,
  fullPushPending: false,
};

export async function loadSyncState(db: ExamFlowDB): Promise<SyncStateRow> {
  const row = await db.syncState.get(SYNC_STATE_KEY);
  return { ...EMPTY_SYNC_STATE, ...row, id: SYNC_STATE_KEY };
}

export async function patchSyncState(db: ExamFlowDB, patch: Partial<SyncStateRow>): Promise<SyncStateRow> {
  const next: SyncStateRow = { ...(await loadSyncState(db)), ...patch, id: SYNC_STATE_KEY };
  await db.syncState.put(next);
  return next;
}

async function authenticate(db: ExamFlowDB, path: '/auth/register' | '/auth/login', username: string, password: string): Promise<AuthResponse> {
  const auth = await apiRequest<AuthResponse>(path, { method: 'POST', body: { username, password } });
  await patchSyncState(db, {
    enabled: true,
    token: auth.token,
    userId: auth.userId,
    username: auth.username,
    pullCursor: 0,
    pushCursor: 0,
    fullPushPending: true,
    lastStatus: 'idle',
    lastError: null,
  });
  return auth;
}

export function registerAccount(db: ExamFlowDB, username: string, password: string): Promise<AuthResponse> {
  return authenticate(db, '/auth/register', username, password);
}

export function loginAccount(db: ExamFlowDB, username: string, password: string): Promise<AuthResponse> {
  return authenticate(db, '/auth/login', username, password);
}

/** 退出登录：清令牌与游标；本地数据保留，重新登录会整库对账一次 */
export async function logoutAccount(db: ExamFlowDB): Promise<void> {
  await patchSyncState(db, {
    enabled: false,
    token: null,
    userId: null,
    username: null,
    pullCursor: 0,
    pushCursor: 0,
    fullPushPending: false,
    lastStatus: 'idle',
    lastError: null,
  });
}

interface BuiltPush {
  changes: PushChanges;
  maxVersion: number;
  count: number;
  outboxSeqs: number[];
}

/**
 * 组装待推送变更。
 * - 常规：只推 updatedAt > pushCursor 的行（派生卡 updatedAt=0 永不推送）
 * - fullPushPending：推全量，用于首次启用 / 导入后对账
 * - 删除：来自 syncOutbox 墓碑
 * - 设置：examDate 为空（未初始化）时不推，避免新设备覆盖云端考期
 */
async function buildPushChanges(db: ExamFlowDB, state: SyncStateRow): Promise<BuiltPush> {
  const full = state.fullPushPending;
  const since = state.pushCursor;
  const changes: PushChanges = { settings: [], cards: [], review_logs: [], user_word_meta: [], custom_words: [] };
  const outboxSeqs: number[] = [];
  let maxVersion = since;

  const cardRows = full
    ? await db.cards.toArray()
    : await db.cards.where('updatedAt').above(since).toArray();
  for (const row of cardRows) {
    const v = row.updatedAt ?? 0;
    if (v <= 0 || (!full && v <= since)) continue;
    changes.cards.push(encodeCard(row, v));
    maxVersion = Math.max(maxVersion, v);
  }

  const logRows = full
    ? await db.reviewLogs.toArray()
    : await db.reviewLogs.where('updatedAt').above(since).toArray();
  for (const row of logRows) {
    const v = row.updatedAt ?? 0;
    if (v <= 0 || (!full && v <= since)) continue;
    changes.review_logs.push(encodeLog(row, v));
    maxVersion = Math.max(maxVersion, v);
  }

  for (const row of await db.userWordMeta.toArray()) {
    const v = row.updatedAt ?? 0;
    if (v <= 0 || (!full && v <= since)) continue;
    changes.user_word_meta.push(encodeMeta(row, v));
    maxVersion = Math.max(maxVersion, v);
  }

  for (const row of await db.customWords.toArray()) {
    const v = row.updatedAt ?? 0;
    if (v <= 0 || (!full && v <= since)) continue;
    changes.custom_words.push(encodeCustom(row, v));
    maxVersion = Math.max(maxVersion, v);
  }

  const settingsRow = await db.settings.get(SETTINGS_KEY);
  if (settingsRow) {
    const v = settingsRow.updatedAt ?? 0;
    if (v > 0 && (full || v > since) && settingsRow.examDate !== '') {
      changes.settings.push(encodeSettings(settingsRow, v));
      maxVersion = Math.max(maxVersion, v);
    }
  }

  for (const row of await db.syncOutbox.toArray()) {
    if (row.seq === undefined) continue;
    const data = row.table === 'userWordMeta' ? { word_id: row.rowId } : { id: row.rowId };
    const change: PushChange = { op: 'delete', v: row.at, data };
    if (row.table === 'cards') changes.cards.push(change);
    else if (row.table === 'reviewLogs') changes.review_logs.push(change);
    else if (row.table === 'userWordMeta') changes.user_word_meta.push(change);
    else if (row.table === 'customWords') changes.custom_words.push(change);
    outboxSeqs.push(row.seq);
    maxVersion = Math.max(maxVersion, row.at);
  }

  const count =
    changes.settings.length +
    changes.cards.length +
    changes.review_logs.length +
    changes.user_word_meta.length +
    changes.custom_words.length;

  return { changes, maxVersion, count, outboxSeqs };
}

/** 执行一次同步：拉取远端增量 → LWW 合并 → 推送本地增量。 */
export async function syncNow(db: ExamFlowDB): Promise<SyncRunResult> {
  const state = await loadSyncState(db);
  if (!state.enabled || !state.token) return { status: 'disabled', applied: 0, pushed: 0 };

  try {
    const pulled = await apiRequest<{ cursor: number; changes: WireChanges }>(
      `/sync?cursor=${state.pullCursor}`,
      { token: state.token },
    );
    const applied = await mergePull(db, toPullPlan(pulled.changes ?? {}));
    if (pulled.cursor > state.pullCursor) await patchSyncState(db, { pullCursor: pulled.cursor });

    const current = await loadSyncState(db);
    const built = await buildPushChanges(db, current);
    let cursor = Math.max(current.pullCursor, pulled.cursor);

    if (built.count > 0) {
      const pushed = await apiRequest<{ cursor: number }>('/sync', {
        method: 'POST',
        token: state.token,
        body: { changes: built.changes },
      });
      cursor = Math.max(cursor, pushed.cursor);
      if (built.outboxSeqs.length > 0) await db.syncOutbox.bulkDelete(built.outboxSeqs);
    }

    await patchSyncState(db, {
      pullCursor: cursor,
      pushCursor: Math.max(built.maxVersion, current.pushCursor),
      lastSyncAt: Date.now(),
      lastStatus: 'ok',
      lastError: null,
      fullPushPending: false,
    });
    return { status: 'ok', applied, pushed: built.count };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const patch: Partial<SyncStateRow> = { lastStatus: 'error', lastError: message, lastSyncAt: Date.now() };
    // 令牌失效：自动登出，避免每 30s 反复撞 401
    if (err instanceof ApiError && err.status === 401) {
      Object.assign(patch, { enabled: false, token: null, userId: null, username: null, fullPushPending: false });
    }
    await patchSyncState(db, patch);
    return { status: 'error', applied: 0, pushed: 0, error: message };
  }
}
