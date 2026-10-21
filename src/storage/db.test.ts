import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { State } from 'ts-fsrs';
import {
  DEFAULT_DB_NAME,
  ExamFlowDB,
  SETTINGS_KEY,
  fromCardRow,
  probeSchemaVersion,
  openDatabase,
  toCardRow,
  requestPersistentStorage,
} from './db';
import { applyCommitPlan } from '../app/transactions';
import { exportBackup } from './backupService';
import { makeCard } from '../test/factories';
import { DEFAULT_SETTINGS, type ReviewLog } from '../domain/types';

const NOW = new Date(2026, 9, 20, 10, 0).getTime();
const DAY_MS = 86_400_000;

async function freshDb(name = DEFAULT_DB_NAME): Promise<ExamFlowDB> {
  await new ExamFlowDB(name).delete();
  const db = new ExamFlowDB(name);
  await db.open();
  return db;
}

describe('db · schema 与索引', () => {
  beforeEach(async () => {
    await new ExamFlowDB(DEFAULT_DB_NAME).delete();
  });

  it('分表建立，主键与复合索引可用', async () => {
    const db = await freshDb();
    expect(await probeSchemaVersion(DEFAULT_DB_NAME)).toBe(1);

    await db.cards.bulkPut([
      toCardRow(makeCard('KAOYAN:s_1', { now: NOW, wordId: 'w_a', stability: 5, reps: 3, state: State.Review })),
      toCardRow(makeCard('KAOYAN:s_2', { now: NOW + DAY_MS, wordId: 'w_b' })),
      toCardRow(makeCard('IELTS:s_1', { exam: 'IELTS', now: NOW, wordId: 'w_c' })),
    ]);

    // 索引查询：按 dueAt 取到期卡，无需全表扫描
    const due = await db.cards.where('dueAt').belowOrEqual(NOW).toArray();
    expect(due.map((c) => c.id).sort()).toEqual(['IELTS:s_1', 'KAOYAN:s_1']);

    /*
     * 不用 [exam+dueAt] 的 between()：fake-indexeddb 对「数组下界的 IDBKeyRange」
     * 的 includes() 恒为 false（spec 应按字典序比较数组），会让复合范围查询静默返回空集，
     * 而「到期卡为空」恰恰是最难察觉的失效。改为 exam 等值索引 + 过滤，
     * 与 queries.useDueCards 走同一条路径；词库量级（数千张）下成本可忽略。
     */
    const kaoyanDue = await db.cards.where('exam').equals('KAOYAN').and((c) => c.dueAt <= NOW).toArray();
    expect(kaoyanDue.map((c) => c.id)).toEqual(['KAOYAN:s_1']);

    // 复合索引的等值查询在 fake-indexeddb 下可用
    const byExam = await db.cards.where('[exam+wordId]').equals(['KAOYAN', 'w_a']).toArray();
    expect(byExam).toHaveLength(1);

    const byWord = await db.cards.where('wordId').equals('w_a').toArray();
    expect(byWord).toHaveLength(1);
  });

  it('进出库只多一个 dueAt，领域对象不受污染', async () => {
    const card = makeCard('KAOYAN:s_1', { now: NOW });
    const row = toCardRow(card);
    expect(row.dueAt).toBe(card.fsrs.due.getTime());
    const back = fromCardRow(row);
    expect('dueAt' in back).toBe(false);
    expect(back).toEqual(card);
  });

  it('Card + ReviewLog 在同一事务内写入；约束失败则整体回滚', async () => {
    const db = await freshDb();
    const card = makeCard('KAOYAN:s_1', { now: NOW });
    const log: ReviewLog = {
      id: 'KAOYAN:s_1#1',
      cardId: card.id,
      reviewedAt: NOW,
      studyDay: '2026-10-20',
      rating: 'GOOD',
      prejudged: false,
      corrected: false,
      sessionOnly: false,
      durationMs: 1_000,
      fsrsBefore: { ...card.fsrs },
      firstReviewDayBefore: null,
    };
    await applyCommitPlan(db, { cardAfter: { ...card, lastFirstReviewDay: '2026-10-20' }, log });
    expect(await db.cards.count()).toBe(1);
    expect(await db.reviewLogs.count()).toBe(1);

    // 重复评分 ID 触发 ConstraintError：cards 的改写必须一起回滚，不留半截数据
    const dupLog: ReviewLog = { ...log, durationMs: 2_000 };
    const regressed = { ...card, fsrs: { ...card.fsrs, reps: 99 } };
    await expect(applyCommitPlan(db, { cardAfter: regressed, log: dupLog })).rejects.toThrow();
    expect(await db.cards.count()).toBe(1);
    expect(await db.reviewLogs.count()).toBe(1);
    const after = await db.cards.get('KAOYAN:s_1');
    expect(after?.fsrs.reps).toBe(card.fsrs.reps);
  });

  it('settings 单条存储，可被覆盖', async () => {
    const db = await freshDb();
    await db.settings.put({ id: SETTINGS_KEY, ...DEFAULT_SETTINGS, examDate: '2026-12-20' });
    const loaded = await db.settings.get(SETTINGS_KEY);
    expect(loaded?.examDate).toBe('2026-12-20');
    expect(loaded?.dayStartHour).toBe(4);
  });
});

describe('db · 迁移钩子', () => {
  it('无历史数据时直接打开并写入 schemaVersion', async () => {
    await new ExamFlowDB('mig-fresh').delete();
    const db = await openDatabase({ name: 'mig-fresh' });
    await db.settings.put({ id: SETTINGS_KEY, ...DEFAULT_SETTINGS, examDate: '2026-12-20' });
    const backup = await exportBackup(db);
    expect(backup.schemaVersion).toBe(1);
    db.close();
  });

  it('已存在数据库不会被重复迁移；不支持持久化时返回 false', async () => {
    const db = await freshDb('mig-existing');
    await db.cards.put(toCardRow(makeCard('KAOYAN:s_1', { now: NOW })));
    db.close();

    let backupCalled = false;
    const reopened = await openDatabase({
      name: 'mig-existing',
      snapshot: () => null,
      onBeforeUpgrade: () => {
        backupCalled = true;
      },
    });
    expect(backupCalled).toBe(false);
    expect(await reopened.cards.count()).toBe(1);
    reopened.close();

    // Node 环境没有 navigator.storage
    expect(await requestPersistentStorage()).toBe(false);
  });
});
