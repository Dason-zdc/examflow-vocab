import type { Clock } from './clock';
import type { RatingCode } from './types';

/** PRD §5.6 日内重现队列 */

export type RequeueOutcome = 'PASSED' | 'REINSERTED' | 'DEFERRED';

export interface RequeueResult {
  outcome: RequeueOutcome;
  /** 本轮通关积分（0~2），用于背面横幅「本轮 x/2」 */
  points: number;
  /** 重新插入后前面还有几张卡 */
  gapCards?: number;
}

export interface SessionQueueOptions {
  /** 之后至少隔 3 张卡 */
  minGapCards?: number;
  /** 距本次至少 60 秒 */
  minGapMs?: number;
  /** 单卡耗时估计（ms），用于把 60 秒换算成卡数；会按实际耗时做指数平滑修正 */
  estimatedMsPerCard?: number;
  /** 待巩固卡在本轮内最多被唤醒几次，防止无限循环 */
  maxDeferredRevives?: number;
  clock: Clock;
}

export interface SessionQueueSnapshot {
  queue: string[];
  current: string | null;
  deferred: string[];
  passed: string[];
  points: Record<string, number>;
  seen: Record<string, number>;
  lastSeenAt: Record<string, number>;
  revives: Record<string, number>;
  served: string[];
  estimatedMsPerCard: number;
}

export interface RoundSummary {
  /** 本轮出现过的卡片数 */
  learned: number;
  /** 通关数 */
  passed: number;
  /** 待巩固数 */
  pending: number;
}

const DEFAULTS = {
  minGapCards: 3,
  minGapMs: 60_000,
  estimatedMsPerCard: 15_000,
  maxDeferredRevives: 3,
} as const;

export class SessionQueue {
  private queue: string[];
  private currentCard: string | null;
  private deferred: string[] = [];
  private passed: string[] = [];
  private readonly points = new Map<string, number>();
  private readonly seen = new Map<string, number>();
  private readonly lastSeenAt = new Map<string, number>();
  private readonly revives = new Map<string, number>();
  private readonly served = new Set<string>();
  private estimated: number;
  private readonly opts: Required<Omit<SessionQueueOptions, 'clock'>>;
  private readonly clock: Clock;

  constructor(cardIds: readonly string[], options: SessionQueueOptions) {
    this.opts = {
      minGapCards: options.minGapCards ?? DEFAULTS.minGapCards,
      minGapMs: options.minGapMs ?? DEFAULTS.minGapMs,
      estimatedMsPerCard: options.estimatedMsPerCard ?? DEFAULTS.estimatedMsPerCard,
      maxDeferredRevives: options.maxDeferredRevives ?? DEFAULTS.maxDeferredRevives,
    };
    this.clock = options.clock;
    this.estimated = this.opts.estimatedMsPerCard;
    this.queue = [...cardIds];
    this.currentCard = null;
  }

  /** 取下一张到「当前卡」；返回 null 表示本轮结束 */
  advance(): string | null {
    if (this.currentCard !== null) return this.currentCard;
    if (this.queue.length === 0) this.reviveDeferred();
    const next = this.queue.shift() ?? null;
    this.currentCard = next;
    if (next !== null) this.served.add(next);
    return next;
  }

  get current(): string | null {
    return this.currentCard;
  }

  get remaining(): number {
    return this.queue.length + (this.currentCard !== null ? 1 : 0);
  }

  get pendingConsolidation(): readonly string[] {
    return [...this.deferred];
  }

  get isFinished(): boolean {
    return this.currentCard === null && this.queue.length === 0 && this.deferred.length === 0;
  }

  pointsOf(cardId: string): number {
    return this.points.get(cardId) ?? 0;
  }

  /** 用真实耗时修正单卡耗时估计（指数平滑） */
  recordDuration(ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    this.estimated = Math.round(this.estimated * 0.7 + ms * 0.3);
  }

  /**
   * 提交当前卡的评分并推进到下一张。
   * PRD §5.6：首次即认识通关；不认识置 0 重排；模糊置 1 重排；
   * 被打回后认识 +1，>= 2 通关；重排需满足「隔 3 张卡」且「距本次 60 秒」，取更靠后者。
   */
  applyRating(cardId: string, rating: RatingCode): RequeueResult {
    if (cardId !== this.currentCard) {
      throw new Error(`SessionQueue: 只能对当前卡「${String(this.currentCard)}」评分，收到 ${cardId}`);
    }
    const now = this.clock.now();
    const seenBefore = this.seen.get(cardId) ?? 0;
    this.seen.set(cardId, seenBefore + 1);
    this.lastSeenAt.set(cardId, now);

    const isFirstAppearance = seenBefore === 0;
    let points = this.points.get(cardId) ?? 0;

    if (rating === 'GOOD') {
      if (isFirstAppearance) {
        points = 2;
        this.points.set(cardId, points);
        this.passed.push(cardId);
        this.currentCard = null;
        return { outcome: 'PASSED', points };
      }
      points += 1;
      this.points.set(cardId, points);
      if (points >= 2) {
        this.passed.push(cardId);
        this.currentCard = null;
        return { outcome: 'PASSED', points };
      }
    } else if (rating === 'HARD') {
      points = 1;
      this.points.set(cardId, points);
    } else {
      points = 0;
      this.points.set(cardId, points);
    }

    this.currentCard = null;
    const result = this.reinsert(cardId, points);
    return result;
  }

  /** 本轮小结（队列清空时调用） */
  summary(): RoundSummary {
    return {
      learned: this.served.size,
      passed: this.passed.length,
      pending: this.deferred.length,
    };
  }

  toJSON(): SessionQueueSnapshot {
    return {
      queue: [...this.queue],
      current: this.currentCard,
      deferred: [...this.deferred],
      passed: [...this.passed],
      points: Object.fromEntries(this.points),
      seen: Object.fromEntries(this.seen),
      lastSeenAt: Object.fromEntries(this.lastSeenAt),
      revives: Object.fromEntries(this.revives),
      served: [...this.served],
      estimatedMsPerCard: this.estimated,
    };
  }

  static fromJSON(snapshot: SessionQueueSnapshot, options: SessionQueueOptions): SessionQueue {
    const q = new SessionQueue(snapshot.queue, options);
    q.currentCard = snapshot.current;
    q.deferred = [...snapshot.deferred];
    q.passed = [...snapshot.passed];
    for (const [k, v] of Object.entries(snapshot.points)) q.points.set(k, v);
    for (const [k, v] of Object.entries(snapshot.seen)) q.seen.set(k, v);
    for (const [k, v] of Object.entries(snapshot.lastSeenAt)) q.lastSeenAt.set(k, v);
    for (const [k, v] of Object.entries(snapshot.revives)) q.revives.set(k, v);
    for (const id of snapshot.served) q.served.add(id);
    q.estimated = snapshot.estimatedMsPerCard;
    return q;
  }

  private requiredGapCards(): number {
    const byTime = Math.ceil(this.opts.minGapMs / Math.max(1, this.estimated));
    return Math.max(this.opts.minGapCards, byTime);
  }

  private reinsert(cardId: string, points: number): RequeueResult {
    const gap = this.requiredGapCards();
    if (this.queue.length >= gap) {
      this.queue.splice(gap, 0, cardId);
      return { outcome: 'REINSERTED', points, gapCards: gap };
    }
    if (!this.deferred.includes(cardId)) this.deferred.push(cardId);
    return { outcome: 'DEFERRED', points };
  }

  /** 本轮其他卡完成后，待巩固卡重新入队 */
  private reviveDeferred(): void {
    if (this.deferred.length === 0) return;
    const ready: string[] = [];
    const kept: string[] = [];
    for (const id of this.deferred) {
      const used = this.revives.get(id) ?? 0;
      if (used < this.opts.maxDeferredRevives) {
        this.revives.set(id, used + 1);
        ready.push(id);
      } else {
        kept.push(id);
      }
    }
    this.deferred = kept;
    this.queue.push(...ready);
  }
}
