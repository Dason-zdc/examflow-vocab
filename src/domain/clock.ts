export const DAY_MS = 86_400_000;

/** 可注入时钟：领域层不直接读 Date.now()，便于测试日切与考期逻辑 */
export interface Clock {
  now(): number;
}

export function createFixedClock(isoLocalOrMs: number | string): Clock {
  const ms = typeof isoLocalOrMs === 'number' ? isoLocalOrMs : Date.parse(isoLocalOrMs);
  if (!Number.isFinite(ms)) {
    throw new Error(`createFixedClock: 无法解析时间 ${String(isoLocalOrMs)}`);
  }
  return { now: () => ms };
}

export function createManualClock(initialMs: number): Clock & { set(ms: number): void; advance(ms: number): void } {
  let current = initialMs;
  return {
    now: () => current,
    set: (ms: number) => {
      current = ms;
    },
    advance: (ms: number) => {
      current += ms;
    },
  };
}

export const systemClock: Clock = { now: () => Date.now() };

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 'YYYY-MM-DD'（本地时区） */
export function formatDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 解析 'YYYY-MM-DD' 为本地零点时间戳 */
export function parseDay(day: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) {
    throw new Error(`parseDay: 非法日期 ${day}`);
  }
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0).getTime();
}

/**
 * 学习日：日切之前（< dayStartHour 点）计入前一天。
 * dayStartHour = 4 表示 04:00 至次日 04:00 为同一学习日。
 */
export function studyDayOf(ts: number, dayStartHour = 4): string {
  const shifted = new Date(ts - dayStartHour * 3_600_000);
  return formatDay(shifted);
}

/** 学习日的起始时间戳（该学习日 dayStartHour 点的时刻） */
export function studyDayStart(day: string, dayStartHour = 4): number {
  return parseDay(day) + dayStartHour * 3_600_000;
}

/** 距考试天数：考试当天 D = 0，按学习日粒度计算 */
export function daysToExam(examDate: string, ts: number, dayStartHour = 4): number {
  const today = studyDayOf(ts, dayStartHour);
  return Math.round((parseDay(examDate) - parseDay(today)) / DAY_MS);
}

/** 考试是否已过（D < 0） */
export function isExamPast(examDate: string, ts: number, dayStartHour = 4): boolean {
  return daysToExam(examDate, ts, dayStartHour) < 0;
}
