import { describe, expect, it } from 'vitest';
import {
  PLAN_DEFAULTS,
  dailyNewCount,
  isInOverrunWindow,
  overrunWindowDays,
  planDaily,
  reviewPriority,
  spreadSiblings,
} from './planner';
import { makeCard } from '../test/factories';
import { daysToExam } from './clock';

const EXAM = '2026-12-19';
const NOW = new Date(2026, 9, 20, 10, 0).getTime(); // 学习日 2026-10-20

describe('planner · 每日新卡数', () => {
  it('T-11 N=3000 / D=60 / B=7 / M_new=50 -> n_new=50 且提示无法学完', () => {
    expect(daysToExam(EXAM, NOW, 4)).toBe(60);
    expect(overrunWindowDays(60)).toBe(7);

    const plan = planDaily({
      remainingNewCount: 3000,
      dueCards: [],
      maxNewPerDay: 50,
      maxReviewPerDay: PLAN_DEFAULTS.maxReviewPerDay,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });

    expect(plan.daysToExamValue).toBe(60);
    expect(plan.overrunWindow).toBe(7);
    expect(plan.newCount).toBe(50);
    expect(plan.warnings.map((w) => w.code)).toContain('CANNOT_FINISH');
    expect(plan.warnings.find((w) => w.code === 'CANNOT_FINISH')?.message).toContain('57');
  });

  it('取 min：需要的量小于上限时按需要的量给', () => {
    const plan = planDaily({
      remainingNewCount: 1000,
      dueCards: [],
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });
    // ceil(1000 / 53) = 19
    expect(plan.newCount).toBe(19);
    expect(plan.warnings.map((w) => w.code)).not.toContain('CANNOT_FINISH');
  });

  it('D<=21 时过轮窗口改为 max(1, floor(D/3))', () => {
    expect(overrunWindowDays(21)).toBe(7);
    expect(overrunWindowDays(20)).toBe(6);
    expect(overrunWindowDays(15)).toBe(5);
    expect(overrunWindowDays(3)).toBe(1);
    expect(overrunWindowDays(1)).toBe(1);
    expect(overrunWindowDays(0)).toBe(1);
    expect(overrunWindowDays(-5)).toBe(1);
  });

  /*
   * 注意（PRD 待确认）：D <= 21 时 B = max(1, floor(D/3))，而 floor(D/3) < D 对所有 D >= 2 成立，
   * 因此「D <= B」这一判定实际上只在 D <= 1 时为真；D > 21 时 B = 7 同样不可能满足 D <= B。
   * 这里按 PRD 字面实现，并把该行为固化在断言里，避免后续误改。
   */
  it('过轮窗口判定按 PRD 字面实现（D<=21 时 B=floor(D/3)，窗口实际只在 D<=1 触发）', () => {
    expect(isInOverrunWindow(0)).toBe(true);
    expect(isInOverrunWindow(1)).toBe(true);
    expect(isInOverrunWindow(2)).toBe(false);
    expect(isInOverrunWindow(7)).toBe(false);
    expect(isInOverrunWindow(20)).toBe(false);
    expect(isInOverrunWindow(60)).toBe(false);
  });

  it('过轮窗口内不再引入新卡，手动开启才引入', () => {
    const nearExam = '2026-10-21'; // D = 1
    expect(daysToExam(nearExam, NOW, 4)).toBe(1);
    expect(isInOverrunWindow(1)).toBe(true);

    const plan = planDaily({
      remainingNewCount: 500,
      dueCards: [],
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: nearExam,
      dayStartHour: 4,
      now: NOW,
    });
    expect(plan.newCount).toBe(0);
    expect(plan.warnings.map((w) => w.code)).toContain('OVERRUN_WINDOW');

    const forced = planDaily({
      remainingNewCount: 500,
      dueCards: [],
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: nearExam,
      dayStartHour: 4,
      now: NOW,
      allowNewInOverrunWindow: true,
    });
    expect(forced.newCount).toBeGreaterThan(0);
  });

  it('剩余为 0 或上限为 0 时不引入新卡', () => {
    expect(dailyNewCount({ remainingCount: 0, daysToExamValue: 60, maxNewPerDay: 50 })).toBe(0);
    expect(dailyNewCount({ remainingCount: 500, daysToExamValue: 60, maxNewPerDay: 0 })).toBe(0);
  });
});

describe('planner · 复习排序与积压', () => {
  it('优先级 = 层级权重 × (1 - R_now)，降序排列', () => {
    expect(reviewPriority('CORE', 0.5)).toBeCloseTo(0.5);
    expect(reviewPriority('ADVANCED', 0.5)).toBeCloseTo(0.35);
    expect(reviewPriority('EXTENDED', 0.5)).toBeCloseTo(0.2);
    expect(reviewPriority('CORE', 1)).toBe(0);
    expect(reviewPriority('CORE', -0.5)).toBe(1); // R 越界时夹紧，不产生 >1 的权重
  });

  it('核心卡 R 更低时排在前面，同 R 时层级权重高的优先', () => {
    const cards = [
      // EXTENDED 0.4*(1-0.9)=0.04
      { card: makeCard('k:other'), retrievability: 0.9, tier: 'EXTENDED' as const },
      // CORE 1.0*(1-0.8)=0.2
      { card: makeCard('k:core'), retrievability: 0.8, tier: 'CORE' as const },
      // CORE 1.0*(1-0.3)=0.7
      { card: makeCard('k:core2'), retrievability: 0.3, tier: 'CORE' as const },
    ];
    const plan = planDaily({
      remainingNewCount: 0,
      dueCards: cards,
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });
    expect(plan.reviewOrder).toEqual(['k:core2', 'k:core', 'k:other']);
  });

  it('超过 M_rev 的部分顺延并计入积压', () => {
    const cards = Array.from({ length: 5 }, (_, i) => ({
      card: makeCard(`k:c${i}`),
      retrievability: 0.5,
      tier: 'CORE' as const,
    }));
    const plan = planDaily({
      remainingNewCount: 0,
      dueCards: cards,
      maxNewPerDay: 50,
      maxReviewPerDay: 2,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });
    expect(plan.reviewCount).toBe(2);
    expect(plan.deferredReviewCount).toBe(3);
    expect(plan.backlogDays).toBeCloseTo(1.5);
    expect(plan.warnings.map((w) => w.code)).not.toContain('BACKLOG');

    const heavy = planDaily({
      remainingNewCount: 0,
      dueCards: Array.from({ length: 10 }, (_, i) => ({
        card: makeCard(`k:h${i}`),
        retrievability: 0.5,
        tier: 'CORE' as const,
      })),
      maxNewPerDay: 50,
      maxReviewPerDay: 2,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });
    expect(heavy.backlogDays).toBe(4);
    expect(heavy.warnings.map((w) => w.code)).toContain('BACKLOG');
  });

  it('已暂停的卡不进入当日计划；考试已过给出提示', () => {
    const plan = planDaily({
      remainingNewCount: 0,
      dueCards: [
        { card: makeCard('k:a'), retrievability: 0.5, tier: 'CORE' as const },
        { card: makeCard('k:suspended', { suspended: true }), retrievability: 0.1, tier: 'CORE' as const },
      ],
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: EXAM,
      dayStartHour: 4,
      now: NOW,
    });
    expect(plan.reviewOrder).toEqual(['k:a']);

    const past = planDaily({
      remainingNewCount: 0,
      dueCards: [],
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      examDate: '2026-10-01',
      dayStartHour: 4,
      now: NOW,
    });
    expect(past.warnings.map((w) => w.code)).toContain('EXAM_PAST');
  });
});

describe('planner · 兄弟卡错开', () => {
  it('T-10 同词多张卡当日只出现 1 张', () => {
    const cards = [
      { card: makeCard('KAOYAN:s_primary', { wordId: 'w_address' }), retrievability: 0.6, tier: 'CORE' as const },
      { card: makeCard('KAOYAN:s_ecc', { wordId: 'w_address' }), retrievability: 0.4, tier: 'CORE' as const },
      { card: makeCard('KAOYAN:s_other', { wordId: 'w_book' }), retrievability: 0.5, tier: 'CORE' as const },
    ];
    const { selected, deferred } = spreadSiblings({ cards });
    expect(selected).toHaveLength(2);
    expect(selected.filter((x) => x.card.wordId === 'w_address')).toHaveLength(1);
    expect(deferred.map((x) => x.card.id)).toContain('KAOYAN:s_primary');
  });

  it('新卡阶段优先主义项卡', () => {
    const cards = [
      { card: makeCard('KAOYAN:s_ecc', { wordId: 'w_address' }), retrievability: 0.99, tier: 'CORE' as const },
      { card: makeCard('KAOYAN:s_primary', { wordId: 'w_address' }), retrievability: 0.1, tier: 'EXTENDED' as const },
    ];
    // 两张都是新卡（reps = 0）时应选 PRIMARY，而不是 R 更低的
    const { selected } = spreadSiblings({ cards });
    expect(selected.map((x) => x.card.id)).toEqual(['KAOYAN:s_primary']);
  });

  it('当日已学过某词时，其余兄弟卡顺延', () => {
    const cards = [
      { card: makeCard('KAOYAN:s_primary', { wordId: 'w_address' }), retrievability: 0.6, tier: 'CORE' as const },
      { card: makeCard('KAOYAN:s_ecc', { wordId: 'w_address' }), retrievability: 0.6, tier: 'CORE' as const },
    ];
    const { selected, deferred } = spreadSiblings({ cards, studiedWordIds: ['w_address'] });
    expect(selected).toHaveLength(0);
    expect(deferred.map((x) => x.card.id).sort()).toEqual(['KAOYAN:s_ecc', 'KAOYAN:s_primary']);
  });
});
