import { describe, expect, it } from 'vitest';
import { SessionQueue } from './sessionQueue';
import { createManualClock } from './clock';

const T0 = new Date(2026, 9, 20, 10, 0).getTime();

function makeQueue(ids: string[], options: { minGapCards?: number; minGapMs?: number; estimatedMsPerCard?: number } = {}) {
  const clock = createManualClock(T0);
  return { clock, queue: new SessionQueue(ids, { clock, ...options }) };
}

describe('sessionQueue · 通关积分', () => {
  it('首次出现即「认识」直接通关', () => {
    const { queue } = makeQueue(['a', 'b']);
    expect(queue.advance()).toBe('a');
    const r = queue.applyRating('a', 'GOOD');
    expect(r.outcome).toBe('PASSED');
    expect(queue.advance()).toBe('b');
  });

  it('不认识置 0 重新插入队列', () => {
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    queue.advance();
    const r = queue.applyRating('a', 'AGAIN');
    expect(r.outcome).toBe('REINSERTED');
    expect(r.points).toBe(0);
    expect(r.gapCards).toBe(4);
    // 4 张卡之后才会再见到 a
    expect(queue.advance()).toBe('b');
  });

  it('模糊置 1；被打回后认识 +1，>= 2 才通关', () => {
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    queue.advance();
    expect(queue.applyRating('a', 'HARD').points).toBe(1);

    let current = queue.advance();
    let guard = 0;
    while (current !== null && current !== 'a' && guard++ < 20) {
      queue.applyRating(current, 'GOOD');
      current = queue.advance();
    }
    expect(current).toBe('a');
    // 模糊(1) + 认识(+1) = 2 -> 通关
    const r = queue.applyRating('a', 'GOOD');
    expect(r.points).toBe(2);
    expect(r.outcome).toBe('PASSED');
  });

  it('不认识(0) 后一次认识只到 1 分，仍要重排', () => {
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    queue.advance();
    queue.applyRating('a', 'AGAIN');
    let current = queue.advance();
    let guard = 0;
    while (current !== null && current !== 'a' && guard++ < 20) {
      queue.applyRating(current, 'AGAIN');
      current = queue.advance();
    }
    expect(current).toBe('a');
    const r = queue.applyRating('a', 'GOOD');
    expect(r.points).toBe(1);
    expect(r.outcome).not.toBe('PASSED');
  });
});

describe('sessionQueue · 重排间隔', () => {
  it('T-08 本轮剩余 2 张卡时评「不认识」-> 标为待巩固，不会立即连续出现', () => {
    const { queue } = makeQueue(['a', 'b', 'c']);
    expect(queue.advance()).toBe('a');
    const r = queue.applyRating('a', 'AGAIN');
    expect(r.outcome).toBe('DEFERRED');
    expect(queue.pendingConsolidation).toEqual(['a']);

    // 下一张是 b，不是刚被打回的 a
    expect(queue.advance()).toBe('b');
    expect(queue.current).toBe('b');
  });

  it('待巩固卡在本轮其他卡完成后再出现，且仍按积分规则决定是否继续', () => {
    const { queue } = makeQueue(['a', 'b', 'c']);
    queue.advance();
    queue.applyRating('a', 'AGAIN'); // 置 0 -> 待巩固
    queue.advance();
    queue.applyRating('b', 'GOOD'); // 通关
    queue.advance();
    queue.applyRating('c', 'GOOD'); // 通关

    // 队列空了才唤醒待巩固卡
    expect(queue.advance()).toBe('a');
    // 0 + 1 = 1 < 2，仍未通关，重新进入待巩固
    const r = queue.applyRating('a', 'GOOD');
    expect(r.points).toBe(1);
    expect(queue.summary()).toEqual({ learned: 3, passed: 2, pending: 1 });
    expect(queue.isFinished).toBe(false);

    // 再答对一次 -> 2 分通关
    expect(queue.advance()).toBe('a');
    expect(queue.applyRating('a', 'GOOD').outcome).toBe('PASSED');
    expect(queue.isFinished).toBe(true);
  });

  it('重排间隔取「至少隔 3 张卡」与「距本次 60 秒」中更靠后者', () => {
    // 估计单卡 10 秒 -> 60 秒换算成 6 张卡，> 3
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], { estimatedMsPerCard: 10_000 });
    queue.advance();
    const r = queue.applyRating('a', 'AGAIN');
    expect(r.gapCards).toBe(6);

    // 估计单卡 60 秒 -> 60 秒换算成 1 张卡，取下限 3
    const { queue: q2 } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f'], { estimatedMsPerCard: 60_000 });
    q2.advance();
    expect(q2.applyRating('a', 'AGAIN').gapCards).toBe(3);
  });

  it('实际耗时会修正单卡耗时估计，进而影响重排间隔', () => {
    // 慢卡：单卡 60 秒 -> 60 秒只需 1 张，取「至少 3 张」的下限
    const slow = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    slow.queue.advance();
    for (let i = 0; i < 20; i += 1) slow.queue.recordDuration(60_000);
    expect(slow.queue.applyRating('a', 'AGAIN').gapCards).toBe(3);

    // 快卡：单卡 1 秒 -> 60 秒需要 60 张，剩余不足 -> 待巩固
    const fast = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    fast.queue.advance();
    for (let i = 0; i < 30; i += 1) fast.queue.recordDuration(1_000);
    expect(fast.queue.applyRating('a', 'AGAIN').outcome).toBe('DEFERRED');
  });

  it('非正数耗时被忽略，不把估计值改成 NaN', () => {
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    queue.advance();
    queue.recordDuration(-5);
    queue.recordDuration(Number.NaN);
    expect(queue.applyRating('a', 'AGAIN').gapCards).toBe(4);
  });
});

describe('sessionQueue · 本轮结束与小结', () => {
  it('T-09 队列清空即结束，只统计本轮卡片，不拉入未到期卡', () => {
    const { queue } = makeQueue(['a', 'b', 'c']);
    queue.advance();
    queue.applyRating('a', 'GOOD');
    queue.advance();
    queue.applyRating('b', 'GOOD');
    queue.advance();
    queue.applyRating('c', 'GOOD');

    expect(queue.advance()).toBeNull();
    expect(queue.isFinished).toBe(true);
    const s = queue.summary();
    expect(s).toEqual({ learned: 3, passed: 3, pending: 0 });
  });

  it('小结区分通关数与待巩固数', () => {
    const { queue } = makeQueue(['a', 'b', 'c']);
    queue.advance();
    queue.applyRating('a', 'AGAIN'); // 待巩固
    queue.advance();
    queue.applyRating('b', 'GOOD'); // 通关
    queue.advance();
    queue.applyRating('c', 'GOOD'); // 通关
    expect(queue.summary()).toEqual({ learned: 3, passed: 2, pending: 1 });
  });
});

describe('sessionQueue · 契约与快照', () => {
  it('只能对当前卡评分', () => {
    const { queue } = makeQueue(['a', 'b']);
    queue.advance();
    expect(() => queue.applyRating('b', 'GOOD')).toThrow(/当前卡/);
  });

  it('快照往返后状态一致', () => {
    const { queue } = makeQueue(['a', 'b', 'c', 'd', 'e', 'f']);
    queue.advance();
    queue.applyRating('a', 'AGAIN');
    const snapshot = queue.toJSON();

    const clock = createManualClock(T0);
    const restored = SessionQueue.fromJSON(snapshot, { clock });
    expect(restored.current).toBeNull();
    expect(restored.toJSON().queue).toEqual(snapshot.queue);
    expect(restored.pointsOf('a')).toBe(0);
    expect(restored.advance()).toBe('b');
  });
});
