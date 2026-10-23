// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { ExamFlowApp } from './ExamFlowApp';
import { DEFAULT_DB_NAME, ExamFlowDB } from '../storage/db';
import type { LoadedPack } from '../content/packLoader';
import type { PackWord } from '../content/packVerifier';

/**
 * 端到端回归：浏览器里已存在「旧版设置行」（没有本轮新增的 AI 字段）时，
 * 直接访问首页不得白屏。根因是 `settings.aiBaseUrl.trim()` 对 undefined 取属性。
 */

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
      id: 'w_boot',
      lemma: 'boot',
      phoneticUk: '',
      phoneticUs: '',
      isBasic: false,
      senses: [
        {
          id: 's_boot',
          pos: 'n.',
          cn: '启动',
          examStats: { IELTS: { senseWeight: 60, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
        },
      ],
      confusables: [],
      forms: [],
      sentences: [],
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

afterEach(cleanup);

describe('旧版设置行启动回归', () => {
  beforeEach(async () => {
    await new ExamFlowDB(DEFAULT_DB_NAME).delete();
    const seed = new ExamFlowDB(DEFAULT_DB_NAME);
    await seed.open();
    // 故意不写 aiBaseUrl / aiApiKey / aiModel，模拟上一版本留下的数据
    await seed.settings.put({
      id: 'default',
      exam: 'IELTS',
      examDate: '2026-12-20',
      dayStartHour: 4,
      maxNewPerDay: 50,
      maxReviewPerDay: 300,
      excludeBasicWords: true,
      accent: 'uk',
      autoPlayAudio: false,
      dataPackVersion: '1.1.0',
      lastBackupAt: null,
      schemaVersion: 1,
    } as never);
    seed.close();
  });

  it('首页正常渲染卡片，AI 面板显示未配置', async () => {
    render(<ExamFlowApp />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'boot' })).toBeTruthy(), { timeout: 5000 });
    await waitFor(() => expect(screen.getByText(/未配置/)).toBeTruthy(), { timeout: 5000 });
  });
});
