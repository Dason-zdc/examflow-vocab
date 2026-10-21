import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { ExamFlowDB } from '../storage/db';
import { activateExam, ensureCardsForExam, ensureSettings } from './onboardingUseCase';
import { PackDictionary } from '../content/dictionary';
import type { PackWord } from '../content/packVerifier';
import { DEFAULT_SETTINGS } from '../domain/types';

let db: ExamFlowDB;

beforeEach(async () => {
  await new ExamFlowDB('onboarding-test').delete();
  db = new ExamFlowDB('onboarding-test');
  await db.open();
});

function packWord(lemma: string, weight: number, isBasic = false, exam: 'IELTS' | 'KAOYAN' = 'IELTS'): PackWord {
  return {
    id: `w_${lemma}`,
    lemma,
    phoneticUk: '',
    phoneticUs: '',
    isBasic,
    forms: [],
    senses: [
      {
        id: `s_${lemma}_a`,
        pos: 'n.',
        cn: `${lemma} 释义`,
        examStats: { [exam]: { senseWeight: weight, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
      },
      {
        id: `s_${lemma}_b`,
        pos: 'v.',
        cn: `${lemma} 僻义`,
        examStats: { [exam]: { senseWeight: weight - 5, tier: 'EXTENDED', kind: 'ESTIMATED', sources: ['t'], isEccentric: true } },
      },
    ],
    sentences: [],
    confusables: [],
    synonyms: [],
  };
}

const dictionary = new PackDictionary(
  [packWord('alpha', 70), packWord('basic', 60, true), packWord('gamma', 50)],
  {},
);

describe('onboardingUseCase · 建卡', () => {
  it('为每个词建主义项卡 + 僻义卡', async () => {
    const result = await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: false });
    expect(result.created).toBe(6); // 3 词 x 2 义项
    expect(result.skippedBasic).toBe(0);
    const rows = await db.cards.toArray();
    expect(rows.filter((r) => r.kind === 'PRIMARY')).toHaveLength(3);
    expect(rows.filter((r) => r.kind === 'ECCENTRIC')).toHaveLength(3);
  });

  it('excludeBasic 跳过基础词', async () => {
    const result = await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: true });
    expect(result.created).toBe(4);
    expect(result.skippedBasic).toBe(1);
    expect(await db.cards.where('wordId').equals('w_basic').count()).toBe(0);
  });

  it('幂等：重复执行只补缺，不重复建卡', async () => {
    const first = await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: true });
    expect(first.created).toBe(4);
    const second = await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: true });
    expect(second.created).toBe(0);
    expect(second.alreadyExists).toBe(4);
    expect(await db.cards.count()).toBe(4);
  });

  it('分批落库：batchSize=2 也全部落库', async () => {
    const result = await ensureCardsForExam(db, dictionary, 'IELTS', { excludeBasic: false, batchSize: 2 });
    expect(result.created).toBe(6);
    expect(await db.cards.count()).toBe(6);
  });

  it('ensureSettings 首次写入默认值，再次读取不覆盖', async () => {
    const s1 = await ensureSettings(db, DEFAULT_SETTINGS, '2026-12-19');
    expect(s1.exam).toBe('IELTS');
    expect(s1.examDate).toBe('2026-12-19');
    await db.settings.update('default', { maxNewPerDay: 80 });
    const s2 = await ensureSettings(db, DEFAULT_SETTINGS, '2027-01-01');
    expect(s2.maxNewPerDay).toBe(80);
    expect(s2.examDate).toBe('2026-12-19');
  });

  it('activateExam 切换考试并补建新考试卡片', async () => {
    await ensureSettings(db, DEFAULT_SETTINGS, '2026-12-19');
    const { settings, cards } = await activateExam(db, dictionary, 'IELTS');
    expect(settings.exam).toBe('IELTS');
    expect(cards.created).toBe(4); // 默认 excludeBasicWords = true

    const kyDict = new PackDictionary([packWord('zeta', 40, false, 'KAOYAN')], {});
    const second = await activateExam(db, kyDict, 'KAOYAN');
    expect(second.settings.exam).toBe('KAOYAN');
    expect(second.cards.created).toBe(2); // zeta 主 + 僻
    expect(await db.cards.where('exam').equals('IELTS').count()).toBe(4);
  });
});
