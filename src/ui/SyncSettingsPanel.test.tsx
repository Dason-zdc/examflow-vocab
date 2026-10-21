// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SyncSettingsPanel } from './SyncSettingsPanel';
import { EMPTY_SYNC_STATE } from '../app/sync/syncEngine';
import type { SyncController } from '../app/sync/useSync';

// vitest 未开启 globals，Testing Library 的自动清理不会注册，显式清理
afterEach(cleanup);

function controller(overrides: Partial<SyncController> = {}): SyncController {
  return {
    state: EMPTY_SYNC_STATE,
    phase: 'idle',
    error: null,
    register: vi.fn(async () => undefined),
    login: vi.fn(async () => undefined),
    logout: vi.fn(async () => undefined),
    syncNow: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('SyncSettingsPanel', () => {
  it('未登录时展示账号表单，合法输入后点击注册调用 register', () => {
    const sync = controller();
    render(<SyncSettingsPanel sync={sync} />);

    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: '注册并开启同步' }));

    expect(sync.register).toHaveBeenCalledWith('alice', 'password123');
  });

  it('未登录时密码不足 8 位则按钮禁用', () => {
    render(<SyncSettingsPanel sync={controller()} />);
    fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'alice' } });
    fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'short' } });
    expect((screen.getByRole('button', { name: '注册并开启同步' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('已登录时展示账号，点击立即同步调用 syncNow', () => {
    const sync = controller({
      state: { ...EMPTY_SYNC_STATE, enabled: true, token: 't', username: 'alice', lastSyncAt: 1792551000000 },
    });
    render(<SyncSettingsPanel sync={sync} />);

    expect(screen.getByText('alice')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '立即同步' }));
    expect(sync.syncNow).toHaveBeenCalledTimes(1);
  });

  it('同步失败时展示错误信息', () => {
    const sync = controller({
      state: { ...EMPTY_SYNC_STATE, enabled: true, token: 't', username: 'alice' },
      phase: 'error',
      error: '网络不可用',
    });
    render(<SyncSettingsPanel sync={sync} />);
    expect(screen.getByRole('status').textContent).toContain('网络不可用');
  });
});
