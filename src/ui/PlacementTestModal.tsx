import { useEffect, useState } from 'react';
import type { PlacementWord } from '../app/placement';
import { ModalShell } from './ModalShell';
import { Button, ProgressBar } from './primitives';

/** 入门水平测试（M-08）：快速自评已认识的词，避免从最基础的词开始背。
 * 判定「认识」的词会被标为已掌握（暂停调度），可在词库页恢复。 */

export interface PlacementTestModalProps {
  open: boolean;
  words: PlacementWord[];
  onClose: () => void;
  onFinish: (knownWordIds: string[]) => Promise<void>;
}

export function PlacementTestModal({ open, words, onClose, onFinish }: PlacementTestModalProps) {
  const [index, setIndex] = useState(0);
  const [known, setKnown] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setKnown([]);
    setSaving(false);
  }, [open]);

  const done = index >= words.length;
  const current = words[index];

  function answer(isKnown: boolean) {
    if (!current) return;
    if (isKnown) setKnown((prev) => [...prev, current.wordId]);
    setIndex((i) => i + 1);
  }

  return (
    <ModalShell
      open={open}
      title="入门水平测试"
      titleId="placement-title"
      onClose={onClose}
      widthClass="sm:max-w-120"
      footer={
        done ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void (async () => { setSaving(true); try { await onFinish(known); } finally { setSaving(false); } })()}>
              完成，开始学习
            </Button>
          </>
        ) : (
          <Button variant="ghost" onClick={onClose}>
            稍后再测
          </Button>
        )
      }
    >
      {words.length === 0 ? (
        <p className="py-6 text-center text-md text-muted">当前没有可测试的新卡。</p>
      ) : done ? (
        <div className="flex flex-col gap-3 py-2 text-center">
          <p className="text-md font-emphasize text-fg">
            已认识 {known.length} / {words.length} 个词
          </p>
          <p className="text-sm leading-body text-muted">
            这些词会被标为「已掌握」并暂停调度，可在词库页的「已斩」里恢复。其余词仍按估计权重顺序进入新卡队列。
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>第 {index + 1} / {words.length} 题</span>
              <span>认识 {known.length} 个</span>
            </div>
            <ProgressBar value={index} max={words.length} label={`第 ${index + 1} 题，共 ${words.length} 题`} />
          </div>

          <div className="flex flex-col items-center gap-2 py-4" aria-live="polite">
            <span className="font-word text-3xl font-emphasize text-fg">{current?.lemma}</span>
            {current?.phonetic ? <span className="font-word text-sm text-muted">/{current.phonetic}/</span> : null}
            <span className="text-sm text-fg-2">{current?.cn}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => answer(false)}>
              不认识
            </Button>
            <Button variant="primary" onClick={() => answer(true)}>
              认识
            </Button>
          </div>
          <p className="text-center text-2xs text-meta">凭第一反应判断即可，结果只影响新卡起点。</p>
        </>
      )}
    </ModalShell>
  );
}
