import type { Confusable, Etymology } from '../domain/types';
import { ICON_SIZE, ICON_STROKE, ChevronDown, ChevronUp, Network, Sprout } from './icons';

/** 学习卡背面可折叠区块（UIUX P1）：词根（R 键）/ 形近词（F 键）。
 * 折叠态由 StudyView 持有（换卡重置、快捷键驱动），本文件只做受控渲染；
 * 形近词列表项为按钮，点击上抛 onOpenWord 打开词条弹窗（PRD AC-05.2）。 */

export interface EtymologyBlockProps {
  etymology: Etymology;
  open: boolean;
  onToggle: () => void;
}

export function EtymologyBlock({ etymology, open, onToggle }: EtymologyBlockProps) {
  return (
    <section className="border-t border-line-soft pt-3" aria-label="词根">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 text-sm font-emphasize text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Sprout size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
        词根
        {open ? (
          <ChevronUp size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="ml-auto" />
        ) : (
          <ChevronDown size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="ml-auto" />
        )}
      </button>
      {open ? (
        <div className="flex flex-col gap-1 pb-2">
          <p className="font-word text-sm text-fg-2">{etymology.formula}</p>
          <p className="text-sm leading-body text-muted">{etymology.origin}</p>
          {etymology.derivatives.length > 0 ? (
            <ul className="flex flex-wrap gap-x-4 gap-y-1">
              {etymology.derivatives.map((d) => (
                <li key={d.lemma} className="text-sm text-muted">
                  <span className="font-word text-fg-2">{d.lemma}</span> {d.pos} {d.cn}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export interface ConfusableBlockProps {
  confusables: Confusable[];
  open: boolean;
  onToggle: () => void;
  /** 点击某个形近词：上抛 lemma，由 StudyView 查词典并打开词条弹窗 */
  onOpenWord: (lemma: string) => void;
}

export function ConfusableBlock({ confusables, open, onToggle, onOpenWord }: ConfusableBlockProps) {
  return (
    <section className="border-t border-line-soft pt-3" aria-label="形近词">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex min-h-11 w-full items-center gap-2 text-sm font-emphasize text-fg-2 transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <Network size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
        形近词
        {open ? (
          <ChevronUp size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="ml-auto" />
        ) : (
          <ChevronDown size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="ml-auto" />
        )}
      </button>
      {open ? (
        <ul className="flex flex-col gap-2 pb-2">
          {confusables.map((c) => (
            <li key={c.lemma}>
              <button
                type="button"
                onClick={() => onOpenWord(c.lemma)}
                className="flex min-h-11 w-full flex-col gap-0.5 rounded-md px-2 py-1 text-left transition-colors duration-150 hover:bg-warm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-sm text-fg-2">
                  <span className="font-word font-emphasize">{c.lemma}</span>
                  {c.phonetic ? <span className="ml-2 font-word text-xs text-muted">/{c.phonetic}/</span> : null}
                  <span className="ml-2 text-2xs text-meta">{c.reason}</span>
                </span>
                <span className="text-sm leading-body text-muted">{c.tip}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
