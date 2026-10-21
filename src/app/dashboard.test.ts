import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { PackDictionary } from '../content/dictionary';
import { makeCard, makeSense, makeWord } from '../test/factories';
import { computeDashboard } from './dashboard';
import { createScheduler } from '../domain/scheduler';
import { DAY_MS } from '../domain/clock';

const NOW = new Date(2026, 10, 20, 10, 0).getTime(); // 2026-11-20

function dict() {
  return new PackDictionary(
    [
      { ...makeWord('w_core', [
        makeSense('s_core', {
          examStats: { IELTS: { senseWeight: 90, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
        }),
      ]), forms: [], sentences: [] },
      { ...makeWord('w_ext', [
        makeSense('s_ext', {
          examStats: { IELTS: { senseWeight: 20, tier: 'EXTENDED', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
        }),
      ]), forms: [], sentences: [] },
    ],
    {},
  );
}

function learnedCore() {
  const base = makeCard('IELTS:s_core', {
    exam: 'IELTS',
    wordId: 'w_core',
    senseId: 's_core',
    now: NOW,
    stability: 30,
    reps: 3,
    state: State.Review,
    lastReview: NOW - DAY_MS,
  });
  return { ...base, fsrs: { ...base.fsrs, due: new Date(NOW + 5 * DAY_MS) } };
}

describe('学习仪表盘（S-04）', () => {
  it('核心覆盖、到期与未来 7 天分布', () => {
    const stats = computeDashboard({
      cards: [learnedCore(), makeCard('IELTS:s_ext', { exam: 'IELTS', wordId: 'w_ext', senseId: 's_ext', now: NOW })],
      dictionary: dict(),
      exam: 'IELTS',
      scheduler: createScheduler(),
      now: NOW,
      settings: { examDate: '2027-01-20', dayStartHour: 4, maxReviewPerDay: 300 },
    });

    expect(stats.total).toBe(2);
    expect(stats.learned).toBe(1);
    expect(stats.coreTotal).toBe(1);
    expect(stats.masteredNow).toBe(1);
    expect(stats.coverage).toBe(1);
    // 新卡不计入「到期复习」
    expect(stats.dueNow).toBe(0);
    expect(stats.next7).toHaveLength(7);
    expect(stats.next7[5]?.count).toBe(1);
    // 考期较远，核心卡预测 R 会跌破 0.9
    expect(stats.atRisk).toBe(1);
  });

  it('到期超过每日上限时给出积压', () => {
    const base = learnedCore();
    const overdue = { ...base, fsrs: { ...base.fsrs, due: new Date(NOW - DAY_MS) } };
    const stats = computeDashboard({
      cards: [overdue],
      dictionary: dict(),
      exam: 'IELTS',
      scheduler: createScheduler(),
      now: NOW,
      settings: { examDate: '', dayStartHour: 4, maxReviewPerDay: 0 },
    });
    expect(stats.dueNow).toBe(1);
    expect(stats.backlog).toBe(1);
    expect(stats.hasExamDate).toBe(false);
  });
});
