import type { Card, RatingCode, ReviewLog } from './types';
import { isFirstReviewOfDay, type Scheduler } from './scheduler';
import { resumeWordCards, suspendWordCards } from './scheduler';

/** 离开卡片前，评分只存在这里；提交只有一次（PRD §5.2.5） */
export interface PendingReview {
  cardId: string;
  rating: RatingCode;
  /** 是否在揭示前预判 */
  prejudged: boolean;
  /** 是否在背面修改过评分 */
  corrected: boolean;
  shownAt: number;
}

export function beginReview(
  cardId: string,
  now: number,
  options: { prejudged?: boolean; rating?: RatingCode } = {},
): PendingReview {
  return {
    cardId,
    rating: options.rating ?? 'GOOD',
    prejudged: options.prejudged ?? false,
    corrected: false,
    shownAt: now,
  };
}

/** 背面修改评分：只有真正改变评分才算「修正」 */
export function reviseRating(pending: PendingReview, rating: RatingCode): PendingReview {
  if (rating === pending.rating) return pending;
  return { ...pending, rating, corrected: true };
}

export function reviewLogId(cardId: string, reviewedAt: number): string {
  return `${cardId}#${reviewedAt}`;
}

export interface CommitInput {
  card: Card;
  pending: PendingReview;
  now: number;
  /** 按日切计算的学习日 */
  studyDay: string;
  /** 正面停留 + 背面停留 */
  durationMs: number;
  scheduler: Scheduler;
  daysToExamValue: number;
}

export interface CommitResult {
  card: Card;
  log: ReviewLog;
  /** 同日重现，未进入 FSRS */
  sessionOnly: boolean;
}

/**
 * 离开卡片时一次性提交：更新 Card + 写一条 ReviewLog。
 * 每日首评规则：同一学习日只有第一次提交进入 FSRS。
 */
export function commitReview(input: CommitInput): CommitResult {
  const { card, pending, now, studyDay, durationMs, scheduler, daysToExamValue } = input;
  if (pending.cardId !== card.id) {
    throw new Error(`commitReview: pending 属于 ${pending.cardId}，卡片是 ${card.id}`);
  }

  const sessionOnly = !isFirstReviewOfDay(card, studyDay);
  const fsrsBefore: typeof card.fsrs = { ...card.fsrs };
  const firstReviewDayBefore = card.lastFirstReviewDay;

  let nextFsrs = card.fsrs;
  if (!sessionOnly) {
    nextFsrs = scheduler.next(card.fsrs, now, pending.rating, daysToExamValue).card;
  }

  const log: ReviewLog = {
    id: reviewLogId(card.id, now),
    cardId: card.id,
    reviewedAt: now,
    studyDay,
    rating: pending.rating,
    prejudged: pending.prejudged,
    corrected: pending.corrected,
    sessionOnly,
    durationMs,
    fsrsBefore,
    firstReviewDayBefore,
  };

  const nextCard: Card = {
    ...card,
    fsrs: nextFsrs,
    lastFirstReviewDay: sessionOnly ? card.lastFirstReviewDay : studyDay,
  };

  return { card: nextCard, log, sessionOnly };
}

/** 撤销最近一次提交：逐字段还原 FSRS 状态与每日首评标记 */
export function undoReview(card: Card, log: ReviewLog): Card {
  if (log.cardId !== card.id) {
    throw new Error(`undoReview: 日志属于 ${log.cardId}，卡片是 ${card.id}`);
  }
  if (!log.fsrsBefore) {
    throw new Error(`undoReview: 日志 ${log.id} 缺少 fsrsBefore 快照，无法还原`);
  }
  return {
    ...card,
    fsrs: { ...log.fsrsBefore },
    lastFirstReviewDay: log.firstReviewDayBefore ?? null,
  };
}

export interface UndoEntry {
  kind: 'REVIEW' | 'SUSPEND';
  card?: Card;
  log?: ReviewLog;
  wordId?: string;
  suspendedCardIds?: string[];
}

/** 仅支持撤销最近一次操作（PRD §5.2.6） */
export class SessionUndo {
  private last: UndoEntry | null = null;

  push(entry: UndoEntry): void {
    this.last = entry;
  }

  peek(): UndoEntry | null {
    return this.last;
  }

  clear(): void {
    this.last = null;
  }

  /**
   * 返回被还原的卡片增量（key = cardId）。
   * REVIEW：还原 FSRS 与每日首评标记；SUSPEND：解除暂停。
   */
  apply(cards: Card[]): { restored: Card[]; removedLogId?: string } {
    const entry = this.last;
    if (!entry) return { restored: [] };
    const restored: Card[] = [];

    if (entry.kind === 'REVIEW' && entry.card && entry.log) {
      const idx = cards.findIndex((c) => c.id === entry.log?.cardId);
      if (idx >= 0) {
        const target = cards[idx];
        if (target) {
          const next = undoReview(target, entry.log);
          cards[idx] = next;
          restored.push(next);
        }
      }
      this.last = null;
      return { restored, removedLogId: entry.log.id };
    }

    if (entry.kind === 'SUSPEND' && entry.wordId) {
      const affected = resumeWordCards(cards, entry.wordId);
      const set = new Set(affected);
      restored.push(...cards.filter((c) => set.has(c.id)));
      this.last = null;
      return { restored };
    }

    this.last = null;
    return { restored };
  }
}

/** 斩词：暂停该词全部卡片并记录可撤销项 */
export function suspendWordForUndo(cards: Card[], wordId: string): UndoEntry {
  const affected = suspendWordCards(cards, wordId);
  return { kind: 'SUSPEND', wordId, suspendedCardIds: affected };
}
