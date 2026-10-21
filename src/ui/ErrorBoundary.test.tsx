// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// 非 globals 模式下 RTL 不会自动清理
afterEach(cleanup);

/** 稳定抛错的子组件（每次渲染都炸） */
function Boom(): never {
  throw new Error('渲染期炸了');
}

/**
 * 外部可控的错误条件：boom 为 true 时每次渲染都抛错，
 * 保证边界稳定进入兜底态。不能用「只抛一次」的自愈组件——
 * render 期抛错后 React 会重试渲染子树，第二次渲染时错误条件
 * 已清除，边界根本进不了兜底，断言无从谈起。
 */
const ctl = { boom: true };
function Controlled() {
  if (ctl.boom) throw new Error('渲染期炸了');
  return <p>子组件已恢复</p>;
}

describe('ErrorBoundary · 根级错误兜底', () => {
  it('渲染期抛错时展示 role=alert 兜底：含「页面出错了」与重试按钮', () => {
    // React 与边界自身都会 console.error，静音避免污染测试输出
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('页面出错了')).toBeTruthy();
    expect(screen.getByRole('button', { name: '重试' })).toBeTruthy();
  });

  it('点重试后子组件恢复渲染，兜底消失', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    ctl.boom = true;
    render(
      <ErrorBoundary>
        <Controlled />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toBeTruthy();
    // 模拟错误条件已消除（真实场景：故障代码修复 / 脏数据恢复）
    ctl.boom = false;
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(screen.getByText('子组件已恢复')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('正常子组件直接渲染，不出现兜底', () => {
    render(
      <ErrorBoundary>
        <p>一切正常</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('一切正常')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
