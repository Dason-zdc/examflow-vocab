import { useEffect, useState } from 'react';
import type { Confusable, Etymology, Synonym } from '../domain/types';
import type { MorphologySplit } from '../content/morphology';
import type { ExamTip } from '../app/examTip';
import { Badge, Button, Kbd } from './primitives';

/** 背面知识区块：词根、形近词 + 同义替换、考点与笔记（对齐原型的信息层级）。 */

export function EtymologyBlock({
  etymology,
  auto,
  forms,
  open,
  onToggle,
}: {
  etymology?: Etymology;
  auto: MorphologySplit | null;
  forms: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const formula =
    etymology?.formula ?? auto?.formula ?? (forms.length > 0 ? `词形变化：${forms.join(' / ')}` : '暂未收录词根拆解');
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-sm bg-accent-soft px-2 py-0.5 text-2xs font-emphasize text-accent-soft-fg">词根</span>
          <span className="text-sm font-emphasize text-fg">{formula}</span>
          {!etymology && auto ? <Badge tone="warn">自动拆分</Badge> : null}
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? '收起' : '展开'} <Kbd>R</Kbd>
        </button>
      </header>
      {open ? (
        <div className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3 text-sm text-muted">
          {etymology?.origin ? <p>{etymology.origin}</p> : auto ? <p>{auto.origin}</p> : null}
          {etymology && etymology.derivatives.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {etymology.derivatives.map((d) => (
                <span key={`${d.lemma}-${d.pos}`} className="rounded-lg bg-warm px-2 py-1 text-xs">
                  <strong className="font-word text-fg-2">{d.lemma}</strong>
                  <span className="ml-1 text-meta">{d.pos}</span>
                  <span className="ml-1">{d.cn}</span>
                </span>
              ))}
            </div>
          ) : null}
          {forms.length > 0 ? <p className="text-xs text-meta">词形变化：{forms.join(' / ')}</p> : null}
          {!etymology && !auto ? <p className="text-xs text-warning">该词暂未收录人工词根，也没有可靠的前后缀拆分。</p> : null}
        </div>
      ) : null}
    </section>
  );
}

export function NetworkBlock({
  confusables,
  synonyms,
  open,
  onToggle,
  onOpenWord,
}: {
  confusables: Confusable[];
  synonyms: Synonym[];
  open: boolean;
  onToggle: () => void;
  onOpenWord: (lemma: string) => void;
}) {
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-emphasize text-fg">形近词对比 · 同义替换</span>
          <Badge tone="neutral">{confusables.length} 形近</Badge>
          <Badge tone="neutral">{synonyms.length} 同义</Badge>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="text-xs text-muted transition-colors duration-150 hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {open ? '收起' : '展开'} <Kbd>F</Kbd>
        </button>
      </header>
      {open ? (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-line-soft pt-3 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <h4 className="text-2xs font-emphasize text-meta">形近词（防混淆）</h4>
            {confusables.length === 0 ? (
              <span className="text-xs text-meta">该词暂无高危形近词</span>
            ) : (
              confusables.map((c) => (
                <div key={c.lemma} className="rounded-lg border border-warning-soft bg-warning-soft p-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onOpenWord(c.lemma)}
                    className="font-word font-emphasize text-fg underline decoration-dotted underline-offset-2 hover:text-accent-soft-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    {c.lemma}
                  </button>
                  {c.phonetic ? <span className="ml-1 font-word text-meta">{c.phonetic}</span> : null}
                  <div className="mt-0.5 text-warning">{c.tip}</div>
                </div>
              ))
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <h4 className="text-2xs font-emphasize text-meta">同义替换（WordNet）</h4>
            {synonyms.length === 0 ? (
              <span className="text-xs text-meta">该词暂无同义替换数据</span>
            ) : (
              <div className="flex flex-wrap content-start gap-1.5">
                {synonyms.map((s) => (
                  <button
                    key={`${s.lemma}-${s.pos}`}
                    type="button"
                    onClick={() => onOpenWord(s.lemma)}
                    className="rounded-lg border border-line bg-warm px-2 py-1 text-xs transition-colors duration-150 hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <strong className="font-word text-fg-2">{s.lemma}</strong>
                    <span className="ml-1 text-meta">{s.pos}</span>
                    {s.cn ? <span className="ml-1 text-muted">{s.cn}</span> : null}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-auto text-2xs text-meta">自动匹配的近义词，义项可能不完全对应，仅作替换参考。</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function ExamTipBlock({ tip, note, onSave }: { tip: ExamTip | null; note: string; onSave: (note: string) => void }) {
  const [draft, setDraft] = useState(note);
  const [editing, setEditing] = useState(false);
  useEffect(() => setDraft(note), [note]);

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-emphasize text-fg">考点与笔记</h3>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs text-accent transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {note ? '编辑我的笔记' : '添加笔记'}
          </button>
        ) : null}
      </div>

      {tip ? (
        <div className="mt-2 rounded-lg bg-accent-soft p-2.5 text-sm leading-body text-fg-2">
          <strong className="mr-1 text-accent-soft-fg">[考点]</strong>
          <span className="whitespace-pre-line">{tip.body}</span>
        </div>
      ) : null}

      {note && !editing ? (
        <div className="mt-2 whitespace-pre-line rounded-lg border border-warning-soft bg-warning-soft p-2.5 text-sm text-warning">
          <strong className="mr-1">[我的笔记]</strong>
          {note}
        </div>
      ) : null}

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            aria-label="笔记"
            placeholder="写下你的助记或易错点"
            className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDraft(note);
                setEditing(false);
              }}
            >
              取消
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onSave(draft);
                setEditing(false);
              }}
            >
              保存
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
