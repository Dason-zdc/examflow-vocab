/** 拼写练习的纯比对逻辑（PRD 5.7）：逐字母校验、提示下一个字母。
 * 与调度无关：练习结果只进练习日志，不改变识记卡的 FSRS 状态。 */

export type SlotState = 'ok' | 'bad' | 'empty';

export interface SpellingSlot {
  typed: string;
  state: SlotState;
}

export interface SpellingEvaluation {
  slots: SpellingSlot[];
  /** 多输入的字母数 */
  extra: number;
  correct: boolean;
}

export function normalizeSpelling(value: string): string {
  return value.trim().toLowerCase();
}

export function evaluateSpelling(target: string, typed: string): SpellingEvaluation {
  const t = normalizeSpelling(target);
  const v = normalizeSpelling(typed);
  const slots = [...t].map((ch, i): SpellingSlot => {
    const c = v[i];
    if (c === undefined) return { typed: '', state: 'empty' };
    return { typed: c, state: c === ch ? 'ok' : 'bad' };
  });
  return { slots, extra: Math.max(0, v.length - t.length), correct: t.length > 0 && v === t };
}

/**
 * 提示：保留已正确的前缀，再多给一个字母。
 * 用户此前输错时，提示会把错误尾巴截掉——与「逐字母校验」的直觉一致。
 */
export function nextHint(target: string, typed: string): string {
  const t = normalizeSpelling(target);
  const v = normalizeSpelling(typed);
  let n = 0;
  while (n < v.length && n < t.length && v[n] === t[n]) n += 1;
  return t.slice(0, Math.min(t.length, n + 1));
}
