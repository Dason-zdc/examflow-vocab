import { createEmptyCard } from 'ts-fsrs';
import type { Card, CardTier, ExamCode, Sense, Word } from '../domain/types';
import { State } from 'ts-fsrs';

export function makeSense(id: string, overrides: Partial<Sense> = {}): Sense {
  return {
    id,
    pos: 'v.',
    cn: `释义-${id}`,
    examStats: {},
    ...overrides,
  };
}

export function makeWord(id: string, senses: Sense[], overrides: Partial<Word> = {}): Word {
  return {
    id,
    lemma: id.replace(/^w_/, ''),
    phoneticUk: '',
    phoneticUs: '',
    isBasic: false,
    senses,
    confusables: [],
    synonyms: [],
    ...overrides,
  };
}

export interface MakeCardOptions {
  exam?: ExamCode;
  wordId?: string;
  senseId?: string;
  now?: number;
  /** 记忆稳定性，默认 0（新卡） */
  stability?: number;
  difficulty?: number;
  reps?: number;
  state?: State;
  /** 最近一次复习时间（ts-fsrs 的 get_retrievability 对 Review 态卡必须有它） */
  lastReview?: number;
  suspended?: boolean;
  lastFirstReviewDay?: string | null;
}

export function makeCard(id: string, options: MakeCardOptions = {}): Card {
  const base = createEmptyCard(new Date(options.now ?? Date.parse('2026-10-01T10:00:00')));
  return {
    id,
    exam: options.exam ?? 'KAOYAN',
    wordId: options.wordId ?? 'w_unknown',
    senseId: options.senseId ?? 's_unknown',
    kind: 'PRIMARY',
    fsrs: {
      ...base,
      stability: options.stability ?? base.stability,
      difficulty: options.difficulty ?? base.difficulty,
      reps: options.reps ?? base.reps,
      state: options.state ?? base.state,
      ...(options.lastReview !== undefined ? { last_review: new Date(options.lastReview) } : {}),
    },
    suspended: options.suspended ?? false,
    lastFirstReviewDay: options.lastFirstReviewDay ?? null,
  };
}

export function dueCardInput(card: Card, retrievability: number, tier: CardTier = 'EXTENDED') {
  return { card, retrievability, tier };
}
