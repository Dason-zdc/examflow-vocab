import type { CustomWord, ExamCode } from '../domain/types';
import type { PackWord } from './packVerifier';

/**
 * 自定义生词 → 数据包词条（点词即查加入的生词，PRD 5.8）。
 *
 * 自定义词没有考频数据，所以给一个显式的「用户加入」权重 100 与 CORE 层级：
 * 让它在同类新卡里优先出现，且 UI 上的权重条必须靠 sources=['USER-ADDED'] 说明来源，
 * 不能伪装成考试统计。
 */
export const CUSTOM_WORD_WEIGHT = 100;

export function customWordToPackWord(word: CustomWord, exam: ExamCode): PackWord {
  const senseId = word.id;
  return {
    id: word.id,
    lemma: word.lemma,
    phoneticUk: word.phonetic,
    phoneticUs: word.phonetic,
    isBasic: false,
    senses: [
      {
        id: senseId,
        pos: '',
        cn: word.cn || '（自定义生词）',
        examStats: {
          [exam]: {
            senseWeight: CUSTOM_WORD_WEIGHT,
            tier: 'CORE',
            kind: 'ESTIMATED',
            sources: ['USER-ADDED'],
            isEccentric: false,
          },
        },
      },
    ],
    confusables: [],
    synonyms: [],
    forms: [],
    sentences: word.sourceSentence
      ? [
          {
            id: `${word.id}:s1`,
            wordId: word.id,
            senseId,
            en: word.sourceSentence,
            zh: '',
            surfaceForm: word.lemma,
            provenance: { type: 'ADAPTED', note: '点词即查加入生词时保留的原例句' },
          },
        ]
      : [],
  };
}
