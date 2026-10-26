import { useEffect, useState } from 'react';
import type { ExamCode, Settings } from '../domain/types';
import type { ViewKey } from './useExamFlow';
import { IconButton } from './primitives';
import { BookOpen, ICON_SIZE, ICON_STROKE, Languages, LayoutDashboard, Menu, Network, Search, Settings as SettingsIcon, Sprout } from './icons';
import { daysToExamLabel } from './format';

/** 全局外壳（UIUX §7.0）：Header + 本轮进度条 + 主导航 */

export interface AppHeaderProps {
  settings: Settings;
  /** 未设置考试日期时为 null（此时 Header 只显示引导，不渲染倒计时天数） */
  daysToExam: number | null;
  progress: { done: number; total: number } | null;
  view: ViewKey;
  /** 已发布数据包的考试（只有这些能切换） */
  exams: ExamCode[];
  searchQuery: string;
  onSearch: (q: string) => void;
  onView: (v: ViewKey) => void;
  onSwitchExam: (exam: ExamCode) => void;
  onOpenSettings: () => void;
  onOpenDashboard: () => void;
}

const EXAM_LABEL: Record<ExamCode, string> = {
  KAOYAN: '考研',
  CET4: 'CET-4',
  CET6: 'CET-6',
  IELTS: '雅思',
  TOEFL: '托福',
};

const VIEW_LABEL: Record<ViewKey, string> = { study: '学习', vocab: '词库', dict: '词典', roots: '词根' };

export function AppHeader({
  settings,
  daysToExam,
  progress,
  view,
  exams,
  searchQuery,
  onSearch,
  onView,
  onSwitchExam,
  onOpenSettings,
  onOpenDashboard,
}: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <>
      <header className="sticky top-0 z-header border-b border-line bg-surface backdrop-blur" style={{ height: 56 }}>
        <div className="mx-auto flex h-full max-w-container items-center gap-3 px-3 md:px-6">
          <span className="flex items-center gap-2" aria-label="ExamFlow Vocab">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-announce text-on-accent" aria-hidden>
              E
            </span>
            <span className="hidden text-sm font-emphasize text-fg sm:inline">ExamFlow Vocab</span>
          </span>

          <label className="flex items-center gap-1 text-xs text-muted">
            <span className="sr-only">选择考试</span>
            <select
              value={settings.exam}
              onChange={(e) => onSwitchExam(e.target.value as ExamCode)}
              aria-label="选择考试"
              className="min-h-11 rounded-md border border-line-strong bg-surface px-2 text-sm text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {exams.map((code) => (
                <option key={code} value={code}>
                  {EXAM_LABEL[code]}
                </option>
              ))}
            </select>
          </label>

          <IconButton
            label="切换页面"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-controls="mobile-view-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className="md:hidden"
          >
            <Menu size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>

          <form
            className="relative hidden flex-1 sm:block"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              onView('vocab');
            }}
          >
            <Search size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="搜索词库"
              aria-label="搜索词库"
              className="h-9 w-full max-w-44 rounded-md border border-line-strong bg-surface pl-7 pr-2 text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </form>

          <nav aria-label="主导航" className="ml-auto hidden items-center gap-1 md:flex">
            {(Object.keys(VIEW_LABEL) as ViewKey[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-current={view === v ? 'page' : undefined}
                onClick={() => onView(v)}
                className={`flex min-h-11 items-center gap-1 rounded-md px-2 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  view === v ? 'bg-accent-soft text-accent-soft-fg' : 'text-muted hover:bg-warm hover:text-fg-2'
                }`}
              >
                {v === 'vocab' ? <BookOpen size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {v === 'dict' ? <Languages size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {v === 'roots' ? <Network size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {VIEW_LABEL[v]}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={onOpenSettings}
            className="min-h-11 rounded-md bg-warning-soft px-2 text-xs font-emphasize text-warning transition-colors duration-150 hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {daysToExamLabel(daysToExam)}
          </button>

          <IconButton label="学习仪表盘" onClick={onOpenDashboard} className="hidden sm:inline-flex">
            <LayoutDashboard size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>

          <IconButton label="设置" onClick={onOpenSettings}>
            <SettingsIcon size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>
        </div>
      </header>

      {menuOpen ? (
        <>
          <div
            role="presentation"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-scrim md:hidden"
          />
          <nav
            id="mobile-view-menu"
            aria-label="页面切换"
            className="fixed right-3 top-14 z-modal w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-overlay md:hidden"
          >
            {(Object.keys(VIEW_LABEL) as ViewKey[]).map((v) => (
              <button
                key={v}
                type="button"
                autoFocus={view === v}
                aria-current={view === v ? 'page' : undefined}
                onClick={() => {
                  onView(v);
                  setMenuOpen(false);
                }}
                className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  view === v ? 'bg-accent-soft text-accent-soft-fg' : 'text-fg-2 hover:bg-warm'
                }`}
              >
                {v === 'study' ? <Sprout size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {v === 'vocab' ? <BookOpen size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {v === 'dict' ? <Languages size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {v === 'roots' ? <Network size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden /> : null}
                {VIEW_LABEL[v]}
              </button>
            ))}
          </nav>
        </>
      ) : null}


      {/* 本轮进度条（UIUX §5.3：学习页强调色第 2 处） */}
      <div className="sticky top-14 z-header h-1 w-full bg-line" role="presentation">
        {progress && progress.total > 0 ? (
          <div
            className="h-full bg-accent transition-[width] duration-150"
            style={{ width: `${Math.min(100, Math.round((progress.done / progress.total) * 100))}%` }}
          />
        ) : null}
      </div>
    </>
  );
}
