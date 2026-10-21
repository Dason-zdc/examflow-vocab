import { describe, expect, it } from 'vitest';
import { isCorpusSentence, sentenceSourceLabel, tatoebaUrl } from './sentenceSource';

/** 例句来源标注：合规要求「语料例句」与「仿真例句」必须可区分且可溯源（CC BY 2.0 FR）。 */
describe('例句来源标注', () => {
  it('语料句对标为「语料例句」，并可溯源到 Tatoeba', () => {
    const p = { type: 'ADAPTED' as const, note: 'x', origin: 'TATOEBA' as const, sourceId: '306376' };
    expect(sentenceSourceLabel(p)).toBe('语料例句');
    expect(isCorpusSentence(p)).toBe(true);
    expect(tatoebaUrl('306376')).toBe('https://tatoeba.org/sentences/show/306376');
  });

  it('人工撰写与模板生成都标为仿真例句，不冒充语料', () => {
    expect(sentenceSourceLabel({ type: 'ADAPTED', note: 'x', origin: 'AUTHORED' })).toBe('仿真例句 · 人工撰写');
    expect(sentenceSourceLabel({ type: 'ADAPTED', note: 'x', origin: 'TEMPLATE' })).toBe('仿真例句');
    expect(sentenceSourceLabel({ type: 'ADAPTED', note: 'x' })).toBe('仿真例句');
    expect(isCorpusSentence({ type: 'ADAPTED', note: 'x' })).toBe(false);
  });

  it('真题来源展示年份与试卷（当前数据包不使用）', () => {
    const p = { type: 'REAL_EXAM' as const, exam: 'IELTS' as const, year: 2023, paper: 'C18', section: 'R' };
    expect(sentenceSourceLabel(p)).toBe('2023 C18');
    expect(isCorpusSentence(p)).toBe(false);
  });
});
