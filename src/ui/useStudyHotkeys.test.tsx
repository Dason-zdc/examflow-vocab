// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, renderHook } from '@testing-library/react';
import { useStudyHotkeys, type HotkeyHandlers } from './useStudyHotkeys';

// 非 globals 模式下 RTL 不会自动清理：窗口级监听会跨用例残留，必须显式 cleanup
afterEach(cleanup);

function makeHandlers(overrides: Partial<HotkeyHandlers> = {}): HotkeyHandlers {
  return {
    onRevealOrNext: vi.fn(),
    onNext: vi.fn(),
    onRate: vi.fn(),
    onPlay: vi.fn(),
    onSuspend: vi.fn(),
    onUndo: vi.fn(),
    onSpell: vi.fn(),
    onToggleEtymology: vi.fn(),
    onToggleConfusables: vi.fn(),
    ...overrides,
  };
}

function setup(overrides: Partial<HotkeyHandlers> = {}) {
  const handlers = makeHandlers(overrides);
  renderHook(() => useStudyHotkeys(handlers, true));
  return handlers;
}

/** 生产装配口径：onNext 与 onRevealOrNext 是同一实现（StudyView hotkeys useMemo） */
function setupShared() {
  const shared = vi.fn();
  const handlers = setup({ onRevealOrNext: shared, onNext: shared });
  return { handlers, shared };
}

function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(window, { key, ...init });
}

function withFocusedElement<T extends HTMLElement>(tag: string, run: (el: T) => void) {
  const el = document.createElement(tag) as T;
  document.body.appendChild(el);
  el.focus();
  try {
    run(el);
  } finally {
    el.remove();
  }
}

describe('useStudyHotkeys · 按键分发（PRD §6.6 MVP 子集）', () => {
  it('Space：未揭示时揭示，已揭示时下一个（由 handler 按 revealed 分流）', () => {
    const seen: string[] = [];
    let revealed = false;
    setup({
      onRevealOrNext: () => {
        seen.push(revealed ? 'next' : 'reveal');
        revealed = true;
      },
    });
    press(' ');
    press(' ');
    expect(seen).toEqual(['reveal', 'next']);
  });

  it('→ 与 Enter 与 Space 同行为：三者都打到同一个 handler', () => {
    const { handlers, shared } = setupShared();
    press(' ');
    press('ArrowRight');
    press('Enter');
    expect(shared).toHaveBeenCalledTimes(3);
    expect(handlers.onRate).not.toHaveBeenCalled();
    expect(handlers.onPlay).not.toHaveBeenCalled();
  });

  it('1/2/3 映射 AGAIN/HARD/GOOD 三档评分键', () => {
    const onRate = vi.fn();
    setup({ onRate });
    press('1');
    press('2');
    press('3');
    expect(onRate.mock.calls).toEqual([['1'], ['2'], ['3']]);
  });

  it('R/r 与 F/f 触发词根与形近词区块折叠', () => {
    const handlers = setup();
    press('r');
    press('R');
    press('f');
    press('F');
    expect(handlers.onToggleEtymology).toHaveBeenCalledTimes(2);
    expect(handlers.onToggleConfusables).toHaveBeenCalledTimes(2);
  });

  it('C 与 Shift+C 分别传 shift=false/true', () => {
    const onPlay = vi.fn();
    setup({ onPlay });
    press('c');
    press('C', { shiftKey: true });
    expect(onPlay.mock.calls).toEqual([[false], [true]]);
  });

  it('X/x 斩词、Z/z 撤销', () => {
    const handlers = setup();
    press('x');
    press('X');
    press('z');
    press('Z');
    expect(handlers.onSuspend).toHaveBeenCalledTimes(2);
    expect(handlers.onUndo).toHaveBeenCalledTimes(2);
  });

  it('焦点在 INPUT/TEXTAREA 时按键不分发，移出焦点后恢复', () => {
    const handlers = setup();
    withFocusedElement<HTMLInputElement>('input', (input) => {
      fireEvent.keyDown(input, { key: ' ' });
      fireEvent.keyDown(input, { key: '1' });
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.keyDown(input, { key: 'x' });
      fireEvent.keyDown(input, { key: 'ArrowRight' });
    });
    withFocusedElement<HTMLTextAreaElement>('textarea', (ta) => {
      fireEvent.keyDown(ta, { key: ' ' });
      fireEvent.keyDown(ta, { key: '3' });
    });
    expect(handlers.onRevealOrNext).not.toHaveBeenCalled();
    expect(handlers.onNext).not.toHaveBeenCalled();
    expect(handlers.onRate).not.toHaveBeenCalled();
    expect(handlers.onSuspend).not.toHaveBeenCalled();
    press(' ');
    expect(handlers.onRevealOrNext).toHaveBeenCalledTimes(1);
  });

  describe('焦点在 BUTTON 上时按「按键让位」口径分发', () => {
    it('按 1 → 评分键照常分发（鼠标点过按钮不毒化键盘流）', () => {
      const onRate = vi.fn();
      setup({ onRate });
      withFocusedElement<HTMLButtonElement>('button', (btn) => fireEvent.keyDown(btn, { key: '1' }));
      expect(onRate).toHaveBeenCalledWith('1');
    });

    it('按 Space → 不分发（保留原生激活）', () => {
      const handlers = setup();
      withFocusedElement<HTMLButtonElement>('button', (btn) => fireEvent.keyDown(btn, { key: ' ' }));
      expect(handlers.onRevealOrNext).not.toHaveBeenCalled();
    });

    it('按 Enter → 不分发（保留原生激活，防快捷键+点击双触发）', () => {
      const handlers = setup();
      withFocusedElement<HTMLButtonElement>('button', (btn) => fireEvent.keyDown(btn, { key: 'Enter' }));
      expect(handlers.onNext).not.toHaveBeenCalled();
    });

    it('按 → → onNext 照常分发', () => {
      const handlers = setup();
      withFocusedElement<HTMLButtonElement>('button', (btn) => fireEvent.keyDown(btn, { key: 'ArrowRight' }));
      expect(handlers.onNext).toHaveBeenCalledTimes(1);
    });

    it('按 r → 词根折叠 handler 照常分发', () => {
      const handlers = setup();
      withFocusedElement<HTMLButtonElement>('button', (btn) => fireEvent.keyDown(btn, { key: 'r' }));
      expect(handlers.onToggleEtymology).toHaveBeenCalledTimes(1);
    });
  });

  it('修饰键组合不触发（避免与浏览器/系统快捷键冲突）', () => {
    const handlers = setup();
    press(' ', { ctrlKey: true });
    press('1', { metaKey: true });
    press('z', { altKey: true });
    expect(handlers.onRevealOrNext).not.toHaveBeenCalled();
    expect(handlers.onRate).not.toHaveBeenCalled();
    expect(handlers.onUndo).not.toHaveBeenCalled();
  });

  it('enabled=false（如弹窗打开）时不挂监听', () => {
    const handlers = makeHandlers();
    renderHook(() => useStudyHotkeys(handlers, false));
    press(' ');
    press('1');
    expect(handlers.onRevealOrNext).not.toHaveBeenCalled();
    expect(handlers.onRate).not.toHaveBeenCalled();
  });
});
