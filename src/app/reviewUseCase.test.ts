import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { State } from 'ts-fsrs';
import { ExamFlowDB } from '../storage/db';
import { commitReviewUseCase, undoReviewUseCase } from './reviewUseCase';
import { beginReview } from '../domain/reviewCommitter';
import { createScheduler, isFirstReviewOfDay } from '../domain/scheduler';
import { makeCard } from '../test/factories';

const NOW = new Date(2026, 9, 20, 10, 0).getTime();
const scheduler = createScheduler();

let db: ExamFlowDB;

beforeEach(async () => {
  await new ExamFlowDB('review-usecase-test').delete();
  db = new ExamFlowDB('review-usecase-test');
  await db.open();
});

function pending(cardId: string, rating: 'AGAIN' | 'HARD' | 'GOOD' = 'GOOD') {
  return beginReview(cardId, NOW, { prejudged: true, rating });
}

describe('reviewUseCase · 提交与撤销', () => {
  it('提交后卡片与日志原子落库，且 lastFirstReviewDay 推进', async () => {
    const card = makeCard('IELTS:s_a', { exam: 'IELTS', now: NOW });
    const result = await commitReviewUseCase(db, {
      card,
      pending: pending(card.id),
      now: NOW,
      studyDay: '2026-10-20',
      durationMs: 4_200,
      scheduler,
      daysToExamValue: 60,
    });

    expect(result.sessionOnly).toBe(false);
    const row = await db.cards.get('IELTS:s_a');
    expect(row?.lastFirstReviewDay).toBe('2026-10-20');
    expect(row?.fsrs.reps).toBe(1);
    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]?.rating).toBe('GOOD');
    expect(logs[0]?.sessionOnly).toBe(false);
    expect(logs[0]?.durationMs).toBe(4_200);
    expect(logs[0]?.fsrsBefore?.reps).toBe(0);
  });

  it('同日第二次提交 sessionOnly=true，不推进 FSRS', async () => {
    const card = makeCard('IELTS:s_b', { exam: 'IELTS', now: NOW });
    const first = await commitReviewUseCase(db, {
      card,
      pending: pending(card.id),
      now: NOW,
      studyDay: '2026-10-20',
      durationMs: 1_000,
      scheduler,
      daysToExamValue: 60,
    });
    const second = await commitReviewUseCase(db, {
      card: first.card,
      pending: pending(card.id, 'HARD'),
      now: NOW + 60_000,
      studyDay: '2026-10-20',
      durationMs: 800,
      scheduler,
      daysToExamValue: 60,
    });

    expect(second.sessionOnly).toBe(true);
    expect(second.card.fsrs.reps).toBe(first.card.fsrs.reps); // 未再进 FSRS
    expect(isFirstReviewOfDay(second.card, '2026-10-20')).toBe(false);
    expect((await db.reviewLogs.toArray()).length).toBe(2);
  });

  it('撤销还原 FSRS 快照与首评日，并删除日志', async () => {
    const card = makeCard('IELTS:s_c', {
      exam: 'IELTS',
      now: NOW,
      stability: 3,
      difficulty: 5,
      reps: 2,
      state: State.Review,
      lastReview: NOW - 30 * 86_400_000,
    });
    const result = await commitReviewUseCase(db, {
      card,
      pending: pending(card.id, 'AGAIN'),
      now: NOW,
      studyDay: '2026-10-20',
      durationMs: 5_000,
      scheduler,
      daysToExamValue: 60,
    });
    const committedRow = await db.cards.get('IELTS:s_c');
    expect(committedRow?.fsrs.stability).not.toBe(3); // AGAIN 后稳定性被改写

    const restored = await undoReviewUseCase(db, { card: result.card, log: result.log });
    expect(restored.fsrs.stability).toBe(3);
    expect(restored.lastFirstReviewDay).toBe(null);
    const row = await db.cards.get('IELTS:s_c');
    expect(row?.fsrs.stability).toBe(3);
    expect(await db.reviewLogs.count()).toBe(0);
  });

  it('撤销不匹配的日志会报错而不是静默还原', async () => {
    const card = makeCard('IELTS:s_d', { exam: 'IELTS', now: NOW });
    const result = await commitReviewUseCase(db, {
      card,
      pending: pending(card.id),
      now: NOW,
      studyDay: '2026-10-20',
      durationMs: 1_000,
      scheduler,
      daysToExamValue: 60,
    });
    const other = makeCard('IELTS:s_e', { exam: 'IELTS', now: NOW });
    await expect(undoReviewUseCase(db, { card: other, log: result.log })).rejects.toThrow(/日志属于/);
  });
});
