import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../domain/types';
import type { SyncController } from '../app/sync/useSync';
import { Button, IconButton } from './primitives';
import { ICON_SIZE, ICON_STROKE, Loader2, X } from './icons';
import { SyncSettingsPanel } from './SyncSettingsPanel';

/** 设置弹窗（UIUX P4）：焦点陷阱 + Esc 关闭 + 字段校验 */

export interface SettingsModalProps {
  open: boolean;
  settings: Settings;
  saving: boolean;
  sync: SyncController;
  onClose: () => void;
  onSave: (next: Settings) => Promise<void>;
}

interface Draft {
  examDate: string;
  maxNewPerDay: string;
  maxReviewPerDay: string;
  dayStartHour: string;
  accent: 'uk' | 'us';
  excludeBasicWords: boolean;
  autoPlayAudio: boolean;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDraft(s: Settings): Draft {
  return {
    examDate: s.examDate,
    maxNewPerDay: String(s.maxNewPerDay),
    maxReviewPerDay: String(s.maxReviewPerDay),
    dayStartHour: String(s.dayStartHour),
    accent: s.accent,
    excludeBasicWords: s.excludeBasicWords,
    autoPlayAudio: s.autoPlayAudio,
    aiBaseUrl: s.aiBaseUrl ?? '',
    aiApiKey: s.aiApiKey ?? '',
    aiModel: s.aiModel ?? '',
  };
}

function validate(d: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.examDate)) errors.examDate = '请按 YYYY-MM-DD 格式填写。';
  else if (d.examDate <= today()) errors.examDate = '考试日期必须晚于今天。';
  const nNew = Number(d.maxNewPerDay);
  if (!Number.isInteger(nNew) || nNew < 1 || nNew > 500) errors.maxNewPerDay = '每日新卡上限需在 1 到 500 之间。';
  const nRev = Number(d.maxReviewPerDay);
  if (!Number.isInteger(nRev) || nRev < 10 || nRev > 2000) errors.maxReviewPerDay = '每日复习上限需在 10 到 2000 之间。';
  const nDay = Number(d.dayStartHour);
  if (!Number.isInteger(nDay) || nDay < 0 || nDay > 12) errors.dayStartHour = '日切时间需在 0 到 12 之间。';
  const aiFilled = [d.aiBaseUrl, d.aiApiKey, d.aiModel].filter((v) => v.trim().length > 0).length;
  if (aiFilled > 0 && aiFilled < 3) errors.aiBaseUrl = 'Base URL、Key、模型名需同时填写或全部留空。';
  else if (d.aiBaseUrl.trim() && !/^https?:\/\//i.test(d.aiBaseUrl.trim())) errors.aiBaseUrl = 'Base URL 需以 http:// 或 https:// 开头。';
  return errors;
}

export function SettingsModal({ open, settings, saving, sync, onClose, onSave }: SettingsModalProps) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(settings));
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({});
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setDraft(toDraft(settings));
      setErrors({});
      // 打开时聚焦第一个可聚焦元素（考试日期）
      const t = window.setTimeout(() => firstFieldRef.current?.focus(), 30);
      return () => window.clearTimeout(t);
    }
  }, [open, settings]);

  // 焦点陷阱：Tab / Shift+Tab 循环限定在弹窗内；Esc 关闭
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
      const focusable = root.querySelectorAll<HTMLElement>('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
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

  async function submit() {
    const errs = validate(draft);
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    await onSave({
      ...settings,
      examDate: draft.examDate,
      maxNewPerDay: Number(draft.maxNewPerDay),
      maxReviewPerDay: Number(draft.maxReviewPerDay),
      dayStartHour: Number(draft.dayStartHour),
      accent: draft.accent,
      excludeBasicWords: draft.excludeBasicWords,
      autoPlayAudio: draft.autoPlayAudio,
      aiBaseUrl: draft.aiBaseUrl.trim().replace(/\/+$/, ''),
      aiApiKey: draft.aiApiKey.trim(),
      aiModel: draft.aiModel.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0" aria-hidden onClick={onClose} style={{ background: 'var(--modal-scrim)' }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative flex max-h-[92dvh] w-full max-w-container flex-col overflow-y-auto rounded-t-xl bg-surface shadow-overlay sm:max-w-160 sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 id="settings-title" className="text-lg font-emphasize text-fg">
            学习计划与设置
          </h2>
          <IconButton label="关闭设置" onClick={onClose}>
            <X size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>
        </header>

        <div className="grid grid-cols-1 gap-4 px-4 py-4 sm:grid-cols-2">
          <Field label="考试日期" error={errors.examDate} className="sm:col-span-2">
            <input
              ref={firstFieldRef}
              id="exam-date"
              type="date"
              value={draft.examDate}
              onChange={(e) => setDraft({ ...draft, examDate: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>
          <Field label="每日新卡上限" error={errors.maxNewPerDay}>
            <input
              id="max-new"
              type="number"
              min={1}
              max={500}
              value={draft.maxNewPerDay}
              onChange={(e) => setDraft({ ...draft, maxNewPerDay: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base font-word text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>
          <Field label="每日复习上限" error={errors.maxReviewPerDay}>
            <input
              id="max-review"
              type="number"
              min={10}
              max={2000}
              value={draft.maxReviewPerDay}
              onChange={(e) => setDraft({ ...draft, maxReviewPerDay: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base font-word text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>
          <Field label="日切时间（点）" error={errors.dayStartHour}>
            <input
              id="day-start"
              type="number"
              min={0}
              max={12}
              value={draft.dayStartHour}
              onChange={(e) => setDraft({ ...draft, dayStartHour: e.target.value })}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base font-word text-fg tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          </Field>
          <Field label="默认口音">
            <select
              id="accent"
              value={draft.accent}
              onChange={(e) => setDraft({ ...draft, accent: e.target.value as 'uk' | 'us' })}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <option value="uk">英音</option>
              <option value="us">美音</option>
            </select>
          </Field>
          <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.excludeBasicWords}
              onChange={(e) => setDraft({ ...draft, excludeBasicWords: e.target.checked })}
              className="h-4 w-4 rounded border-line-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            排除基础词（高考及以下词汇）
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm text-fg-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={draft.autoPlayAudio}
              onChange={(e) => setDraft({ ...draft, autoPlayAudio: e.target.checked })}
              className="h-4 w-4 rounded border-line-strong text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            出新卡时自动播放发音
          </label>

          <div className="flex flex-col gap-2 border-t border-line-soft pt-3 sm:col-span-2">
            <h3 className="text-sm font-emphasize text-fg-2">AI 私教（P1，可选）</h3>
            <p className="text-xs leading-snug text-muted">
              浏览器直连 OpenAI 兼容接口（DeepSeek / OpenAI / 硅基流动等）。Key 只保存在本机，不会进入备份文件；部分服务商不支持浏览器跨域调用。
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="Base URL" error={errors.aiBaseUrl}>
                <input
                  value={draft.aiBaseUrl}
                  onChange={(e) => setDraft({ ...draft, aiBaseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1"
                  aria-label="AI Base URL"
                  spellCheck={false}
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-word text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </Field>
              <Field label="API Key">
                <input
                  type="password"
                  value={draft.aiApiKey}
                  onChange={(e) => setDraft({ ...draft, aiApiKey: e.target.value })}
                  placeholder="sk-..."
                  aria-label="AI API Key"
                  autoComplete="off"
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-word text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </Field>
              <Field label="模型名">
                <input
                  value={draft.aiModel}
                  onChange={(e) => setDraft({ ...draft, aiModel: e.target.value })}
                  placeholder="deepseek-chat"
                  aria-label="AI 模型名"
                  spellCheck={false}
                  className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 font-word text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="border-t border-line-soft px-4 py-4">
          <SyncSettingsPanel sync={sync} />
        </div>

        <footer className="flex justify-end gap-2 border-t border-line-soft px-4 py-3">
          <Button variant="ghost" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" loading={saving} onClick={() => void submit()}>
            {saving ? <Loader2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden /> : null}
            保存
          </Button>
        </footer>
      </div>
    </div>
  );
}

function Field({ label, error, className = '', children }: { label: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <span className="text-sm font-emphasize text-fg-2">{label}</span>
      {children}
      {error ? (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      ) : null}
    </div>
  );
}
