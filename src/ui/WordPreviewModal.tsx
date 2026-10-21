import { useEffect, useRef } from 'react';
import type { ExamCode } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import { Button, IconButton, ProgressBar } from './primitives';
import { ICON_SIZE, ICON_STROKE, X } from './icons';
import { weightLabel } from './format';

/** 形近词词条弹窗（PRD AC-05.2）：Esc / scrim 关闭 + 焦点陷阱。
 * 生词本为 P1（S-02），入口直接隐藏，不做不可用态。
 * word 为 null（词库未收录该词形）时展示兜底文案，弹窗照常可关。 */

export interface WordPreviewModalProps {
  /** 要预览的词形；为 null 时不渲染 */
  lemma: string | null;
  /** 词典查询结果；null = 词库未收录 */
  word: PackWord | null;
  exam: ExamCode;
  onClose: () => void;
}

export function WordPreviewModal({ lemma, word, exam, onClose }: WordPreviewModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // 打开时把焦点移入弹窗（无内部输入框，聚焦对话框容器本身）
  useEffect(() => {
    if (!lemma) return;
    const t = window.setTimeout(() => dialogRef.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [lemma]);

  // 焦点陷阱：Tab / Shift+Tab 循环限定在弹窗内；Esc 关闭
  useEffect(() => {
    if (!lemma) return;
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
  }, [lemma, onClose]);

  if (!lemma) return null;

  return (
    <div className="fixed inset-0 z-modal flex items-end justify-center sm:items-center" role="presentation">
      <div className="absolute inset-0" aria-hidden onClick={onClose} style={{ background: 'var(--modal-scrim)' }} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-preview-title"
        tabIndex={-1}
        className="relative flex max-h-[92dvh] w-full max-w-container flex-col overflow-y-auto rounded-t-xl bg-surface shadow-overlay focus:outline-none sm:max-w-160 sm:rounded-xl"
      >
        <header className="flex items-center justify-between border-b border-line-soft px-4 py-3">
          <h2 id="word-preview-title" className="font-word text-lg font-emphasize text-fg">
            {word?.lemma ?? lemma}
          </h2>
          <IconButton label="关闭词条" onClick={onClose}>
            <X size={ICON_SIZE.standalone} strokeWidth={ICON_STROKE} aria-hidden />
          </IconButton>
        </header>

        <div className="flex flex-col gap-3 px-4 py-4">
          {word ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-word text-2xl font-emphasize text-fg">{word.lemma}</span>
                {word.phoneticUk || word.phoneticUs ? (
                  <span className="font-word text-sm text-muted">/{word.phoneticUk || word.phoneticUs}/</span>
                ) : null}
              </div>
              <ul className="flex flex-col gap-3">
                {word.senses.map((s) => {
                  const stat = s.examStats[exam];
                  return (
                    <li key={s.id} className="flex flex-col gap-1 border-t border-line-soft pt-3 first:border-t-0 first:pt-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-word text-sm text-muted">{s.pos}</span>
                        <span className="text-md font-emphasize text-fg">{s.cn}</span>
                        {stat ? (
                          <span className="ml-auto flex items-center gap-2">
                            <span className="font-word text-2xs text-meta tabular-nums">{weightLabel(stat.senseWeight)}</span>
                            <ProgressBar value={stat.senseWeight} max={100} label={`${weightLabel(stat.senseWeight)}，满分 100`} />
                          </span>
                        ) : null}
                      </div>
                      {s.enDef ? <p className="text-sm leading-body text-muted">{s.enDef}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="py-6 text-center text-md text-muted">词库未收录</p>
          )}
        </div>

        <footer className="flex justify-end border-t border-line-soft px-4 py-3">
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </footer>
      </div>
    </div>
  );
}
