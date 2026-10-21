import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import {
  SessionUndo,
  beginReview,
  commitReview,
  reviseRating,
  reviewLogId,
  suspendWordForUndo,
  undoReview,
} from './reviewCommitter';
import { createScheduler } from './scheduler';
import { makeCard } from '../test/factories';
import type { Card } from './types';

const scheduler = createScheduler();
const NOW = new Date(2026, 9, 20, 10, 0).getTime();
const DAY = '2026-10-20';

function fsrsFields(c: Card) {
  const f = c.fsrs;
  return {
    due: f.due.getTime(),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: f.elapsed_days,
    scheduled_days: f.scheduled_days,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state,
    learning_steps: f.learning_steps,
    last_review: f.last_review ? f.last_review.getTime() : null,
  };
}

describe('reviewCommitter · 每日首评', () => {
  it('T-04 同一学习日内 Again / Good / Good：只有第一次进入 FSRS', () => {
    let card = makeCard('KAOYAN:s_a', { now: NOW });
    const before = fsrsFields(card);
    const logs = [];
    let afterFirst: Card | null = null;

    for (const rating of ['AGAIN', 'GOOD', 'GOOD'] as const) {
      const pending = beginReview(card.id, NOW);
      const result = commitReview({
        card,
        pending: { ...pending, rating },
        now: NOW,
        studyDay: DAY,
        durationMs: 3_000,
        scheduler,
        daysToExamValue: 30,
      });
      logs.push(result.log);
      card = result.card;
      if (afterFirst === null) afterFirst = card;
    }

    const first = logs[0]!;
    const second = logs[1]!;
    const third = logs[2]!;

    expect(logs.map((l) => l.sessionOnly)).toEqual([false, true, true]);
    expect(first.rating).toBe('AGAIN');
    expect(card.lastFirstReviewDay).toBe(DAY);

    // 只有第一次真正改动了 FSRS
    expect(fsrsFields(card)).not.toEqual(before);
    expect(fsrsFields(afterFirst!)).not.toEqual(before);
    // 第二、三次的提交前快照就是第一次提交后的状态，因此最终状态 == 第一次提交后
    expect(fsrsFields(card)).toEqual(fsrsFields({ ...card, fsrs: second.fsrsBefore! }));
    expect(fsrsFields(card)).toEqual(fsrsFields({ ...card, fsrs: third.fsrsBefore! }));
    expect(fsrsFields(card)).toEqual(fsrsFields(afterFirst!));
  });

  it('跨学习日后再次提交又是一次首评', () => {
    let card = makeCard('KAOYAN:s_a', { now: NOW });
    const first = commitReview({
      card,
      pending: { ...beginReview(card.id, NOW), rating: 'GOOD' },
      now: NOW,
      studyDay: '2026-10-20',
      durationMs: 1000,
      scheduler,
      daysToExamValue: 30,
    });
    card = first.card;
    const second = commitReview({
      card,
      pending: { ...beginReview(card.id, NOW), rating: 'GOOD' },
      now: NOW + 86_400_000,
      studyDay: '2026-10-21',
      durationMs: 1000,
      scheduler,
      daysToExamValue: 29,
    });
    expect(first.log.sessionOnly).toBe(false);
    expect(second.log.sessionOnly).toBe(false);
    expect(second.card.lastFirstReviewDay).toBe('2026-10-21');
  });
});

describe('reviewCommitter · 修正评分', () => {
  it('T-05 预判「认识」后按 1 修正：只产生 1 条日志，rating=AGAIN，corrected=true', () => {
    const card = makeCard('KAOYAN:s_a', { now: NOW });
    let pending = beginReview(card.id, NOW, { prejudged: true, rating: 'GOOD' });
    expect(pending.corrected).toBe(false);
    pending = reviseRating(pending, 'AGAIN');

    const result = commitReview({
      card,
      pending,
      now: NOW,
      studyDay: DAY,
      durationMs: 5_000,
      scheduler,
      daysToExamValue: 30,
    });

    expect(result.log.rating).toBe('AGAIN');
    expect(result.log.corrected).toBe(true);
    expect(result.log.prejudged).toBe(true);
    expect(result.log.sessionOnly).toBe(false);
    // 提交只有一次，因此只会写一条日志
    expect(reviewLogId(card.id, NOW)).toBe(result.log.id);
  });

  it('评分未改变不算修正；改回原值后 corrected 仍为 true', () => {
    const pending = beginReview('k', NOW, { prejudged: true, rating: 'GOOD' });
    expect(reviseRating(pending, 'GOOD').corrected).toBe(false);

    const corrected = reviseRating(reviseRating(pending, 'AGAIN'), 'GOOD');
    expect(corrected.corrected).toBe(true);
    expect(corrected.rating).toBe('GOOD');
  });

  it('pending 与卡片不匹配时拒绝提交', () => {
    const card = makeCard('KAOYAN:s_a', { now: NOW });
    const pending = beginReview('KAOYAN:s_other', NOW);
    expect(() =>
      commitReview({ card, pending, now: NOW, studyDay: DAY, durationMs: 0, scheduler, daysToExamValue: 30 }),
    ).toThrow(/pending/);
  });
});

describe('reviewCommitter · 撤销', () => {
  it('T-07 撤销后 FSRS 逐字段还原，日志被删除，每日首评标记回退', () => {
    const before = makeCard('KAOYAN:s_a', { now: NOW, lastFirstReviewDay: null });
    const result = commitReview({
      card: before,
      pending: { ...beginReview(before.id, NOW), rating: 'GOOD' },
      now: NOW,
      studyDay: DAY,
      durationMs: 4_000,
      scheduler,
      daysToExamValue: 30,
    });
    expect(result.card.fsrs.reps).toBe(1);
    expect(result.card.lastFirstReviewDay).toBe(DAY);

    const restored = undoReview(result.card, result.log);
    expect(fsrsFields(restored)).toEqual(fsrsFields(before));
    expect(restored.fsrs.last_review ?? null).toBeNull();
    expect(restored.lastFirstReviewDay).toBeNull();
  });

  it('同日重现的撤销同样还原 lastFirstReviewDay（不误清空）', () => {
    const before = makeCard('KAOYAN:s_a', { now: NOW, lastFirstReviewDay: '2026-10-19' });
    const result = commitReview({
      card: before,
      pending: { ...beginReview(before.id, NOW), rating: 'AGAIN' },
      now: NOW,
      studyDay: DAY,
      durationMs: 1_000,
      scheduler,
      daysToExamValue: 30,
    });
    expect(result.sessionOnly).toBe(false);
    const restored = undoReview(result.card, result.log);
    expect(restored.lastFirstReviewDay).toBe('2026-10-19');
  });

  it('缺少快照或卡片不匹配时明确报错，不静默通过', () => {
    const card = makeCard('KAOYAN:s_a', { now: NOW });
    expect(() => undoReview(card, { id: 'x', cardId: 'KAOYAN:s_b', reviewedAt: NOW, studyDay: DAY, rating: 'GOOD', prejudged: false, corrected: false, sessionOnly: false, durationMs: 0 })).toThrow(/日志属于/);
    expect(() =>
      undoReview(card, { id: 'y', cardId: card.id, reviewedAt: NOW, studyDay: DAY, rating: 'GOOD', prejudged: false, corrected: false, sessionOnly: false, durationMs: 0 }),
    ).toThrow(/fsrsBefore/);
  });

  it('SessionUndo 只支持撤销最近一次：评审撤销与斩词撤销', () => {
    const cards = [
      makeCard('KAOYAN:s_1', { wordId: 'w_address', now: NOW }),
      makeCard('KAOYAN:s_2', { wordId: 'w_address', now: NOW }),
    ];

    // 1) 斩词 -> 撤销
    const undo = new SessionUndo();
    const suspendEntry = suspendWordForUndo(cards, 'w_address');
    expect(suspendEntry.suspendedCardIds).toEqual(['KAOYAN:s_1', 'KAOYAN:s_2']);
    undo.push(suspendEntry);
    undo.apply(cards);
    expect(cards.every((c) => !c.suspended)).toBe(true);

    // 2) 评分 -> 撤销
    const target = cards[0]!;
    const snapshotBefore = fsrsFields(target);
    const result = commitReview({
      card: target,
      pending: { ...beginReview(target.id, NOW), rating: 'GOOD' },
      now: NOW,
      studyDay: DAY,
      durationMs: 2_000,
      scheduler,
      daysToExamValue: 30,
    });
    cards[0] = result.card;
    undo.push({ kind: 'REVIEW', card: result.card, log: result.log });
    const applied = undo.apply(cards);
    expect(applied.removedLogId).toBe(result.log.id);
    expect(fsrsFields(cards[0]!)).toEqual(snapshotBefore);

    // 3) 撤销后栈为空，再次撤销是空操作
    expect(undo.peek()).toBeNull();
    expect(undo.apply(cards).restored).toEqual([]);
  });

  it('斩词不调用调度器，卡片保持暂停且 FSRS 不变', () => {
    const card = makeCard('KAOYAN:s_1', { wordId: 'w_address', now: NOW, state: State.Review, stability: 10, reps: 3 });
    const before = fsrsFields(card);
    suspendWordForUndo([card], 'w_address');
    expect(card.suspended).toBe(true);
    expect(fsrsFields(card)).toEqual(before);
  });
});
