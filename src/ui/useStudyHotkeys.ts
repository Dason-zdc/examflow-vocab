import { useEffect } from 'react';

/** 学习快捷键（PRD §6.6 MVP 子集 + UIUX P10 面板口径）。
 * 桌面端启用；弹窗打开时由调用方把 enabled 置 false（Esc 交给弹窗自行处理）。
 *
 * 屏蔽口径（产品裁定 · 按键让位）：
 * - 输入类元素（INPUT/TEXTAREA/SELECT/contentEditable）：全量屏蔽，任何键都不分发；
 * - 可激活元素（BUTTON/A/SUMMARY/[role=button]）：仅让位激活键 ' ' 与 Enter
 *   （保留原生激活、不分发、不 preventDefault），其余键照常分发。
 *   这样既防止 Enter/Space 既触发快捷键又触发点击的双触发，也不会让一次
 *   鼠标点击「毒化」整个键盘流（点过按钮后 1/2/3/C/X/Z/R/F/→ 依然可用）。 */

export interface HotkeyHandlers {
  /** Space：正面揭示 / 背面下一个 */
  onRevealOrNext: () => void;
  /** 右方向键 / 回车：与 Space 同行为（StudyView 装配为同一实现） */
  onNext: () => void;
  onRate: (key: '1' | '2' | '3') => void;
  onPlay: (shift: boolean) => void;
  onSuspend: () => void;
  onUndo: () => void;
  /** R：词根区块展开 / 收起 */
  onToggleEtymology: () => void;
  /** F：形近词区块展开 / 收起 */
  onToggleConfusables: () => void;
}

/** 输入类元素：每个键都对输入有意义，全量屏蔽 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/** 可激活元素上的激活键：让位原生行为（不分发、不 preventDefault） */
function yieldsActivationKey(e: KeyboardEvent): boolean {
  if (e.key !== ' ' && e.key !== 'Enter') return false;
  const target = e.target;
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || target.getAttribute('role') === 'button';
}

export function useStudyHotkeys(handlers: HotkeyHandlers, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      if (yieldsActivationKey(e)) return;
      switch (e.key) {
        case ' ':
          preventDefaultForKey(e);
          handlers.onRevealOrNext();
          break;
        case 'ArrowRight':
        case 'Enter':
          preventDefaultForKey(e);
          handlers.onNext();
          break;
        case '1':
        case '2':
        case '3':
          handlers.onRate(e.key);
          break;
        case 'c':
        case 'C':
          handlers.onPlay(e.shiftKey);
          break;
        case 'r':
        case 'R':
          handlers.onToggleEtymology();
          break;
        case 'f':
        case 'F':
          handlers.onToggleConfusables();
          break;
        case 'x':
        case 'X':
          handlers.onSuspend();
          break;
        case 'z':
        case 'Z':
          handlers.onUndo();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, handlers]);
}

/** 阻止浏览器默认行为：空格滚动页面、回车触发默认按钮、方向键横向滚动 */
function preventDefaultForKey(e: KeyboardEvent): void {
  if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') e.preventDefault();
}
