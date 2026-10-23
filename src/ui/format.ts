import type { CardTier, RatingCode } from '../domain/types';
import type { Card } from '../domain/types';
import type { Card as FsrsCard } from 'ts-fsrs';

/** UI 展示格式化（纯函数）。权重一律带「估计」口径——合规契约：无真题语料，不得出现考频表述。 */

const MONTH_DAY = new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' });

export function formatMonthDay(ts: number): string {
  return MONTH_DAY.format(new Date(ts));
}

export function formatDueLabel(due: Date, now: number): string {
  const days = Math.round((due.getTime() - now) / 86_400_000);
  if (days <= 0) return `到期 ${formatMonthDay(due.getTime())}`;
  if (days === 1) return '明天到期';
  return `${days} 天后到期`;
}

/** 义项权重：合规口径「估计」，不给绝对次数 */
export function weightLabel(senseWeight: number): string {
  return `估计权重 ${senseWeight}`;
}

export const TIER_LABEL: Record<CardTier, string> = {
  CORE: '核心考点',
  ADVANCED: '进阶考点',
  EXTENDED: '拓展考点',
};

export const RATING_LABEL: Record<RatingCode, string> = {
  AGAIN: '不认识',
  HARD: '模糊',
  GOOD: '认识',
};

/** 背面评分条文案（与正面预判区分：记错了 / 模糊 / 认识） */
export const BACK_RATING_LABEL: Record<RatingCode, string> = {
  AGAIN: '记错了',
  HARD: '模糊',
  GOOD: '认识',
};

/** FSRS 状态条（Anki 风格显式状态，UIUX P1：状态 · S 天数 · D · R） */
export function statStrip(fsrs: FsrsCard, retrievability: number): string {
  const state = fsrs.state === 0 ? '新卡' : fsrs.state === 1 ? '学习中' : '复习中';
  const s = fsrs.stability > 0 ? `S ${Math.round(fsrs.stability)}d` : 'S -';
  const d = `D ${fsrs.difficulty.toFixed(1)}`;
  const r = `R ${Math.round(retrievability * 100)}%`;
  return `${state} · ${s} · ${d} · ${r}`;
}

export function stateLabel(state: FsrsCard['state']): string {
  return state === 0 ? '新卡' : state === 1 ? '学习' : '复习';
}

/** 卡型徽章：主义项 / 熟词僻义 */
export function kindLabel(card: Card): string {
  return card.kind === 'ECCENTRIC' ? '熟词僻义卡' : card.kind === 'CUSTOM' ? '自定义卡' : '主义项卡';
}

/** 距今天数（倒计时 chip 用）。null = 未设置考试日期，不得渲染成「距考试 null 天」。 */
export function daysToExamLabel(days: number | null): string {
  if (days === null) return '未设置考期';
  if (days < 0) return `考试日已过 ${Math.abs(days)} 天`;
  if (days === 0) return '今天考试';
  return `距考试 ${days} 天`;
}

/** 词典词频序号 → 学习者的可读标签（不承诺考试频次，只描述语料位置） */
export function rankLabel(rank: number): string {
  if (!rank) return '词频未知';
  if (rank <= 3000) return '高频词';
  if (rank <= 12000) return '中频词';
  if (rank <= 30000) return '中低频词';
  return '低频词';
}
