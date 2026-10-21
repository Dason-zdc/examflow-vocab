import type { Card, CardTier } from './types';
import { TIER_WEIGHT } from './types';
import { studyDayOf, daysToExam } from './clock';

/** PRD §5.3 默认参数（【假设】，M1 校准） */
export const PLAN_DEFAULTS = {
  /** 考前过轮窗口天数 B 的常规取值 */
  overrunWindowDays: 7,
  /** D 小于等于该值时改用 max(1, floor(D/3)) */
  overrunWindowAdaptiveBelow: 21,
  /** 每日复习上限默认值 */
  maxReviewPerDay: 300,
  /** 每日新卡上限默认值 */
  maxNewPerDay: 50,
  /** 积压天数超过该值时提示并建议暂停新卡 */
  backlogWarnDays: 2,
} as const;

/** 考前过轮窗口天数 B */
export function overrunWindowDays(daysToExamValue: number): number {
  const d = Math.floor(daysToExamValue);
  if (d <= PLAN_DEFAULTS.overrunWindowAdaptiveBelow) {
    return Math.max(1, Math.floor(d / 3));
  }
  return PLAN_DEFAULTS.overrunWindowDays;
}

/** 是否处于过轮窗口（D <= B）：窗口内不再引入新卡 */
export function isInOverrunWindow(daysToExamValue: number): boolean {
  return Math.floor(daysToExamValue) <= overrunWindowDays(daysToExamValue);
}

/**
 * 每日新卡数：n_new = min(M_new, ceil(N / max(1, D - B)))
 * 过轮窗口内返回 0（除非 allowInOverrunWindow）。
 */
export function dailyNewCount(input: {
  remainingCount: number;
  daysToExamValue: number;
  maxNewPerDay: number;
  allowInOverrunWindow?: boolean;
}): number {
  const { remainingCount, daysToExamValue, maxNewPerDay } = input;
  if (remainingCount <= 0 || maxNewPerDay <= 0) return 0;
  if (isInOverrunWindow(daysToExamValue) && input.allowInOverrunWindow !== true) return 0;

  const b = overrunWindowDays(daysToExamValue);
  const spread = Math.max(1, Math.floor(daysToExamValue) - b);
  const needed = Math.ceil(remainingCount / spread);
  return Math.min(maxNewPerDay, needed);
}

/** 复习优先级：层级权重 × (1 - R_now) */
export function reviewPriority(tier: CardTier, retrievability: number): number {
  const r = Math.min(1, Math.max(0, retrievability));
  return TIER_WEIGHT[tier] * (1 - r);
}

export type PlanWarningCode = 'CANNOT_FINISH' | 'BACKLOG' | 'EXAM_PAST' | 'OVERRUN_WINDOW';

export interface PlanWarning {
  code: PlanWarningCode;
  message: string;
}

export interface DueCardInput {
  card: Card;
  /** R_now：FSRS 预测的当前回忆概率 */
  retrievability: number;
  tier: CardTier;
}

export interface DailyPlanInput {
  /** N：目标范围内尚未学习的卡片数 */
  remainingNewCount: number;
  dueCards: DueCardInput[];
  maxNewPerDay: number;
  maxReviewPerDay: number;
  examDate: string;
  dayStartHour: number;
  now: number;
  /** 过轮窗口内是否仍引入新卡（用户手动开启） */
  allowNewInOverrunWindow?: boolean;
}

export interface DailyPlan {
  studyDay: string;
  daysToExamValue: number;
  overrunWindow: number;
  /** n_new */
  newCount: number;
  /** 当日安排复习数 */
  reviewCount: number;
  /** 超过 M_rev 顺延到次日的数量 */
  deferredReviewCount: number;
  /** 积压天数 = 顺延数 ÷ 每日复习上限 */
  backlogDays: number;
  /** 当日复习顺序（优先级降序） */
  reviewOrder: string[];
  /** 过 M_rev 被顺延的卡 */
  deferredCardIds: string[];
  warnings: PlanWarning[];
}

export function planDaily(input: DailyPlanInput): DailyPlan {
  const {
    remainingNewCount,
    dueCards,
    maxNewPerDay,
    maxReviewPerDay,
    examDate,
    dayStartHour,
    now,
    allowNewInOverrunWindow,
  } = input;

  const studyDay = studyDayOf(now, dayStartHour);
  const d = daysToExam(examDate, now, dayStartHour);
  const b = overrunWindowDays(d);

  const warnings: PlanWarning[] = [];
  if (d < 0) {
    warnings.push({
      code: 'EXAM_PAST',
      message: '考试日期已过，请设置新的考试日期或切换到长期记忆模式。',
    });
  }

  const newCount = dailyNewCount({
    remainingCount: remainingNewCount,
    daysToExamValue: d,
    maxNewPerDay,
    allowInOverrunWindow: allowNewInOverrunWindow,
  });

  const needed = (() => {
    const spread = Math.max(1, d - b);
    return Math.ceil(remainingNewCount / spread);
  })();
  if (d >= 0 && remainingNewCount > 0 && needed > maxNewPerDay) {
    warnings.push({
      code: 'CANNOT_FINISH',
      message: `按当前上限无法在考前学完：剩 ${remainingNewCount} 张新卡，需每日 ${needed} 张，上限 ${maxNewPerDay} 张。可提高上限或缩小范围。`,
    });
  }
  if (isInOverrunWindow(d) && d >= 0) {
    warnings.push({
      code: 'OVERRUN_WINDOW',
      message: `已进入考前过轮窗口（距考 ${d} 天，窗口 ${b} 天），不再引入新卡。`,
    });
  }

  const ranked = [...dueCards]
    .filter((x) => !x.card.suspended)
    .map((x) => ({ ...x, priority: reviewPriority(x.tier, x.retrievability) }))
    .sort((a, b2) => b2.priority - a.priority);

  const limit = Math.max(0, maxReviewPerDay);
  const kept = ranked.slice(0, limit);
  const deferred = ranked.slice(limit);
  const backlogDays = limit > 0 ? deferred.length / limit : deferred.length;

  if (backlogDays > PLAN_DEFAULTS.backlogWarnDays) {
    warnings.push({
      code: 'BACKLOG',
      message: `积压约 ${backlogDays.toFixed(1)} 天，建议今日暂停新卡。`,
    });
  }

  return {
    studyDay,
    daysToExamValue: d,
    overrunWindow: b,
    newCount,
    reviewCount: kept.length,
    deferredReviewCount: deferred.length,
    backlogDays,
    reviewOrder: kept.map((x) => x.card.id),
    deferredCardIds: deferred.map((x) => x.card.id),
    warnings,
  };
}

/**
 * 兄弟卡错开（PRD §5.5）：同一词同一天最多出现 1 张卡。
 * 新卡阶段（存在 New 状态兄弟卡）优先主义项卡；否则按优先级取最高的一张。
 */
export function spreadSiblings(input: {
  cards: DueCardInput[];
  /** 当日已经学过某词的卡时传入，避免同词第二次出现 */
  studiedWordIds?: Iterable<string>;
  ranking?: (a: DueCardInput, b: DueCardInput) => number;
}): { selected: DueCardInput[]; deferred: DueCardInput[] } {
  const studied = new Set(input.studiedWordIds ?? []);
  const rank =
    input.ranking ??
    ((a: DueCardInput, b: DueCardInput) => reviewPriority(b.tier, b.retrievability) - reviewPriority(a.tier, a.retrievability));

  const byWord = new Map<string, DueCardInput[]>();
  const deferred: DueCardInput[] = [];
  for (const item of input.cards) {
    if (item.card.suspended) continue;
    if (studied.has(item.card.wordId)) {
      // 该词当日已出现过一张卡，其余兄弟卡全部顺延
      deferred.push(item);
      continue;
    }
    const list = byWord.get(item.card.wordId);
    if (list) list.push(item);
    else byWord.set(item.card.wordId, [item]);
  }

  const selected: DueCardInput[] = [];
  for (const group of byWord.values()) {
    const sorted = [...group].sort(rank);
    const hasNew = sorted.some((x) => x.card.fsrs.reps === 0);
    let chosen: DueCardInput | undefined;
    if (hasNew) {
      chosen = sorted.find((x) => x.card.kind === 'PRIMARY') ?? sorted[0];
    } else {
      chosen = sorted[0];
    }
    if (!chosen) continue;
    selected.push(chosen);
    for (const other of sorted) {
      if (other !== chosen) deferred.push(other);
    }
  }

  selected.sort(rank);
  return { selected, deferred };
}
