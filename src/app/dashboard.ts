import type { Card, ExamCode, Settings } from '../domain/types';
import type { PackDictionary } from '../content/dictionary';
import type { Scheduler } from '../domain/scheduler';
import { DAY_MS, parseDay, studyDayOf } from '../domain/clock';
import { tierOfCard } from './sessionBuilder';

/** 学习仪表盘指标（PRD 2.1 / S-04）：全部在本地计算，不上传。 */

export interface DueBucket {
  day: string;
  count: number;
}

export interface DashboardStats {
  total: number;
  learned: number;
  coreTotal: number;
  /** 当前 R >= 0.9 的核心卡 */
  masteredNow: number;
  coverage: number;
  /** 考试日预测 R >= 0.9 的核心卡数 */
  predictedAtExam: number;
  predictedCoverage: number;
  dueNow: number;
  /** max(0, 到期数 - 每日复习上限) */
  backlog: number;
  /** 未来 7 个学习日的到期分布 */
  next7: DueBucket[];
  /** 考前可能掉到 R < 0.9 的核心卡 */
  atRisk: number;
  hasExamDate: boolean;
}

export interface DashboardInput {
  cards: Card[];
  dictionary: PackDictionary;
  exam: ExamCode;
  scheduler: Scheduler;
  now: number;
  settings: Pick<Settings, 'examDate' | 'dayStartHour' | 'maxReviewPerDay'>;
}

export function computeDashboard(input: DashboardInput): DashboardStats {
  const { cards, dictionary, exam, scheduler, now, settings } = input;
  const active = cards.filter((c) => !c.suspended);
  const today = studyDayOf(now, settings.dayStartHour);
  const todayStart = parseDay(today);

  let coreTotal = 0;
  let masteredNow = 0;
  let predictedAtExam = 0;
  let atRisk = 0;
  let dueNow = 0;
  let learned = 0;

  const examTs = settings.examDate ? parseDay(settings.examDate) + 9 * 3_600_000 : null;

  for (const card of active) {
    if (card.fsrs.reps > 0) learned += 1;
    // 新卡不属于「到期复习」，单独按新卡计划统计
    if (card.fsrs.reps > 0 && card.fsrs.due.getTime() <= now) dueNow += 1;
    if (tierOfCard(card, dictionary, exam) !== 'CORE') continue;
    coreTotal += 1;
    if (scheduler.retrievability(card.fsrs, now) >= 0.9) masteredNow += 1;
    if (examTs !== null) {
      const futureR = scheduler.retrievability(card.fsrs, examTs);
      if (futureR >= 0.9) predictedAtExam += 1;
      else atRisk += 1;
    }
  }

  const next7: DueBucket[] = [];
  for (let i = 0; i < 7; i += 1) {
    const dayStart = todayStart + i * DAY_MS;
    const dayEnd = dayStart + DAY_MS;
    const count = active.filter((c) => {
      if (c.fsrs.reps === 0) return false;
      const due = c.fsrs.due.getTime();
      return due >= dayStart && due < dayEnd;
    }).length;
    next7.push({ day: studyDayOf(dayStart + 12 * 3_600_000, settings.dayStartHour), count });
  }

  return {
    total: cards.length,
    learned,
    coreTotal,
    masteredNow,
    coverage: coreTotal > 0 ? masteredNow / coreTotal : 0,
    predictedAtExam,
    predictedCoverage: coreTotal > 0 ? predictedAtExam / coreTotal : 0,
    dueNow,
    backlog: Math.max(0, dueNow - settings.maxReviewPerDay),
    next7,
    atRisk,
    hasExamDate: Boolean(settings.examDate),
  };
}
