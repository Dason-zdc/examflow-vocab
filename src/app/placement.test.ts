import { describe, expect, it } from 'vitest';
import { PackDictionary } from '../content/dictionary';
import { makeCard, makeSense, makeWord } from '../test/factories';
import { pickPlacementWords } from './placement';
import { customWordToPackWord } from '../content/customWord';

function makeDict(count: number) {
  const words = Array.from({ length: count }, (_, i) => ({
    ...makeWord(`w_${i}`, [
      makeSense(`s_${i}`, {
        examStats: { IELTS: { senseWeight: 100 - i, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false } },
      }),
    ]),
    forms: [],
    sentences: [],
  }));
  return new PackDictionary(words, {});
}

describe('入门水平测试抽样（M-08）', () => {
  it('只抽样未学习且未暂停的词，数量受 limit 限制且不重复', () => {
    const dict = makeDict(30);
    const cards = Array.from({ length: 30 }, (_, i) =>
      makeCard(`IELTS:s_${i}`, { exam: 'IELTS', wordId: `w_${i}`, senseId: `s_${i}` }),
    );
    // 标记一个已学、一个已斩
    cards[0] = { ...cards[0]!, fsrs: { ...cards[0]!.fsrs, reps: 5 } };
    cards[1] = { ...cards[1]!, suspended: true };

    const picked = pickPlacementWords(cards, dict, 'IELTS', 12);
    expect(picked).toHaveLength(12);
    expect(new Set(picked.map((p) => p.wordId)).size).toBe(12);
    expect(picked.some((p) => p.wordId === 'w_0')).toBe(false);
    expect(picked.some((p) => p.wordId === 'w_1')).toBe(false);
    expect(picked[0]?.cn).toBeTruthy();
  });

  it('候选不足 limit 时全部返回', () => {
    const dict = makeDict(3);
    const cards = [0, 1, 2].map((i) => makeCard(`IELTS:s_${i}`, { exam: 'IELTS', wordId: `w_${i}`, senseId: `s_${i}` }));
    expect(pickPlacementWords(cards, dict, 'IELTS', 12)).toHaveLength(3);
  });
});

describe('自定义生词 → 词条（S-02）', () => {
  it('用户加入的词带 USER-ADDED 来源与最高权重，并保留来源例句', () => {
    const word = customWordToPackWord(
      { id: 'cw_x', lemma: 'serendipity', phonetic: '/x/', cn: '意外发现', sourceSentence: 'A moment of serendipity.', createdAt: 1 },
      'IELTS',
    );
    expect(word.lemma).toBe('serendipity');
    const stat = word.senses[0]?.examStats.IELTS;
    expect(stat?.sources).toEqual(['USER-ADDED']);
    expect(stat?.senseWeight).toBe(100);
    expect(stat?.tier).toBe('CORE');
    expect(word.sentences[0]?.en).toBe('A moment of serendipity.');
    expect(word.sentences[0]?.provenance.type).toBe('ADAPTED');
  });
});
