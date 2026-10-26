import type { CuratedWord } from './affixLexicon';

/**
 * 词源「问 AI 核对」客户端：走自建后端代理（/api/v1/morph/ask），
 * 后端持有模型 Key 并完成校验与词表落库，前端只负责展示与覆盖层应用。
 */

export interface MorphAskResult {
  ok: boolean;
  word?: string;
  entry?: CuratedWord;
  model?: string;
  latencyMs?: number;
  error?: string;
}

export async function askAiMorph(word: string): Promise<MorphAskResult> {
  try {
    const res = await fetch('/api/v1/morph/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; word?: string; entry?: CuratedWord; model?: string; latencyMs?: number; error?: { message?: string } }
      | null;
    if (!res.ok) {
      return { ok: false, error: body?.error?.message ?? `核对失败（HTTP ${res.status}）` };
    }
    if (!body?.entry) return { ok: false, error: '后端未返回词源数据' };
    return { ok: true, word: body.word ?? word, entry: body.entry, model: body.model, latencyMs: body.latencyMs };
  } catch {
    return { ok: false, error: '网络错误：后端不可达' };
  }
}
