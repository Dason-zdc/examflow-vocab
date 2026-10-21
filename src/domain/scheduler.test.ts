import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import {
  buildCardsForWord,
  cardIdOf,
  createScheduler,
  isFirstReviewOfDay,
  maximumIntervalForDaysToExam,
  requestRetentionForDaysToExam,
  resumeWordCards,
  suspendWordCards,
} from './scheduler';
import { makeCard, makeSense, makeWord } from '../test/factories';
import { DAY_MS, daysToExam, studyDayOf } from './clock';

const scheduler = createScheduler();

function matureCard(stability: number, now: number) {
  return makeCard('KAOYAN:s_x', {
    stability,
    difficulty: 5,
    reps: 10,
    state: State.Review,
    now,
  });
}

describe('scheduler · 考期截断', () => {
  it('T-01 D=10 且原始间隔远超上限时，下次到期 ≤ 9 天后', () => {
    const now = new Date(2026, 9, 11, 10, 0).getTime();
    const examDate = '2026-10-21';
    expect(daysToExam(examDate, now, 4)).toBe(10);

    const card = matureCard(200, now);
    const result = scheduler.next(card.fsrs, now, 'GOOD', 10);

    expect(result.maximumInterval).toBe(9);
    // ts-fsrs 的实际间隔确实超过了传入的 maximum_interval（good >= hard + 1）
    expect(result.rawScheduledDays).toBeGreaterThan(result.maximumInterval);
    // 截断后
    expect(result.scheduledDays).toBe(9);
    expect(result.card.due.getTime() - now).toBe(9 * DAY_MS);
    // 不晚于考前 1 天
    expect(result.card.due.getTime()).toBeLessThanOrEqual(Date.parse(`${examDate}T23:59:59`) - DAY_MS + 1);
  });

  it('T-02 D=1 时下次到期 = 1 天后，且不晚于考试日', () => {
    const now = new Date(2026, 9, 20, 10, 0).getTime();
    const examDate = '2026-10-21';
    expect(daysToExam(examDate, now, 4)).toBe(1);

    const card = matureCard(5, now);
    const result = scheduler.next(card.fsrs, now, 'GOOD', 1);

    expect(maximumIntervalForDaysToExam(1)).toBe(1);
    expect(result.scheduledDays).toBe(1);
    expect(result.card.due.getTime() - now).toBe(1 * DAY_MS);
    expect(result.card.due.getTime()).toBeLessThanOrEqual(Date.parse(`${examDate}T23:59:59`));
  });

  it('截断下界恒为 1 天：D=0 / D<0 也不会得到 0 天', () => {
    const now = new Date(2026, 9, 21, 10, 0).getTime();
    for (const d of [0, -3]) {
      expect(maximumIntervalForDaysToExam(d)).toBe(1);
      const result = scheduler.next(matureCard(30, now).fsrs, now, 'GOOD', d);
      expect(result.scheduledDays).toBe(1);
    }
  });

  it('原始间隔小于上限时不改动它（只做下界抬升）', () => {
    const now = new Date(2026, 9, 11, 10, 0).getTime();
    const result = scheduler.next(matureCard(3, now).fsrs, now, 'GOOD', 60);
    expect(result.maximumInterval).toBe(59);
    expect(result.scheduledDays).toBe(result.rawScheduledDays);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
  });

  it('不认识的新卡也不会得到亚日级 due（日内重现归 SessionQueue）', () => {
    const now = new Date(2026, 9, 11, 10, 0).getTime();
    const card = makeCard('KAOYAN:s_new', { now });
    expect(card.fsrs.state).toBe(State.New);
    const result = scheduler.next(card.fsrs, now, 'AGAIN', 30);
    expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(result.card.due.getTime() - now).toBeGreaterThanOrEqual(DAY_MS);
  });
});

describe('scheduler · 目标留存率分档', () => {
  it('PRD §5.5 三档', () => {
    expect(requestRetentionForDaysToExam(60)).toBe(0.9);
    expect(requestRetentionForDaysToExam(31)).toBe(0.9);
    expect(requestRetentionForDaysToExam(30)).toBe(0.93);
    expect(requestRetentionForDaysToExam(8)).toBe(0.93);
    expect(requestRetentionForDaysToExam(7)).toBe(0.95);
    expect(requestRetentionForDaysToExam(0)).toBe(0.95);
  });

  it('留存率与截断上限随考期收紧', () => {
    const now = new Date(2026, 9, 11, 10, 0).getTime();
    const far = scheduler.next(matureCard(50, now).fsrs, now, 'GOOD', 60);
    const near = scheduler.next(matureCard(50, now).fsrs, now, 'GOOD', 3);
    expect(far.requestRetention).toBe(0.9);
    expect(near.requestRetention).toBe(0.95);
    expect(near.scheduledDays).toBeLessThan(far.scheduledDays);
  });
});

describe('scheduler · 按义项建卡', () => {
  it('主义项 + 熟词僻义，每词最多 3 张，主义项考频最高', () => {
    const word = makeWord('w_address', [
      makeSense('s_address_v_deal', {
        examStats: { KAOYAN: { senseWeight: 45, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['AWL-Sublist3'], isEccentric: false } },
      }),
      makeSense('s_address_n_place', {
        examStats: { KAOYAN: { senseWeight: 72, tier: 'CORE', kind: 'ESTIMATED', sources: ['AWL-Sublist1'], isEccentric: false } },
      }),
      makeSense('s_address_v_speak', {
        examStats: { KAOYAN: { senseWeight: 55, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: true } },
      }),
      makeSense('s_address_n_title', {
        examStats: { KAOYAN: { senseWeight: 50, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: true } },
      }),
      makeSense('s_address_v_greet', {
        examStats: { KAOYAN: { senseWeight: 38, tier: 'EXTENDED', kind: 'ESTIMATED', sources: ['WordNet-3.0'], isEccentric: true } },
      }),
    ]);

    const cards = buildCardsForWord(word, 'KAOYAN', { now: Date.parse('2026-10-01T10:00:00') });
    expect(cards).toHaveLength(3);
    expect(cards[0]?.kind).toBe('PRIMARY');
    expect(cards[0]?.senseId).toBe('s_address_n_place');
    expect(cards.slice(1).map((c) => c.kind)).toEqual(['ECCENTRIC', 'ECCENTRIC']);
    for (const c of cards) expect(c.id).toBe(cardIdOf('KAOYAN', c.senseId));
    for (const c of cards) expect(c.wordId).toBe('w_address');
  });

  it('无熟词僻义时只建 1 张主义项卡；废弃词不建卡', () => {
    const word = makeWord('w_simple', [
      makeSense('s_simple_a', {
        examStats: { KAOYAN: { senseWeight: 60, tier: 'CORE', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: false } },
      }),
    ]);
    const cards = buildCardsForWord(word, 'KAOYAN', { now: Date.parse('2026-10-01T10:00:00') });
    expect(cards).toHaveLength(1);
    expect(cards[0]?.kind).toBe('PRIMARY');

    const deprecated = makeWord('w_old', [
      makeSense('s_old_a', {
        examStats: { KAOYAN: { senseWeight: 60, tier: 'CORE', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: false } },
      }),
    ], { deprecated: true });
    expect(buildCardsForWord(deprecated, 'KAOYAN', { now: 0 })).toEqual([]);
  });

  it('该考试无考频数据的义项不建卡', () => {
    const word = makeWord('w_cet', [
      makeSense('s_cet', {
        examStats: { CET6: { senseWeight: 40, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['CET6-wordlist'], isEccentric: false } },
      }),
    ]);
    expect(buildCardsForWord(word, 'KAOYAN', { now: 0 })).toEqual([]);
  });
});

describe('scheduler · 每日首评判定与斩词', () => {
  it('每日首评：lastFirstReviewDay 不等于当前学习日才算首评', () => {
    const card = makeCard('KAOYAN:s_a', { lastFirstReviewDay: '2026-10-19' });
    expect(isFirstReviewOfDay(card, '2026-10-20')).toBe(true);
    expect(isFirstReviewOfDay(card, '2026-10-19')).toBe(false);
    expect(isFirstReviewOfDay({ ...card, lastFirstReviewDay: null }, '2026-10-20')).toBe(true);
  });

  it('T-03 日切前后各复习一次，分属不同学习日，两次都进入 FSRS', () => {
    const before = new Date(2026, 9, 20, 3, 59).getTime();
    const after = new Date(2026, 9, 20, 4, 1).getTime();
    const dayBefore = studyDayOf(before, 4);
    const dayAfter = studyDayOf(after, 4);
    expect(dayBefore).not.toBe(dayAfter);

    let card = makeCard('KAOYAN:s_a', { now: before });
    expect(isFirstReviewOfDay(card, dayBefore)).toBe(true);
    card = { ...card, fsrs: scheduler.next(card.fsrs, before, 'GOOD', 30).card, lastFirstReviewDay: dayBefore };
    expect(isFirstReviewOfDay(card, dayAfter)).toBe(true);
  });

  it('斩词暂停整个词，可恢复', () => {
    const cards = [
      makeCard('KAOYAN:s_1', { wordId: 'w_address' }),
      makeCard('KAOYAN:s_2', { wordId: 'w_address' }),
      makeCard('KAOYAN:s_3', { wordId: 'w_other' }),
    ];
    const affected = suspendWordCards(cards, 'w_address');
    expect(affected).toEqual(['KAOYAN:s_1', 'KAOYAN:s_2']);
    expect(cards[2]?.suspended).toBe(false);

    const resumed = resumeWordCards(cards, 'w_address');
    expect(resumed).toEqual(['KAOYAN:s_1', 'KAOYAN:s_2']);
    expect(cards.every((c) => !c.suspended)).toBe(true);
  });
});
