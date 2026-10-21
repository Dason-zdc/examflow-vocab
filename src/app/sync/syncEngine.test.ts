import { afterEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { ExamFlowDB, toCardRow } from '../../storage/db';
import { patchSyncState, syncNow } from './syncEngine';
import { encodeCard, toPullPlan } from './wire';
import { makeCard } from '../../test/factories';
import { DEFAULT_SETTINGS } from '../../domain/types';

const NOW = new Date(2026, 9, 21, 10, 0).getTime();

async function freshDb(): Promise<ExamFlowDB> {
  const name = `test-sync-${crypto.randomUUID()}`;
  const db = new ExamFlowDB(name);
  await db.delete();
  await db.open();
  return db;
}

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function fsrsJson(reps: number): string {
  return JSON.stringify({
    due: '2026-10-22T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsed_days: 0,
    scheduled_days: 1,
    reps,
    lapses: 0,
    state: 2,
    last_review: '2026-10-21T00:00:00.000Z',
  });
}

function wireCard(v: number, reps: number, deleted = false) {
  return {
    id: 'IELTS:s_1',
    v,
    deleted,
    exam: 'IELTS',
    word_id: 'w_address',
    sense_id: 's_1',
    kind: 'PRIMARY',
    fsrs: fsrsJson(reps),
    suspended: 0,
    last_first_review_day: '2026-10-21',
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('同步：wire 编解码', () => {
  it('卡片编码后拉取解码，fsrs.due 还原为 Date 且内容等价', () => {
    const card = makeCard('IELTS:s_1', { exam: 'IELTS', wordId: 'w_address', senseId: 's_1', now: NOW, reps: 2 });
    const change = encodeCard(toCardRow(card, NOW), NOW);
    expect(change.op).toBe('upsert');
    expect(typeof change.data?.fsrs).toBe('string');

    const plan = toPullPlan({ cards: [{ ...(change.data as Record<string, unknown>), v: NOW, deleted: false }] });
    expect(plan.cards).toHaveLength(1);
    const data = plan.cards[0]?.data;
    expect(data).not.toBeNull();
    expect(data?.fsrs).toBeInstanceOf(Object);
    expect(data?.fsrs.due instanceof Date).toBe(true);
    expect(data).toEqual(card);
  });

  it('墓碑行解出 deleted，不构造 data', () => {
    const plan = toPullPlan({ cards: [wireCard(NOW, 1, true)] });
    expect(plan.cards[0]).toEqual({ id: 'IELTS:s_1', v: NOW, deleted: true, data: null });
  });
});

describe('同步：pull 合并（LWW）', () => {
  it('云端学习进度覆盖本地派生卡，并推进游标', async () => {
    const db = await freshDb();
    await db.cards.put(toCardRow(makeCard('IELTS:s_1', { exam: 'IELTS', wordId: 'w_address', senseId: 's_1', now: NOW }), 0));
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: NOW * 2 });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, cursor: 7, changes: { cards: [wireCard(NOW, 3)] } })));
    const result = await syncNow(db);

    expect(result.status).toBe('ok');
    expect(result.applied).toBe(1);
    const row = await db.cards.get('IELTS:s_1');
    expect(row?.fsrs.reps).toBe(3);
    expect(row?.fsrs.due instanceof Date).toBe(true);
    expect(row?.updatedAt).toBe(NOW);
    expect((await db.syncState.get('default'))?.pullCursor).toBe(7);
    db.close();
  });

  it('更旧的云端版本不覆盖更晚的本地改动', async () => {
    const db = await freshDb();
    await db.cards.put(toCardRow(makeCard('IELTS:s_1', { exam: 'IELTS', wordId: 'w_address', senseId: 's_1', now: NOW, reps: 9 }), NOW));
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: NOW * 2 });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, cursor: 2, changes: { cards: [wireCard(NOW - 5000, 1)] } })));
    const result = await syncNow(db);

    expect(result.applied).toBe(0);
    expect((await db.cards.get('IELTS:s_1'))?.fsrs.reps).toBe(9);
    db.close();
  });

  it('云端墓碑删除本地卡片', async () => {
    const db = await freshDb();
    await db.cards.put(toCardRow(makeCard('IELTS:s_1', { exam: 'IELTS', wordId: 'w_address', senseId: 's_1', now: NOW }), NOW - 1000));
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: NOW * 2 });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, cursor: 3, changes: { cards: [wireCard(NOW, 0, true)] } })));
    await syncNow(db);

    expect(await db.cards.get('IELTS:s_1')).toBeUndefined();
    db.close();
  });

  it('本地未初始化设置时，云端考期接管', async () => {
    const db = await freshDb();
    await db.settings.put({ id: 'default', ...DEFAULT_SETTINGS, examDate: '', updatedAt: NOW });
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: NOW * 2 });

    const remoteSettings = {
      v: NOW - 5000,
      deleted: false,
      exam: 'IELTS',
      exam_date: '2026-12-20',
      day_start_hour: 4,
      max_new_per_day: 40,
      max_review_per_day: 300,
      exclude_basic_words: 1,
      accent: 'uk',
      auto_play_audio: 0,
      data_pack_version: '1.1.0',
      last_backup_at: null,
      schema_version: 2,
    };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ ok: true, cursor: 4, changes: { settings: [remoteSettings] } })));
    await syncNow(db);

    expect((await db.settings.get('default'))?.examDate).toBe('2026-12-20');
    db.close();
  });
});

describe('同步：push 增量', () => {
  it('只推送学习卡，派生卡（版本 0）不推送', async () => {
    const db = await freshDb();
    await db.cards.bulkPut([
      toCardRow(makeCard('IELTS:s_1', { exam: 'IELTS', wordId: 'w_address', senseId: 's_1', now: NOW }), 0),
      toCardRow(makeCard('IELTS:s_2', { exam: 'IELTS', wordId: 'w_anchor', senseId: 's_2', now: NOW, reps: 4 }), NOW),
    ]);
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: 0 });

    const captured: { body: { changes: { cards: unknown[] } } | null } = { body: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          captured.body = JSON.parse(String(init.body)) as { changes: { cards: unknown[] } };
          return jsonResponse({ ok: true, cursor: 9 });
        }
        return jsonResponse({ ok: true, cursor: 0, changes: {} });
      }),
    );

    const result = await syncNow(db);
    expect(result.status).toBe('ok');
    const body = captured.body;
    expect(body).not.toBeNull();
    expect(body?.changes.cards).toHaveLength(1);
    expect((await db.syncState.get('default'))?.pushCursor).toBeGreaterThanOrEqual(NOW);
    db.close();
  });

  it('墓碑随推送上报，成功后清空 outbox', async () => {
    const db = await freshDb();
    await db.syncOutbox.add({ table: 'reviewLogs', rowId: 'IELTS:s_1#1', at: NOW });
    await patchSyncState(db, { enabled: true, token: 't', pullCursor: 0, pushCursor: 0 });

    const captured: { body: { changes: { review_logs: { op: string }[] } } | null } = { body: null };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          captured.body = JSON.parse(String(init.body)) as { changes: { review_logs: { op: string }[] } };
          return jsonResponse({ ok: true, cursor: 11 });
        }
        return jsonResponse({ ok: true, cursor: 0, changes: {} });
      }),
    );

    await syncNow(db);
    expect(captured.body?.changes.review_logs[0]?.op).toBe('delete');
    expect(await db.syncOutbox.count()).toBe(0);
    db.close();
  });
});
