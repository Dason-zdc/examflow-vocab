import { describe, expect, it } from 'vitest';
import { TIER_LABEL, daysToExamLabel, formatDueLabel, weightLabel } from './format';

/** format.ts 纯函数测试（TG-1 缺口）：倒计时 null 口径 + 权重合规口径 + 到期标签分支 */

describe('daysToExamLabel · 倒计时口径', () => {
  it('null = 未设置考期，不得渲染成「距考试 null 天」', () => {
    expect(daysToExamLabel(null)).toBe('未设置考期');
  });

  it('0 = 今天考试', () => {
    expect(daysToExamLabel(0)).toBe('今天考试');
  });

  it('负数 = 考试日已过 N 天', () => {
    expect(daysToExamLabel(-2)).toBe('考试日已过 2 天');
  });

  it('正数 = 距考试 N 天', () => {
    expect(daysToExamLabel(5)).toBe('距考试 5 天');
  });
});

describe('weightLabel · 合规口径（无真题语料，恒为估计值）', () => {
  it('权重一律带「估计」前缀', () => {
    expect(weightLabel(42)).toBe('估计权重 42');
    expect(weightLabel(0)).toBe('估计权重 0');
    expect(weightLabel(100)).toBe('估计权重 100');
  });
});

describe('TIER_LABEL · 层级文案', () => {
  it('三档层级齐全', () => {
    expect(TIER_LABEL.CORE).toBe('核心考点');
    expect(TIER_LABEL.ADVANCED).toBe('进阶考点');
    expect(TIER_LABEL.EXTENDED).toBe('拓展考点');
  });
});

describe('formatDueLabel · 到期标签分支', () => {
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  const day = 86_400_000;

  it('已到期显示日期', () => {
    expect(formatDueLabel(new Date(now - day), now)).toBe('到期 10/20');
  });

  it('差 1 天显示明天到期', () => {
    expect(formatDueLabel(new Date(now + day), now)).toBe('明天到期');
  });

  it('多天后显示 N 天后到期', () => {
    expect(formatDueLabel(new Date(now + 5 * day), now)).toBe('5 天后到期');
  });
});
