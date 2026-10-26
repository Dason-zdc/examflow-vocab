// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DEFAULT_SETTINGS } from '../domain/types';
import { AppHeader } from './AppHeader';

afterEach(cleanup);

function renderHeader(onView = vi.fn()) {
  render(
    <AppHeader
      settings={{ ...DEFAULT_SETTINGS, examDate: '2026-12-01' }}
      daysToExam={39}
      progress={null}
      view="study"
      exams={['IELTS']}
      searchQuery=""
      onSearch={() => {}}
      onView={onView}
      onSwitchExam={() => {}}
      onOpenSettings={() => {}}
      onOpenDashboard={() => {}}
    />,
  );
  return onView;
}

describe('移动端页面切换菜单', () => {
  it('展开后列出四个页面，选中后回到学习页之外并关闭菜单', () => {
    const onView = renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '切换页面' }));

    const menu = screen.getByRole('navigation', { name: '页面切换' });
    expect(within(menu).getByText('学习')).toBeTruthy();
    expect(within(menu).getByText('词库')).toBeTruthy();
    expect(within(menu).getByText('词典')).toBeTruthy();
    expect(within(menu).getByText('词根')).toBeTruthy();

    fireEvent.click(within(menu).getByText('词根'));
    expect(onView).toHaveBeenCalledWith('roots');
    expect(screen.queryByRole('navigation', { name: '页面切换' })).toBeNull();
  });

  it('Esc 关闭菜单', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '切换页面' }));
    expect(screen.getByRole('navigation', { name: '页面切换' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('navigation', { name: '页面切换' })).toBeNull();
  });

  it('当前页面标 aria-current', () => {
    renderHeader();
    fireEvent.click(screen.getByRole('button', { name: '切换页面' }));
    const menu = screen.getByRole('navigation', { name: '页面切换' });
    const current = within(menu).getByText('学习').closest('button');
    expect(current?.getAttribute('aria-current')).toBe('page');
  });
});
