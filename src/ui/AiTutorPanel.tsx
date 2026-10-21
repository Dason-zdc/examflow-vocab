import { useEffect, useRef, useState } from 'react';
import type { Sense, Settings } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import {
  buildTutorMessages,
  isTutorConfigured,
  requestTutor,
  TUTOR_MODES,
  type TutorMode,
  type TutorWordContext,
} from '../app/tutor';
import { Button, Notice, Panel } from './primitives';
import { AlertCircle, ICON_SIZE, ICON_STROKE, Lightbulb, Loader2 } from './icons';

/** AI 私教侧栏（P1 / S-03）：自备 OpenAI 兼容 Key 直连。
 * 未配置时只引导配置，不提供模拟回答；切换卡片会取消进行中的请求。 */

export interface AiTutorPanelProps {
  settings: Settings;
  word: PackWord;
  sense: Sense;
  sentence?: string;
  cardId: string;
  onAppendNote: (text: string) => void;
  onOpenSettings: () => void;
}

export function AiTutorPanel({ settings, word, sense, sentence, cardId, onAppendNote, onOpenSettings }: AiTutorPanelProps) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [answer, setAnswer] = useState<{ text: string; cardId: string } | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const configured = isTutorConfigured(settings);

  // 换卡：取消上一个词的请求，清掉上一个词的回答，避免张冠李戴
  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setBusy(false);
    setError(null);
    setAnswer(null);
    setQuestion('');
  }, [cardId]);

  useEffect(() => () => requestRef.current?.abort(), []);

  async function run(mode: TutorMode) {
    if (!configured) {
      onOpenSettings();
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setError(null);

    const ctx: TutorWordContext = {
      lemma: word.lemma,
      pos: sense.pos,
      cn: sense.cn,
      enDef: sense.enDef,
      sentence,
      confusables: word.confusables.map((c) => c.lemma),
    };

    try {
      const text = await requestTutor({
        config: settings,
        messages: buildTutorMessages(ctx, mode, question),
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setAnswer({ text, cardId });
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <Panel title="AI 私教" caption={<span className="text-2xs text-meta">P1 · 自备 Key</span>}>
      {configured ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {TUTOR_MODES.map((m) => (
              <button
                key={m.mode}
                type="button"
                disabled={busy}
                onClick={() => void run(m.mode)}
                className="inline-flex min-h-9 items-center gap-1 rounded-md border border-line-strong bg-surface px-2 text-xs text-fg-2 transition-colors duration-150 hover:bg-warm disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Lightbulb size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
                {m.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void run('FREE_QUESTION');
                }
              }}
              maxLength={200}
              placeholder="追问用法、搭配或辨析"
              aria-label="向 AI 提问"
              className="min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-2 py-1.5 text-xs text-fg placeholder:text-meta focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <Button variant="secondary" disabled={busy} onClick={() => void run('FREE_QUESTION')}>
              发送
            </Button>
          </div>

          {busy ? (
            <p className="flex items-center gap-1 text-xs text-muted" role="status">
              <Loader2 size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} className="animate-spin" aria-hidden />
              正在生成…
            </p>
          ) : null}

          {error ? (
            <Notice tone="danger" icon={<AlertCircle size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />}>
              {error}
            </Notice>
          ) : null}

          {answer ? (
            <div className="flex flex-col gap-2 rounded-md bg-warm px-3 py-2">
              <p className="whitespace-pre-wrap text-xs leading-snug text-fg-2">{answer.text}</p>
              <button
                type="button"
                onClick={() => onAppendNote(answer.text)}
                className="self-start text-xs text-accent underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                存入笔记
              </button>
            </div>
          ) : null}

          {!answer && !busy && !error ? (
            <p className="text-xs leading-snug text-meta">生成内容仅供辅助记忆，请以词典与教材为准。Key 只保存在本机，不会进入备份文件。</p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs leading-snug text-muted">
            未配置。AI 为 P1 功能，需要填入 OpenAI 兼容接口的 Base URL、Key 与模型名；未配置时不会提供模拟回答。
          </p>
          <Button variant="secondary" onClick={onOpenSettings}>
            去设置
          </Button>
        </div>
      )}
    </Panel>
  );
}
