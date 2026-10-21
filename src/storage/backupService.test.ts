import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { State } from 'ts-fsrs';
import {
  BACKUP_FORMAT,
  BackupFormatError,
  SUPPORTED_BACKUP_FORMAT_VERSION,
  cardFromBackup,
  cardToBackup,
  exportBackup,
  parseBackup,
  serializeBackup,
  validateBackup,
} from './backupService';
import { importBackup } from '../app/backupUseCase';
import {
  ExamFlowDB,
  SCHEMA_VERSION,
  SETTINGS_KEY,
  fromCardRow,
  toCardRow,
  type ExamFlowDB as ExamFlowDbType,
} from './db';

/** 与 db.test.ts 分开库名，避免并行测试互相删除连接 */
const DEFAULT_DB_NAME = 'examflow-backup-test';
import { DEFAULT_SETTINGS, type Card, type ReviewLog, type Settings } from '../domain/types';
import { makeCard } from '../test/factories';

const NOW = new Date(2026, 9, 20, 10, 0).getTime();

function makeLog(card: Card, reviewedAt: number): ReviewLog {
  return {
    id: `${card.id}#${reviewedAt}`,
    cardId: card.id,
    reviewedAt,
    studyDay: '2026-10-20',
    rating: 'GOOD',
    prejudged: true,
    corrected: false,
    sessionOnly: false,
    durationMs: 4_200,
    fsrsBefore: { ...card.fsrs },
    firstReviewDayBefore: null,
  };
}

async function freshDb(name = DEFAULT_DB_NAME): Promise<ExamFlowDbType> {
  await new ExamFlowDB(name).delete();
  const db = new ExamFlowDB(name);
  await db.open();
  return db;
}

describe('backupService · 序列化契约', () => {
  it('Date 往返后仍是 Date，不会退化为字符串', () => {
    const card = makeCard('KAOYAN:s_a', { now: NOW, stability: 3.5, reps: 2, state: State.Review });
    const json = JSON.parse(JSON.stringify(cardToBackup(card))) as ReturnType<typeof cardToBackup>;
    const back = cardFromBackup(json);
    expect(back.fsrs.due).toBeInstanceOf(Date);
    expect(back.fsrs.due.getTime()).toBe(card.fsrs.due.getTime());
    expect(back).toEqual(card);
  });

  it('last_review 为 undefined 时序列化为 null，往返后不凭空出现', () => {
    const card = makeCard('KAOYAN:s_a', { now: NOW });
    expect(card.fsrs.last_review).toBeUndefined();
    const back = cardFromBackup(JSON.parse(JSON.stringify(cardToBackup(card))));
    expect(back.fsrs.last_review).toBeUndefined();
  });
});

describe('backupService · 校验', () => {
  it('拒绝非本产品格式、缺字段、版本过高的文件', () => {
    expect(() => validateBackup({ format: 'other', formatVersion: 1, cards: [], reviewLogs: [], userWordMeta: [], customWords: [] })).toThrow(BackupFormatError);
    expect(() => validateBackup({ format: BACKUP_FORMAT, formatVersion: 1, cards: [], reviewLogs: [], userWordMeta: [] })).toThrow(/customWords/);
    expect(() =>
      validateBackup({
        format: BACKUP_FORMAT,
        formatVersion: SUPPORTED_BACKUP_FORMAT_VERSION + 1,
        cards: [],
        reviewLogs: [],
        userWordMeta: [],
        customWords: [],
      }),
    ).toThrow(/高于客户端支持/);
    expect(() => parseBackup('{ not json')).toThrow(/不是合法 JSON/);
  });
});

describe('backupService · T-12 备份往返一致', () => {
  let db: ExamFlowDbType;

  beforeEach(async () => {
    db = await freshDb();
  });

  it('导出 → 清空 → 导入，所有实体与导出前完全一致', async () => {
    const settings: Settings = { ...DEFAULT_SETTINGS, examDate: '2026-12-20', schemaVersion: SCHEMA_VERSION };
    const cards = [
      makeCard('KAOYAN:s_1', { now: NOW, wordId: 'w_address', stability: 12.5, reps: 4, state: State.Review }),
      makeCard('KAOYAN:s_2', { now: NOW, wordId: 'w_address', stability: 0.4, reps: 1 }),
      makeCard('KAOYAN:s_3', { now: NOW, wordId: 'w_book', suspended: true, lastFirstReviewDay: '2026-10-19' }),
    ];
    const logs = cards.map((c, i) => makeLog(c, NOW + i));
    const metas = [
      { wordId: 'w_address', starred: true, note: '熟词僻义：处理', updatedAt: NOW },
      { wordId: 'w_book', starred: false, note: '', updatedAt: NOW - 1000 },
    ];
    const customWords = [
      { id: 'cw_1', lemma: 'ubiquitous', phonetic: '/juːˈbɪkwɪtəs/', cn: '无处不在的', sourceSentence: 'Smartphones are ubiquitous.', createdAt: NOW },
    ];

    await db.settings.put({ id: SETTINGS_KEY, ...settings });
    await db.cards.bulkPut(cards.map(toCardRow));
    await db.reviewLogs.bulkPut(logs);
    await db.userWordMeta.bulkPut(metas);
    await db.customWords.bulkPut(customWords);

    const before = await exportBackup(db);
    const text = serializeBackup(before);

    // 清空（模拟数据丢失；测试设置不需要事务）
    await Promise.all([
      db.cards.clear(),
      db.reviewLogs.clear(),
      db.userWordMeta.clear(),
      db.customWords.clear(),
      db.settings.clear(),
    ]);
    expect((await db.cards.count())).toBe(0);

    const restored = await importBackup(db, parseBackup(text));

    expect(restored.cards).toBe(3);
    expect(restored.reviewLogs).toBe(3);
    expect(restored.userWordMeta).toBe(2);
    expect(restored.customWords).toBe(1);
    expect(restored.settings).toBe(true);

    const after = await exportBackup(db);
    expect(after.settings).toEqual(before.settings);
    expect(after.cards).toEqual(before.cards);
    expect(after.reviewLogs).toEqual(before.reviewLogs);
    expect(after.userWordMeta).toEqual(before.userWordMeta);
    expect(after.customWords).toEqual(before.customWords);

    // 领域对象层面也逐字段相等
    const rows = await db.cards.orderBy('id').toArray();
    expect(rows.map(fromCardRow)).toEqual(cards);
    expect(rows[0]?.fsrs.due).toBeInstanceOf(Date);
  });

  it('导入前先导出当前数据作为备份', async () => {
    await db.cards.put(toCardRow(makeCard('KAOYAN:s_old', { now: NOW })));
    const incoming = serializeBackup(await exportBackup(await freshDb('seed-empty')));
    let snapshotBefore: number | null = null;

    await importBackup(db, parseBackup(incoming), {
      onBeforeImport: (current) => {
        snapshotBefore = current.cards.length;
      },
    });

    expect(snapshotBefore).toBe(1);
    expect(await db.cards.count()).toBe(0);
  });

  it('merge 模式按更新时间后写覆盖，不删除本地已有数据', async () => {
    const localMeta = { wordId: 'w_address', starred: false, note: '本地笔记', updatedAt: NOW };
    await db.userWordMeta.put(localMeta);
    await db.cards.put(toCardRow(makeCard('KAOYAN:s_local', { now: NOW })));

    const incoming = await exportBackup(await freshDb('seed-merge'));
    incoming.userWordMeta = [{ wordId: 'w_address', starred: true, note: '备份里更旧', updatedAt: NOW - 5_000 }];
    incoming.cards = [
      cardToBackup(makeCard('KAOYAN:s_remote', { now: NOW })),
    ];

    await importBackup(db, incoming, { mode: 'merge' });

    // 本地 updatedAt 更新，保留本地值
    expect(await db.userWordMeta.get('w_address')).toEqual(localMeta);
    expect((await db.cards.toArray()).map((r) => r.id).sort()).toEqual(['KAOYAN:s_local', 'KAOYAN:s_remote']);
  });
});
