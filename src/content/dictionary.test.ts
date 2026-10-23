import { describe, expect, it } from 'vitest';
import { PackDictionary } from './dictionary';
import type { PackWord } from './packVerifier';

function word(lemma: string, cn: string, weight = 50): PackWord {
  return {
    id: `w_${lemma}`,
    lemma,
    phoneticUk: '',
    phoneticUs: '',
    isBasic: false,
    forms: [],
    senses: [
      {
        id: `s_${lemma}`,
        pos: 'n.',
        cn,
        examStats: {
          IELTS: { senseWeight: weight, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['test'], isEccentric: false },
        },
      },
    ],
    sentences: [],
    confusables: [],
  };
}

const WORDS = [word('analysis', '分析', 68), word('present', '现在的；提出', 66), word('book', '书', 40)];
const LEMMA_MAP = { analyses: 'analysis', presented: 'present', books: 'book' };

const dict = new PackDictionary(WORDS, LEMMA_MAP);

describe('dictionary · 词形还原', () => {
  it('命中 lemma-map 的变形还原到原形', () => {
    expect(dict.restoreLemma('analyses')).toBe('analysis');
    expect(dict.restoreLemma('presented')).toBe('present');
    expect(dict.restoreLemma('books')).toBe('book');
  });

  it('原形自身直接命中', () => {
    expect(dict.restoreLemma('analysis')).toBe('analysis');
  });

  it('大小写不敏感', () => {
    expect(dict.restoreLemma('Analyses')).toBe('analysis');
    expect(dict.restoreLemma('PRESENT')).toBe('present');
  });

  it('未收录的变形如实返回 null（不做激进猜测）', () => {
    expect(dict.restoreLemma('xylophonizing')).toBeNull();
    expect(dict.restoreLemma('')).toBeNull();
    expect(dict.restoreLemma('   ')).toBeNull();
  });
});

describe('dictionary · 查词与搜索', () => {
  it('getWord 支持数据包 ID（卡片 wordId 存的是 ID）', () => {
    expect(dict.getWord('w_analysis')?.lemma).toBe('analysis');
    expect(dict.getWord('w_present')?.lemma).toBe('present');
  });

  it('getWord 回落 lemma（兼容旧调用方/夹具）', () => {
    expect(dict.getWord('analysis')?.lemma).toBe('analysis');
    expect(dict.getWord('missing')).toBeUndefined();
  });

  it('lookup 先还原再精确匹配', () => {
    expect(dict.lookup('analyses')?.lemma).toBe('analysis');
    expect(dict.lookup('analysis')?.lemma).toBe('analysis');
    expect(dict.lookup('nope')).toBeUndefined();
  });

  it('搜索按 lemma 前缀优先', () => {
    expect(dict.search('anal').map((w) => w.lemma)).toEqual(['analysis']);
    expect(dict.search('pre').map((w) => w.lemma)).toEqual(['present']);
  });

  it('搜索可命中中文释义', () => {
    expect(dict.search('书').map((w) => w.lemma)).toEqual(['book']);
  });

  it('空查询返回空', () => {
    expect(dict.search('')).toEqual([]);
  });

  it('limit 生效', () => {
    const many = new PackDictionary(
      Array.from({ length: 30 }, (_, i) => word(`word${String(i).padStart(2, '0')}`, '词', 50)),
      {},
    );
    expect(many.search('word').length).toBe(20);
    expect(many.search('word', 5).length).toBe(5);
  });
});

describe('dictionary · 浏览', () => {
  it('browse 按 senseWeight 降序', () => {
    expect(dict.browse(0, 10).map((w) => w.lemma)).toEqual(['analysis', 'present', 'book']);
    expect(dict.browse(1, 10).map((w) => w.lemma)).toEqual(['present', 'book']);
    expect(dict.browse(2, 10).map((w) => w.lemma)).toEqual(['book']);
    expect(dict.browse(3, 10)).toEqual([]);
  });

  it('wordsForExam 只返回带该考试统计的词', () => {
    const kyWord: PackWord = {
      ...word('ky', '考研词', 30),
      senses: [
        {
          id: 's_ky',
          pos: 'n.',
          cn: '考研词',
          examStats: {
            KAOYAN: { senseWeight: 30, tier: 'CORE', kind: 'ESTIMATED', sources: ['t'], isEccentric: false },
          },
        },
      ],
    };
    const d = new PackDictionary([...WORDS, kyWord], {});
    expect(d.wordsForExam('IELTS').map((w) => w.lemma)).toEqual(['analysis', 'present', 'book']);
    expect(d.wordsForExam('KAOYAN').map((w) => w.lemma)).toEqual(['ky']);
    expect(d.wordsForExam('TOEFL')).toEqual([]);
  });
});
