import { useEffect, useState } from 'react';
import type { ExamCode } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import { ModalShell } from './ModalShell';
import { Button, ProgressBar } from './primitives';
import { ICON_SIZE, ICON_STROKE, Volume2 } from './icons';
import { weightLabel } from './format';

/** 点词即查（PRD 5.8 / S-02）：例句里点任意单词 → 词条摘要 → 加入生词本。
 * 词库未收录时允许创建自定义词条（含来源例句），加入后生成新卡。 */

export interface LookupModalProps {
  open: boolean;
  surface: string;
  word: PackWord | null;
  exam: ExamCode;
  starred: boolean;
  sourceSentence?: string;
  onClose: () => void;
  onPlay: () => void;
  onAdd: (cn: string) => Promise<void>;
}

export function LookupModal({ open, surface, word, exam, starred, sourceSentence, onClose, onPlay, onAdd }: LookupModalProps) {
  const [cnDraft, setCnDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCnDraft('');
    setAdding(false);
    setAdded(starred);
    setError(null);
  }, [open, surface, starred]);

  async function submit() {
    setAdding(true);
    setError(null);
    try {
      await onAdd(cnDraft.trim());
      setAdded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  return (
    <ModalShell
      open={open}
      title="点词即查"
      titleId="lookup-title"
      onClose={onClose}
      widthClass="sm:max-w-120"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            关闭
          </Button>
          <Button variant="primary" loading={adding} disabled={added} onClick={() => void submit()}>
            {added ? '已在生词本' : '加入生词本'}
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-word text-2xl font-emphasize text-fg">{word?.lemma ?? surface}</span>
        {word?.phoneticUk || word?.phoneticUs ? (
          <span className="font-word text-sm text-muted">/{word.phoneticUk || word.phoneticUs}/</span>
        ) : null}
        <button
          type="button"
          onClick={onPlay}
          aria-label="播放发音"
          title="播放发音"
          className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-md text-muted transition-colors duration-150 hover:bg-warm hover:text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Volume2 size={ICON_SIZE.button} strokeWidth={ICON_STROKE} aria-hidden />
        </button>
      </div>

      {word ? (
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
      ) : (
        <div className="flex flex-col gap-2 rounded-md bg-warm px-3 py-3">
          <p className="text-sm text-fg-2">词库未收录「{surface}」。</p>
          <p className="text-xs text-muted">加入生词本会创建自定义词条，并按计划进入新卡队列。可补一条中文释义便于回忆。</p>
          <input
            value={cnDraft}
            onChange={(e) => setCnDraft(e.target.value)}
            placeholder="中文释义（可选）"
            aria-label="中文释义"
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </div>
      )}

      {sourceSentence ? (
        <p className="rounded-md bg-sunken px-3 py-2 text-xs leading-snug text-muted">
          来源例句：{sourceSentence}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </ModalShell>
  );
}
