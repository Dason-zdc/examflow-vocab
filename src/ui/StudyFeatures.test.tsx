// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ExamFlowApp } from './ExamFlowApp';
import { ExamFlowDB, DEFAULT_DB_NAME } from '../storage/db';
import type { LoadedPack } from '../content/packLoader';
import type { PackWord } from '../content/packVerifier';
import { DEFAULT_SETTINGS } from '../domain/types';

/** 原型/PRD 对齐后的交互冒烟：点词即查、拼写练习、仪表盘、AI 配置入口。
 * 单用例串行执行：应用固定打开默认库，反复 delete/open 会与上一个实例的连接竞争。 */

const DB_NAME = DEFAULT_DB_NAME;

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
          en: 'Alpha comes first in the list.',
          zh: '阿尔法排在列表第一位。',
          surfaceForm: 'Alpha',
          provenance: { type: 'ADAPTED', note: '仿真例句' },
        },
      ],
      confusables: [],
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

describe('学习页新增交互', () => {
  beforeEach(async () => {
    await new ExamFlowDB(DB_NAME).delete();
    const seed = new ExamFlowDB(DB_NAME);
    await seed.open();
    await seed.settings.put({ id: 'default', ...DEFAULT_SETTINGS, exam: 'IELTS', examDate: '2026-12-20' });
    seed.close();
  });

  it('点词即查 / 拼写 / 仪表盘 / AI 配置入口都能用', async () => {
    const scrollSpy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    render(<ExamFlowApp />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'alpha' })).toBeTruthy(), { timeout: 5000 });

    // 0. 正面评分卡选中态：点了必须有反馈（aria-pressed + 提示文案）
    const hard = screen.getByRole('button', { name: /模糊（快捷键 2）/ });
    expect(hard.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hard);
    expect(hard.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText(/已预判为「模糊」/)).toBeTruthy();

    fireEvent.click(within(screen.getByRole('region', { name: '学习卡片' })).getByRole('button', { name: /^直接看答案/ }));
    await waitFor(() => expect(screen.getByRole('region', { name: '学习卡片答案' })).toBeTruthy(), { timeout: 5000 });

    // 1. 点词即查：例句单词可点击，未收录词可加入生词本
    fireEvent.click(screen.getByRole('button', { name: '查询 comes' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: '点词即查' })).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText(/词库未收录/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '加入生词本' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '已在生词本' })).toBeTruthy(), { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    // 2. 拼写练习：S 打开，错误提示正确拼写，正确后记为通过
    fireEvent.keyDown(window, { key: 's' });
    await waitFor(() => expect(screen.getByRole('dialog', { name: '拼写练习' })).toBeTruthy(), { timeout: 5000 });
    const input = screen.getByLabelText('输入拼写');
    fireEvent.change(input, { target: { value: 'alph' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(/不正确，正确拼写：alpha/)).toBeTruthy();
    fireEvent.change(input, { target: { value: 'alpha' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText(/完全正确/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    // 3. 仪表盘
    fireEvent.click(screen.getByRole('button', { name: '学习仪表盘' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: '学习仪表盘' })).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('核心覆盖率')).toBeTruthy();
    expect(screen.getByText('近 7 日复习量')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    // 4. AI 私教三项配置在设置里
    fireEvent.click(screen.getByRole('button', { name: '设置' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: '学习计划与设置' })).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByLabelText('AI Base URL')).toBeTruthy();
    expect(screen.getByLabelText('AI API Key')).toBeTruthy();
    expect(screen.getByLabelText('AI 模型名')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '学习计划与设置' })).toBeNull(), { timeout: 5000 });

    // 5. 换卡后视口复位（背面读到底部时新卡会从页面中部出现）
    fireEvent.click(within(screen.getByRole('region', { name: '学习卡片答案' })).getByRole('button', { name: /^下一个/ }));
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' }), { timeout: 5000 });
    scrollSpy.mockRestore();
    // 全链路冒烟：整包加载 + 五个弹窗串联，并行跑测试文件时会超过默认 5s
  }, 20000);
});
