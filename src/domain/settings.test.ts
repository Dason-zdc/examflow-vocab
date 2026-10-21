import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, withDefaultSettings, type Settings } from './types';

describe('withDefaultSettings · 历史设置行兼容', () => {
  it('缺少后加字段（AI 配置）时补默认值，不返回 undefined', () => {
    const legacy = {
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
    } as unknown as Partial<Settings>;

    const settings = withDefaultSettings(legacy);
    expect(settings.aiBaseUrl).toBe('');
    expect(settings.aiApiKey).toBe('');
    expect(settings.aiModel).toBe('');
    expect(settings.examDate).toBe('2026-12-20');
    expect(settings.maxNewPerDay).toBe(50);
  });

  it('剥离存储行专有字段 id / updatedAt', () => {
    const settings = withDefaultSettings({ ...DEFAULT_SETTINGS, examDate: '', id: 'default', updatedAt: 123 } as never);
    expect('id' in settings).toBe(false);
    expect('updatedAt' in settings).toBe(false);
  });

  it('显式值为空串时不被默认值覆盖', () => {
    const settings = withDefaultSettings({ ...DEFAULT_SETTINGS, examDate: '', aiModel: 'deepseek-chat' });
    expect(settings.aiModel).toBe('deepseek-chat');
    expect(settings.examDate).toBe('');
  });

  it('null / undefined 也能拿到完整默认设置', () => {
    expect(withDefaultSettings(null).exam).toBe('IELTS');
    expect(withDefaultSettings(undefined).aiApiKey).toBe('');
  });
});
