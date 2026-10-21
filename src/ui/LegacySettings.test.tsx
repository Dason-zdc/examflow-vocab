// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AiTutorPanel } from './AiTutorPanel';
import { SettingsModal } from './SettingsModal';
import type { Settings } from '../domain/types';
import type { SyncController } from '../app/sync/useSync';
import { EMPTY_SYNC_STATE } from '../app/sync/syncEngine';
import { makeSense, makeWord } from '../test/factories';
import type { PackWord } from '../content/packVerifier';

/**
 * 回归：老版本写进 IndexedDB 的设置行没有 AI 字段，
 * 新代码直接在 `.trim()` 上取属性会抛 "Cannot read properties of undefined"，
 * 导致整个学习页白屏。这里锁定两条入口都不崩。
 */

afterEach(cleanup);

const legacySettings = {
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
} as unknown as Settings;

const word: PackWord = {
  ...makeWord('w_alpha', [makeSense('s_alpha')]),
  forms: [],
  sentences: [],
};

const sync: SyncController = {
  state: EMPTY_SYNC_STATE,
  phase: 'idle',
  error: null,
  register: vi.fn(async () => undefined),
  login: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
  syncNow: vi.fn(async () => undefined),
};

describe('旧版设置行兼容', () => {
  it('AI 面板显示「未配置」而不是抛错', () => {
    expect(() =>
      render(
        <AiTutorPanel
          settings={legacySettings}
          word={word}
          sense={word.senses[0]!}
          cardId="c1"
          onAppendNote={vi.fn()}
          onOpenSettings={vi.fn()}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByText(/未配置/)).toBeTruthy();
  });

  it('设置弹窗可打开并完成校验，不因 trim 抛错', () => {
    const onSave = vi.fn(async () => undefined);
    render(
      <SettingsModal
        open
        settings={{ ...legacySettings, examDate: '' }}
        saving={false}
        sync={sync}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    expect((screen.getByLabelText('AI Base URL') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('AI API Key') as HTMLInputElement).value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: '保存' }));
    // 走到日期校验说明 validate 正常执行完毕（没有在 trim 上崩）
    expect(screen.getByText(/请按 YYYY-MM-DD 格式填写/)).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});
