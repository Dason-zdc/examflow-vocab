import type { Card, CardTier, ExamCode, ExampleSentence, Sense, Settings } from '../domain/types';
import type { PackDictionary } from '../content/dictionary';
import type { PackWord as PackWordType } from '../content/packVerifier';
import { planDaily, spreadSiblings, type DailyPlan, type DueCardInput } from '../domain/planner';
import { SessionQueue, type SessionQueueSnapshot } from '../domain/sessionQueue';
import { createScheduler, type Scheduler } from '../domain/scheduler';
import { systemClock, type Clock } from '../domain/clock';

/** 学习页当前卡的完整视图：卡 + 层级 + 词条内容 + 该义项例句 */
export interface SessionCardView {
  card: Card;
  tier: CardTier;
  word: PackWordType;
  sense: Sense;
  sentences: ExampleSentence[];
}

export interface BuildSessionInput {
  cards: Card[];
  dictionary: PackDictionary;
  exam: ExamCode;
  now: number;
  settings: Pick<Settings, 'examDate' | 'dayStartHour' | 'maxNewPerDay' | 'maxReviewPerDay'>;
  scheduler?: Scheduler;
  clock?: Clock;
  /** 当日已学过的 wordId（兄弟卡错开用） */
  studiedWordIds?: Iterable<string>;
}

export interface BuiltSession {
  plan: DailyPlan;
  /** 当日队列的初始卡片 ID 顺序（已做兄弟卡错开） */
  queueCardIds: string[];
  views: Map<string, SessionCardView>;
}

/** 卡 → 层级：取该卡义项在本考试中的 tier；缺失时按拓展处理（不谎报核心） */
export function tierOfCard(card: Card, dictionary: PackDictionary, exam: ExamCode): CardTier {
  const word: PackWordType | undefined = dictionary.getWord(card.wordId);
  const sense = word?.senses.find((s) => s.id === card.senseId);
  const stat = sense?.examStats[exam];
  return stat?.tier ?? 'EXTENDED';
}

export function buildCardView(
  card: Card,
  dictionary: PackDictionary,
  exam: ExamCode,
): SessionCardView | null {
  const word = dictionary.getWord(card.wordId);
  if (!word) return null;
  const sense = word.senses.find((s) => s.id === card.senseId);
  if (!sense) return null;
  return {
    card,
    tier: sense.examStats[exam]?.tier ?? 'EXTENDED',
    word,
    sense,
    sentences: word.sentences.filter((x) => x.senseId === card.senseId),
  };
}

/**
 * 组装一次学习会话（纯函数，可单测）：
 * 1. 到期卡（非 New 且 due <= now，未暂停）→ planDaily 排序取前 M_rev；
 * 2. 新卡（reps = 0）按 senseWeight 降序取 n_new；
 * 3. 两类合并后过 spreadSiblings：同词当日只出 1 张；
 * 4. 产出队列初始顺序 + 各卡视图。
 */
export function buildSession(input: BuildSessionInput): BuiltSession {
  const scheduler = input.scheduler ?? createScheduler();
  const now = input.now;
  const cardById = new Map(input.cards.map((c) => [c.id, c]));

  const dueInputs: DueCardInput[] = [];
  const newCards: Card[] = [];
  for (const card of input.cards) {
    if (card.suspended) continue;
    if (card.exam !== input.exam) continue;
    if (card.fsrs.reps === 0) {
      newCards.push(card);
      continue;
    }
    if (card.fsrs.due.getTime() > now) continue;
    dueInputs.push({ card, retrievability: scheduler.retrievability(card.fsrs, now), tier: tierOfCard(card, input.dictionary, input.exam) });
  }

  const plan = planDaily({
    remainingNewCount: newCards.length,
    dueCards: dueInputs,
    maxNewPerDay: input.settings.maxNewPerDay,
    maxReviewPerDay: input.settings.maxReviewPerDay,
    examDate: input.settings.examDate,
    dayStartHour: input.settings.dayStartHour,
    now,
  });

  const views = new Map<string, SessionCardView>();
  const dueViews: DueCardInput[] = [];
  for (const id of plan.reviewOrder) {
    const card = cardById.get(id);
    if (!card) continue;
    const view = buildCardView(card, input.dictionary, input.exam);
    if (!view) continue;
    views.set(id, view);
    const due = dueInputs.find((d) => d.card.id === id);
    dueViews.push({ card, retrievability: due?.retrievability ?? 0.5, tier: view.tier });
  }

  // 新卡：senseWeight 降序取 n_new（内容缺失的跳过）
  const newSorted = [...newCards].sort((a, b) => weightOf(b, input.dictionary, input.exam) - weightOf(a, input.dictionary, input.exam));
  const newViews: DueCardInput[] = [];
  for (const card of newSorted.slice(0, plan.newCount)) {
    const view = buildCardView(card, input.dictionary, input.exam);
    if (!view) continue;
    views.set(card.id, view);
    newViews.push({ card, retrievability: 1, tier: view.tier });
  }

  const { selected } = spreadSiblings({
    cards: [...dueViews, ...newViews],
    studiedWordIds: input.studiedWordIds,
  });

  return {
    plan,
    queueCardIds: selected.map((x) => x.card.id),
    views,
  };
}

function weightOf(card: Card, dictionary: PackDictionary, exam: ExamCode): number {
  const word = dictionary.getWord(card.wordId);
  const sense = word?.senses.find((s) => s.id === card.senseId);
  return sense?.examStats[exam]?.senseWeight ?? 0;
}

/** 队列构造：把顺序 ID 变成可推进的 SessionQueue */
export function createSessionQueue(
  cardIds: readonly string[],
  clock: Clock = systemClock,
): SessionQueue {
  return new SessionQueue(cardIds, { clock });
}

export type { SessionQueueSnapshot };
export { systemClock };
