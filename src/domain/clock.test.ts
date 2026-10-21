import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  createFixedClock,
  createManualClock,
  daysToExam,
  isExamPast,
  parseDay,
  studyDayOf,
  studyDayStart,
} from './clock';

describe('clock / 学习日', () => {
  it('日切之前计入前一天，日切之后进入新的一天', () => {
    const before = new Date(2026, 9, 20, 3, 59, 0).getTime();
    const after = new Date(2026, 9, 20, 4, 1, 0).getTime();
    expect(studyDayOf(before, 4)).toBe('2026-10-19');
    expect(studyDayOf(after, 4)).toBe('2026-10-20');
  });

  it('dayStartHour = 0 时学习日等于自然日', () => {
    const ts = new Date(2026, 9, 20, 23, 30).getTime();
    expect(studyDayOf(ts, 0)).toBe('2026-10-20');
  });

  it('可注入固定时钟与手动时钟', () => {
    const fixed = createFixedClock(new Date(2026, 9, 20, 10, 0).getTime());
    expect(fixed.now()).toBe(new Date(2026, 9, 20, 10, 0).getTime());

    const manual = createManualClock(parseDay('2026-10-20'));
    manual.advance(DAY_MS);
    expect(studyDayOf(manual.now(), 4)).toBe('2026-10-20');
    manual.advance(5 * 3600_000);
    expect(studyDayOf(manual.now(), 4)).toBe('2026-10-21');
  });

  it('studyDayStart 落在学习日的 dayStartHour', () => {
    expect(new Date(studyDayStart('2026-10-20', 4)).getHours()).toBe(4);
    expect(studyDayOf(studyDayStart('2026-10-20', 4), 4)).toBe('2026-10-20');
  });

  it('距考试天数：考试当天为 0，跨日切正确', () => {
    const exam = '2026-12-20';
    // 12-20 03:59 仍属 12-19 学习日 -> D = 1
    expect(daysToExam(exam, new Date(2026, 11, 20, 3, 59).getTime(), 4)).toBe(1);
    // 12-20 04:01 已是 12-20 学习日 -> D = 0
    expect(daysToExam(exam, new Date(2026, 11, 20, 4, 1).getTime(), 4)).toBe(0);
    expect(daysToExam(exam, new Date(2026, 11, 19, 12, 0).getTime(), 4)).toBe(1);
    expect(daysToExam(exam, new Date(2026, 11, 21, 12, 0).getTime(), 4)).toBe(-1);
  });

  it('考试是否已过', () => {
    const exam = '2026-12-20';
    expect(isExamPast(exam, new Date(2026, 11, 21, 10, 0).getTime(), 4)).toBe(true);
    expect(isExamPast(exam, new Date(2026, 11, 20, 10, 0).getTime(), 4)).toBe(false);
  });

  it('非法日期与非法时间应抛错，而非静默返回', () => {
    expect(() => parseDay('2026/12/20')).toThrow();
    expect(() => createFixedClock('not-a-date')).toThrow();
  });
});
