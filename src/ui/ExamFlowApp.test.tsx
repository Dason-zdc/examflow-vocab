// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { render, screen, waitFor } from '@testing-library/react';
import { ExamFlowApp } from './ExamFlowApp';
import { ExamFlowDB } from '../storage/db';
import type { LoadedPack } from '../content/packLoader';
import type { PackWord } from '../content/packVerifier';
import { DEFAULT_SETTINGS } from '../domain/types';

/*
 * 回归：新用户首屏白屏（QA-2 报告的 P0-1）。
 * 根因是 render 期无条件求值 daysToExam(settings.examDate)，
 * 而 examDate 为空串时 parseDay('') 抛错，导致 React 卸载整树。
 */

const DB_NAME = 'app-shell-test';

const pack: LoadedPack = {
  exam: 'IELTS',
  version: '1.0.0',
  manifest: {
    exam: 'IELTS',
    version: '1.0.0',
    minAppVersion: '1.0.0',
    generatedAt: '2026-10-20T00:00:00.000Z',
    wordCount: 1,
    chunkSize: 1,
    chunks: [{ n: 0, file: 'chunk-0.json', wordCount: 1, sha256: 'x', bytes: 1 }],
    lemmaMap: { file: 'lemma-map.json', sha256: 'x', bytes: 1, entries: 0 },
    deprecatedWordIds: [],
    frequencyMethod: 'ESTIMATED',
    provenanceNote: 'test',
    sources: [],
    license: 'test',
  },
  words: [
    {
      id: 'w_alpha',
      lemma: 'alpha',
      phoneticUk: '/ˈælfə/',
      phoneticUs: '',
      isBasic: false,
      forms: [],
      senses: [
        {
          id: 's_alpha_a',
          pos: 'n.',
          cn: '阿尔法',
          examStats: { IELTS: { senseWeight: 80, tier: 'CORE', kind: 'ESTIMATED', sources: ['test'], isEccentric: false } },
        },
      ],
      sentences: [
        {
          id: 'x_alpha_1',
          wordId: 'w_alpha',
          senseId: 's_alpha_a',
          en: 'Alpha comes first.',
          zh: '阿尔法排第一。',
          surfaceForm: 'Alpha',
          provenance: { type: 'ADAPTED', note: '仿真例句' },
        },
      ],
      confusables: [],
      synonyms: [],
    } as PackWord,
  ],
  lemmaMap: {},
  wordById: new Map(),
  stats: { fromCache: 0, fromNetwork: 1, offline: false },
};

vi.mock('../content/packLoader', () => ({
  loadPack: vi.fn(async () => {
    pack.wordById = new Map(pack.words.map((w) => [w.id, w]));
    return pack;
  }),
}));

describe('ExamFlowApp · 首屏不白屏', () => {
  beforeEach(async () => {
    await new ExamFlowDB(DB_NAME).delete();
  });

  it('examDate 为空时渲染引导，而不是抛错卸载整树', async () => {
    // 模拟新用户：库存在，但设置行的 examDate 是空串
    const seed = new ExamFlowDB(DB_NAME);
    await seed.open();
    await seed.settings.put({ id: 'default', ...DEFAULT_SETTINGS, exam: 'IELTS', examDate: '' });
    seed.close();

    // 核心断言：render 不得抛错
    expect(() => render(<ExamFlowApp />)).not.toThrow();

    // 引导文案出现，说明整棵树渲染成功
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '先设置考试日期' })).toBeTruthy();
    });

    // 倒计时 chip 显示「未设置考期」而不是「距考试 null 天」
    expect(screen.getByText('未设置考期')).toBeTruthy();
    expect(screen.queryByText(/距考试 null/)).toBeNull();
  });

  it('daysToExamLabel 对 null 走独立分支', async () => {
    const { daysToExamLabel } = await import('./format');
    expect(daysToExamLabel(null)).toBe('未设置考期');
    expect(daysToExamLabel(0)).toBe('今天考试');
    expect(daysToExamLabel(5)).toBe('距考试 5 天');
  });
});
