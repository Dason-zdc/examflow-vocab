import { useEffect, useState } from 'react';
import type { ExamTip } from '../app/examTip';
import { Button } from './primitives';

/** 背面知识块的聚合出口：易混词 / 同义替换各自独立成文件，这里只留考点与笔记。 */

export { ConfusableBlock } from './ConfusableBlock';
export { IeltsRewriteBlock } from './SynonymBlock';

export function ExamTipBlock({
  tip,
  note,
  onSave,
}: {
  tip: ExamTip | null;
  note: string;
  onSave: (note: string) => void;
}) {
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
        <div className="mt-2 whitespace-pre-line rounded-lg border border-line bg-sunken p-2.5 text-sm text-fg-2">
          <strong className="mr-1 text-fg">[我的笔记]</strong>
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
