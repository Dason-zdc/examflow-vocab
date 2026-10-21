import {
  createEmptyCard,
  fsrs,
  Rating as FsrsRating,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
} from 'ts-fsrs';
import type { Card, CardKind, ExamCode, RatingCode, Word } from './types';
import { DAY_MS } from './clock';

/** 用户评分 -> ts-fsrs Rating（PRD §5.5 评分映射） */
export const RATING_TO_FSRS: Record<RatingCode, Grade> = {
  AGAIN: FsrsRating.Again,
  HARD: FsrsRating.Hard,
  GOOD: FsrsRating.Good,
};

export const FSRS_TO_RATING: Record<number, RatingCode> = {
  [FsrsRating.Again]: 'AGAIN',
  [FsrsRating.Hard]: 'HARD',
  [FsrsRating.Good]: 'GOOD',
};

/** PRD §5.5 目标留存率分档【假设，M1 校准】 */
export function requestRetentionForDaysToExam(daysToExamValue: number): number {
  if (daysToExamValue > 30) return 0.9;
  if (daysToExamValue >= 8) return 0.93;
  return 0.95;
}

/** PRD §5.5 考期截断：I_final = min(I_fsrs, max(1, D - 1)) */
export function maximumIntervalForDaysToExam(daysToExamValue: number): number {
  return Math.max(1, Math.floor(daysToExamValue) - 1);
}

export interface SchedulerOptions {
  /**
   * 关闭 fuzz：让调度结果可复现、可断言。
   * 开启时同参数同卡也可能得到不同间隔，单测无法稳定覆盖考期截断。
   */
  enableFuzz?: boolean;
  /**
   * 关闭短期间隔（learning steps）：日内重现由 SessionQueue 负责，
   * 若 FSRS 返回「1 分钟后」这类亚日级 due，会与日内队列重复调度同一张卡。
   */
  enableShortTerm?: boolean;
}

export interface ScheduleResult {
  card: FsrsCard;
  /** 截断后的间隔天数 */
  scheduledDays: number;
  /** 截断前的 ts-fsrs 原始间隔天数 */
  rawScheduledDays: number;
  requestRetention: number;
  maximumInterval: number;
}

export interface Scheduler {
  next(card: FsrsCard, now: number, rating: RatingCode, daysToExamValue: number): ScheduleResult;
  retrievability(card: FsrsCard, at: number): number;
  emptyCard(now: number): FsrsCard;
}

export function createScheduler(options: SchedulerOptions = {}): Scheduler {
  const enableFuzz = options.enableFuzz ?? false;
  const enableShortTerm = options.enableShortTerm ?? false;
  const cache = new Map<string, FSRS>();

  function instance(retention: number, maxInterval: number): FSRS {
    const key = `${retention}|${maxInterval}|${enableFuzz ? 1 : 0}|${enableShortTerm ? 1 : 0}`;
    let f = cache.get(key);
    if (!f) {
      f = fsrs({
        request_retention: retention,
        maximum_interval: maxInterval,
        enable_fuzz: enableFuzz,
        enable_short_term: enableShortTerm,
      });
      cache.set(key, f);
    }
    return f;
  }

  return {
    emptyCard: (now: number) => createEmptyCard(new Date(now)),

    retrievability: (card: FsrsCard, at: number) =>
      instance(0.9, 36500).get_retrievability(card, new Date(at), false),

    next(card, now, rating, daysToExamValue) {
      const maximumInterval = maximumIntervalForDaysToExam(daysToExamValue);
      const requestRetention = requestRetentionForDaysToExam(daysToExamValue);
      const f = instance(requestRetention, maximumInterval);
      const record = f.next(card, new Date(now), RATING_TO_FSRS[rating]);
      /*
       * 不能只读 log.scheduled_days：
       * 1) ts-fsrs 的 reviewLog.scheduled_days 在部分路径上恒为 0；
       * 2) 更关键的是，ts-fsrs 的 ReviewScheduler 会强制 good_interval >= hard_interval + 1、
       *    easy_interval >= good_interval + 1，导致实际间隔突破传入的 maximum_interval
       *    （实测 maximum_interval=9、Good 得到 10 天）。
       * 因此这里以 card.due 反算真实天数，再按 PRD 公式做一次硬截断。
       */
      const rawDays = Math.max(0, (record.card.due.getTime() - now) / DAY_MS);
      const rawScheduledDays = Math.round(rawDays);
      // 亚日级间隔抬到 1 天（日内重现交给 SessionQueue），再套考期上限
      const days = Math.min(Math.max(rawScheduledDays, 1), maximumInterval);
      const due = new Date(now + days * DAY_MS);
      return {
        card: { ...record.card, due, scheduled_days: days },
        scheduledDays: days,
        rawScheduledDays,
        requestRetention,
        maximumInterval,
      };
    },
  };
}

/** 每日首评：每张卡每个学习日只有第一次提交的评分进入 ts-fsrs */
export function isFirstReviewOfDay(card: Card, studyDay: string): boolean {
  return card.lastFirstReviewDay !== studyDay;
}

/** 义项 ID -> 卡片 ID */
export function cardIdOf(exam: ExamCode, senseId: string): string {
  return `${exam}:${senseId}`;
}

export interface BuildCardsOptions {
  /** 每词最多卡片数（PRD：3） */
  maxCardsPerWord?: number;
  now: number;
}

/**
 * 按义项建卡（PRD §5.5）：
 * - 1 张主义项卡（该考试中考频最高的义项）
 * - 每个熟词僻义义项 1 张僻义卡
 * - 每词最多 3 张
 */
export function buildCardsForWord(
  word: Word,
  exam: ExamCode,
  options: BuildCardsOptions,
): Card[] {
  const maxCards = options.maxCardsPerWord ?? 3;
  if (word.deprecated === true) return [];

  const withStats = word.senses
    .map((sense) => ({ sense, stat: sense.examStats[exam] }))
    .filter((x): x is { sense: typeof x.sense; stat: NonNullable<typeof x.stat> } => Boolean(x.stat));

  if (withStats.length === 0) return [];

  const ranked = [...withStats].sort((a, b) => b.stat.senseWeight - a.stat.senseWeight);
  const primary = ranked[0];
  if (!primary) return [];

  const eccentric = ranked
    .filter((x) => x.stat.isEccentric && x.sense.id !== primary.sense.id)
    .slice(0, Math.max(0, maxCards - 1));

  const empty = createEmptyCard(new Date(options.now));
  const specs: Array<{ senseId: string; kind: CardKind }> = [
    { senseId: primary.sense.id, kind: 'PRIMARY' },
    ...eccentric.map((x) => ({ senseId: x.sense.id, kind: 'ECCENTRIC' as CardKind })),
  ];

  return specs.map((spec) => ({
    id: cardIdOf(exam, spec.senseId),
    exam,
    wordId: word.id,
    senseId: spec.senseId,
    kind: spec.kind,
    fsrs: { ...empty },
    suspended: false,
    lastFirstReviewDay: null,
  }));
}

/** 斩词：把该词的全部卡片标记为暂停；返回被影响的卡片 ID，便于撤销 */
export function suspendWordCards(cards: Card[], wordId: string): string[] {
  const affected: string[] = [];
  for (const c of cards) {
    if (c.wordId === wordId && !c.suspended) {
      c.suspended = true;
      affected.push(c.id);
    }
  }
  return affected;
}

/** 恢复斩词的词 */
export function resumeWordCards(cards: Card[], wordId: string): string[] {
  const affected: string[] = [];
  for (const c of cards) {
    if (c.wordId === wordId && c.suspended) {
      c.suspended = false;
      affected.push(c.id);
    }
  }
  return affected;
}
