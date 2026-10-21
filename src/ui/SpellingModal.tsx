import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluateSpelling, nextHint } from '../domain/spelling';
import { ModalShell } from './ModalShell';
import { Button } from './primitives';
import { ICON_SIZE, ICON_STROKE, Volume2 } from './icons';
import { speak } from './speech';

/** 拼写练习（PRD 5.7 / S-01）：逐字母校验、Tab 提示、不影响识记卡调度。 */

export interface SpellingAttemptResult {
  typed: string;
  correct: boolean;
  hintsUsed: number;
}

export interface SpellingModalProps {
  open: boolean;
  lemma: string;
  phonetic: string;
  pos: string;
  cn: string;
  accent: 'uk' | 'us';
  onClose: () => void;
  onAttempt: (result: SpellingAttemptResult) => void;
}

export function SpellingModal({ open, lemma, phonetic, pos, cn, accent, onClose, onAttempt }: SpellingModalProps) {
  const [typed, setTyped] = useState('');
  const [hintsUsed, setHintsUsed] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 每次打开重置，避免上一個词的输入残留
  useEffect(() => {
    if (!open) return;
    setTyped('');
    setHintsUsed(0);
    setSubmitted(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(timer);
  }, [open, lemma]);

  const evaluation = useMemo(() => evaluateSpelling(lemma, typed), [lemma, typed]);
  const tried = typed.trim().length > 0;

  function submit() {
    if (!tried) return;
    const correct = evaluation.correct;
    setSubmitted(true);
    onAttempt({ typed: typed.trim(), correct, hintsUsed });
    if (!correct) inputRef.current?.select();
  }

  function hint() {
    setTyped(nextHint(lemma, typed));
    setHintsUsed((n) => n + 1);
    inputRef.current?.focus();
  }

  return (
    <ModalShell
      open={open}
      title="拼写练习"
      titleId="spell-title"
      onClose={onClose}
      widthClass="sm:max-w-120"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" disabled={!tried} onClick={submit}>
            提交（Enter）
          </Button>
        </>
      }
    >
      <p className="text-xs leading-snug text-muted">
        根据释义拼出单词。提示（Tab）后拼对记为「提示后正确」，练习结果不影响识记卡调度。
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-md font-emphasize text-fg">
          {pos} {cn}
        </span>
        {phonetic ? <span className="font-word text-sm text-muted">/{phonetic}/</span> : null}
        <button
          type="button"
          onClick={() => speak(lemma, accent)}
          aria-label="播放发音"
          title="播放发音"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-warm hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Volume2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>

      <div className="flex min-h-14 flex-wrap items-end justify-center gap-1 rounded-md bg-warm px-3 py-3" aria-live="polite">
        {evaluation.slots.map((slot, i) => (
          <span
            key={i}
            className={`inline-flex h-10 w-7 items-center justify-center border-b-2 font-word text-xl ${
              slot.state === 'ok' ? 'border-success text-success' : slot.state === 'bad' ? 'border-danger text-danger' : 'border-line-strong text-meta'
            }`}
          >
            {slot.typed}
          </span>
        ))}
        {evaluation.extra > 0 ? <span className="font-word text-sm text-danger">+{evaluation.extra}</span> : null}
      </div>

      <input
        ref={inputRef}
        value={typed}
        onChange={(e) => {
          setTyped(e.target.value);
          setSubmitted(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Tab') {
            e.preventDefault();
            hint();
          }
        }}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label="输入拼写"
        placeholder="输入拼写，Enter 提交，Tab 提示"
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-center font-word text-lg text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />

      <p className={`min-h-5 text-center text-xs ${evaluation.correct && submitted ? 'text-success' : 'text-danger'}`} role="status">
        {submitted
          ? evaluation.correct
            ? hintsUsed > 0
              ? '提示后正确（已记入练习日志）'
              : '完全正确（已记入练习日志）'
            : `不正确，正确拼写：${lemma}`
          : ''}
      </p>
    </ModalShell>
  );
}
