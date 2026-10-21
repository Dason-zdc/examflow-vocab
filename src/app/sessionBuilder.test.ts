import { describe, expect, it } from 'vitest';
import { State } from 'ts-fsrs';
import { buildSession, tierOfCard } from './sessionBuilder';
import { PackDictionary } from '../content/dictionary';
import { createScheduler } from '../domain/scheduler';
import type { PackWord } from '../content/packVerifier';
import type { Card, Settings } from '../domain/types';
import { makeCard } from '../test/factories';

function packWord(lemma: string, weight: number, tier: 'CORE' | 'ADVANCED' | 'EXTENDED'): PackWord {
  return {
    id: `w_${lemma}`,
    lemma,
    phoneticUk: '',
    phoneticUs: '',
    isBasic: false,
    forms: [],
    senses: [
      {
        id: `s_${lemma}_a`,
        pos: 'n.',
        cn: `${lemma}-主`,
        examStats: { IELTS: { senseWeight: weight, tier, kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
      },
      {
        id: `s_${lemma}_b`,
        pos: 'v.',
        cn: `${lemma}-僻`,
        examStats: { IELTS: { senseWeight: weight - 5, tier: 'EXTENDED', kind: 'ESTIMATED', sources: ['t'], isEccentric: true } },
      },
    ],
    sentences: [],
    confusables: [],
    synonyms: [],
  };
}

function settings(overrides: Partial<Settings> = {}): Settings {
  return {
    exam: 'IELTS',
    examDate: '2026-12-19',
    dayStartHour: 4,
    maxNewPerDay: 10,
    maxReviewPerDay: 100,
    excludeBasicWords: true,
    accent: 'uk',
    autoPlayAudio: false,
    dataPackVersion: '1.1.0',
    lastBackupAt: null,
    schemaVersion: 1,
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
    ...overrides,
  };
}

const NOW = new Date(2026, 10, 20, 10, 0).getTime(); // 2026-11-20

function dueCard(id: string, wordId: string, dueInDays: number, stability = 10): Card {
  const created = NOW - 30 * 86_400_000;
  const card = makeCard(id, {
    exam: 'IELTS',
    wordId,
    senseId: `s_${wordId}_a`,
    now: created,
    lastReview: created,
    stability,
    difficulty: 5,
    reps: 3,
    state: State.Review,
  });
  return { ...card, fsrs: { ...card.fsrs, due: new Date(NOW + dueInDays * 86_400_000) } };
}

describe('sessionBuilder · 队列组装', () => {
  const words = [packWord('alpha', 70, 'CORE'), packWord('beta', 50, 'ADVANCED'), packWord('gamma', 30, 'EXTENDED')];
  const dictionary = new PackDictionary(words, {});

  it('到期卡按优先级排序，新卡按权重追加，均遵守上限', () => {
    const cards = [
      dueCard('IELTS:s_alpha_a', 'alpha', -1), // 已到期
      dueCard('IELTS:s_beta_a', 'beta', 1), // 未到期
      makeCard('IELTS:s_gamma_a', { exam: 'IELTS', wordId: 'gamma', senseId: 's_gamma_a', now: NOW - 86_400_000 }),
    ];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings(), scheduler: createScheduler() });
    expect(built.queueCardIds).toEqual(['IELTS:s_alpha_a', 'IELTS:s_gamma_a']);
    expect(built.plan.reviewCount).toBe(1);
    expect(built.plan.newCount).toBe(1);
    expect(built.views.get('IELTS:s_alpha_a')?.tier).toBe('CORE');
  });

  it('新卡数量受 maxNewPerDay 限制', () => {
    const cards = Array.from({ length: 5 }, (_, i) =>
      makeCard(`IELTS:s_new${i}_a`, { exam: 'IELTS', wordId: `new${i}`, senseId: `s_new${i}_a`, now: NOW }),
    );
    const dict = new PackDictionary(
      Array.from({ length: 5 }, (_, i) => packWord(`new${i}`, 60 - i, 'ADVANCED')),
      {},
    );
    // 考期 2 天后：spread=1，需每日 5 张 > 上限 2 → 上限成为绑定约束
    const built = buildSession({
      cards,
      dictionary: dict,
      exam: 'IELTS',
      now: NOW,
      settings: settings({ maxNewPerDay: 2, examDate: '2026-11-22' }),
    });
    expect(built.queueCardIds).toHaveLength(2);
    expect(built.plan.newCount).toBe(2);
    expect(built.queueCardIds).toEqual(['IELTS:s_new0_a', 'IELTS:s_new1_a']); // 权重 60/59 前二
  });

  it('同词多张卡当日只出现 1 张（兄弟卡错开）', () => {
    const eccBase = makeCard('IELTS:s_alpha_b', {
      exam: 'IELTS',
      wordId: 'alpha',
      senseId: 's_alpha_b',
      now: NOW - 86_400_000,
      lastReview: NOW - 86_400_000,
      stability: 5,
      difficulty: 5,
      reps: 2,
      state: State.Review,
    });
    const ecc: Card = { ...eccBase, fsrs: { ...eccBase.fsrs, due: new Date(NOW - 86_400_000) } };
    const cards = [dueCard('IELTS:s_alpha_a', 'alpha', -1), ecc];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings() });
    expect(built.queueCardIds).toEqual(['IELTS:s_alpha_a']);
  });

  it('当日已学过的词不再出卡', () => {
    const cards = [dueCard('IELTS:s_alpha_a', 'alpha', -1), dueCard('IELTS:s_beta_a', 'beta', -1)];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings(), studiedWordIds: ['alpha'] });
    expect(built.queueCardIds).toEqual(['IELTS:s_beta_a']);
  });

  it('暂停的卡不进队列', () => {
    const cards = [dueCard('IELTS:s_alpha_a', 'alpha', -1), { ...dueCard('IELTS:s_beta_a', 'beta', -1), suspended: true }];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings() });
    expect(built.queueCardIds).toEqual(['IELTS:s_alpha_a']);
  });

  it('其它考试的卡被忽略', () => {
    const cards = [dueCard('IELTS:s_alpha_a', 'alpha', -1), dueCard('KAOYAN:s_alpha_a', 'alpha', -1)];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings() });
    expect(built.queueCardIds).toEqual(['IELTS:s_alpha_a']);
  });

  it('词条缺失时该卡被跳过（数据包换版不炸）', () => {
    const cards = [dueCard('IELTS:s_ghost_a', 'ghost', -1), dueCard('IELTS:s_alpha_a', 'alpha', -1)];
    const built = buildSession({ cards, dictionary, exam: 'IELTS', now: NOW, settings: settings() });
    expect(built.queueCardIds).toEqual(['IELTS:s_alpha_a']);
  });

  it('无卡可学时队列为空且无警告（没什么可学完的）', () => {
    const built = buildSession({ cards: [], dictionary, exam: 'IELTS', now: NOW, settings: settings() });
    expect(built.queueCardIds).toEqual([]);
    expect(built.plan.warnings).toEqual([]);
    expect(built.plan.reviewCount).toBe(0);
    expect(built.plan.newCount).toBe(0);
  });
});

describe('sessionBuilder · tierOfCard', () => {
  const dictionary = new PackDictionary([packWord('alpha', 70, 'CORE')], {});
  it('取义项 tier；词或义项缺失时按 EXTENDED 处理', () => {
    expect(tierOfCard(makeCard('IELTS:s_alpha_a', { wordId: 'alpha', senseId: 's_alpha_a' }), dictionary, 'IELTS')).toBe('CORE');
    expect(tierOfCard(makeCard('IELTS:s_x', { wordId: 'ghost', senseId: 's_x' }), dictionary, 'IELTS')).toBe('EXTENDED');
    expect(tierOfCard(makeCard('IELTS:s_y', { wordId: 'alpha', senseId: 's_missing' }), dictionary, 'IELTS')).toBe('EXTENDED');
  });
});
