import type { ExampleSentence } from '../domain/types';

/**
 * 例句来源标注（合规相关）：
 * 数据包 v1.3 起，例句主体是 Tatoeba 语料句对（真实人工撰写 + 人工翻译），
 * 必须与「仿真例句」明确区分，且 CC BY 2.0 FR 要求可溯源到具体句对。
 */
export function sentenceSourceLabel(provenance: ExampleSentence['provenance']): string {
  if (provenance.type === 'REAL_EXAM') return `${provenance.year} ${provenance.paper}`;
  if (provenance.origin === 'TATOEBA') return '语料例句';
  if (provenance.origin === 'AUTHORED') return '仿真例句 · 人工撰写';
  // 旧数据包没有 origin 字段，用 note 兜底识别人工例句
  if (provenance.note.includes('人工撰写')) return '仿真例句 · 人工撰写';
  return '仿真例句';
}

export function isCorpusSentence(provenance: ExampleSentence['provenance']): boolean {
  return provenance.type === 'ADAPTED' && provenance.origin === 'TATOEBA';
}

export function tatoebaUrl(sourceId: string): string {
  return `https://tatoeba.org/sentences/show/${encodeURIComponent(sourceId)}`;
}
