import type { Card, ExamCode } from '../domain/types';
import type { PackDictionary } from '../content/dictionary';

/** 入门水平测试抽样（PRD M-08）：从尚未学习的新卡里按权重分层取样，避免只考最简单的词。 */

export interface PlacementWord {
  wordId: string;
  lemma: string;
  phonetic: string;
  cn: string;
  /** 该词的全部卡片（判定「认识」后整体标为已掌握） */
  cards: Card[];
}

export function pickPlacementWords(
  cards: Card[],
  dictionary: PackDictionary,
  exam: ExamCode,
  limit = 12,
): PlacementWord[] {
  const byWord = new Map<string, Card[]>();
  for (const card of cards) {
    if (card.exam !== exam || card.suspended || card.fsrs.reps > 0) continue;
    const list = byWord.get(card.wordId);
    if (list) list.push(card);
    else byWord.set(card.wordId, [card]);
  }

  const entries = [...byWord.entries()]
    .map(([wordId, list]) => {
      const word = dictionary.getWord(wordId);
      const sense = word?.senses.find((s) => s.id === list[0]?.senseId);
      return {
        wordId,
        lemma: word?.lemma ?? wordId,
        phonetic: word?.phoneticUk || word?.phoneticUs || '',
        cn: sense?.cn ?? '',
        cards: list,
        weight: sense?.examStats[exam]?.senseWeight ?? 0,
      };
    })
    .sort((a, b) => b.weight - a.weight || a.lemma.localeCompare(b.lemma));

  if (entries.length <= limit) return entries.map(({ weight: _weight, ...rest }) => rest);

  // 等距抽样：覆盖高/中/低权重，而不是只取最靠前的词
  const step = (entries.length - 1) / (limit - 1);
  const picked: PlacementWord[] = [];
  for (let i = 0; i < limit; i += 1) {
    const entry = entries[Math.round(i * step)];
    if (!entry) continue;
    const { weight: _weight, ...rest } = entry;
    if (!picked.some((p) => p.wordId === rest.wordId)) picked.push(rest);
  }
  return picked;
}
