import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { ICON_SIZE, ICON_STROKE, Loader2 } from './icons';

/** UI 基础组件。颜色/圆角/间距一律走 design token，不出现硬编码值（门禁 3）。 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-active',
  secondary: 'border border-line-strong bg-surface text-fg-2 hover:bg-warm hover:text-fg',
  ghost: 'bg-transparent text-muted hover:bg-warm hover:text-fg-2',
  danger: 'bg-transparent text-danger border border-line-strong hover:bg-danger-soft',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'secondary', loading, block, children, className = '', disabled, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={[
        // 内边距/字号/字重走 button token（--button-padding-x/y、--button-font-size/weight）
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2.5',
        'text-base font-emphasize leading-tight',
        'min-h-11 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        VARIANT_CLASS[variant],
        block ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading ? <Loader2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/** 独立图标按钮（头部设置 / 关闭弹窗）：44px 触摸目标 */
export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, children, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={[
        'inline-flex h-11 w-11 items-center justify-center rounded-md text-muted',
        'transition-colors duration-150 hover:bg-warm hover:text-fg-2',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
  );
}

/** 面板容器（对齐原型：白卡片 + 16px 圆角 + 极轻阴影） */
export function Panel({ title, caption, children, className = '' }: { title?: string; caption?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface shadow-raised ${className}`}>
      {title ? (
        <header className="flex items-baseline justify-between gap-2 border-b border-line-soft px-4 py-3">
          <h2 className="text-sm font-emphasize text-fg">{title}</h2>
          {caption ? <span className="text-xs text-meta">{caption}</span> : null}
        </header>
      ) : null}
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warn' | 'danger';

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-warm text-muted',
  accent: 'bg-accent-soft text-accent-soft-fg',
  info: 'bg-info-soft text-info',
  success: 'bg-success-soft text-success',
  warn: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
};

/** 徽章：无边框无阴影（UIUX §2.4） */
export function Badge({ tone = 'neutral', children }: { tone?: BadgeTone; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-xs font-emphasize ${BADGE_TONE[tone]}`}>{children}</span>;
}

/** 进度条：必须配数字（颜色不独立承载信息，UIUX §2.4） */
export function ProgressBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuetext={label}
      className="h-1.5 w-full overflow-hidden rounded-pill bg-line"
    >
      <div className="h-full rounded-pill bg-accent transition-[width] duration-150" style={{ width: `${pct}%` }} />
    </div>
  );
}

/** 键帽（UIUX P10）：等宽 11px，surface-warm 底，1px 边框 + 2px 下边框 */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex min-w-6 items-center justify-center rounded-sm border border-line border-b-2 bg-warm px-1.5 py-0.5 font-word text-2xs text-fg-2">
      {children}
    </kbd>
  );
}

/** 提示行（role=status，不用 assertive，UIUX P2） */
export function Notice({ tone, icon, children }: { tone: 'warn' | 'danger' | 'info' | 'plain'; icon?: ReactNode; children: ReactNode }) {
  const toneClass =
    tone === 'warn'
      ? 'bg-warning-soft text-warning'
      : tone === 'danger'
        ? 'bg-danger-soft text-danger'
        : tone === 'info'
          ? 'bg-info-soft text-info'
          : 'text-meta';
  return (
    <p role="status" className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs leading-snug ${toneClass}`}>
      {icon}
      <span>{children}</span>
    </p>
  );
}

/** 统计块（计划面板 2 列网格用） */
export function StatBlock({ label, value, caption }: { label: string; value: ReactNode; caption?: ReactNode }) {
  return (
    <div className="rounded-xl bg-warm px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="font-word text-lg text-fg tabular-nums">{value}</div>
      {caption ? <div className="text-2xs text-meta">{caption}</div> : null}
    </div>
  );
}
