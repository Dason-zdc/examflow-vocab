import { useState } from 'react';
import { applyAiOverride, type CuratedWord } from '../content/affixLexicon';
import { askAiMorph } from '../content/morphAi';

/**
 * 「问 AI 核对」按钮：把当前词的词源交给后端代理的模型核对/修正，
 * 返回的结构化拆解已由服务端校验并写入词表（curated），前端应用覆盖层即时刷新。
 */
export function MorphAsk({ lemma }: { lemma: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  async function ask() {
    setBusy(true);
    setMsg('AI 核对中…');
    const result = await askAiMorph(lemma);
    if (result.ok && result.entry) {
      applyAiOverride(lemma, result.entry as CuratedWord);
      const secs = result.latencyMs ? ` · ${(result.latencyMs / 1000).toFixed(1)}s` : '';
      setMsg(`已核对并更新（${result.model ?? 'AI'}${secs}）；完整输入输出见 /api/v1/morph/log`);
    } else {
      setMsg(result.error ?? '核对失败');
    }
    setBusy(false);
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={ask}
        disabled={busy}
        className="text-accent transition-colors duration-150 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:text-meta"
      >
        问 AI 核对
      </button>
      {msg ? <span className="text-2xs text-meta">{msg}</span> : null}
    </span>
  );
}
