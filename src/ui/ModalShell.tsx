import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './primitives';
import { ICON_SIZE, ICON_STROKE, X } from './icons';

/**
 * 通用弹窗外壳：遮罩 + 对话框 + 焦点陷阱 + Esc 关闭。
 * 新弹窗（拼写 / 点词即查 / 仪表盘 / 入门测试）复用它，避免每处重写焦点逻辑。
 */
export interface ModalShellProps {
  open: boolean;
  title: string;
  titleId: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** 默认 sm:max-w-160；宽内容可传更大 */
  widthClass?: string;
}

export function ModalShell({ open, title, titleId, onClose, children, footer, widthClass = 'sm:max-w-160' }: ModalShellProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])');
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0" aria-hidden onClick={onClose} style={{ background: 'var(--modal-scrim)' }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full max-w-container flex-col overflow-y-auto rounded-t-xl bg-surface shadow-overlay focus:outline-none sm:rounded-xl ${widthClass}`}
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 id={titleId} className="text-lg font-emphasize text-fg">
            {title}
          </h2>
          <IconButton label="关闭弹窗" onClick={onClose}>
            <X size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>
        </header>
        <div className="flex flex-col gap-3 px-4 py-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}
