import type { ExamFlowDB } from '../storage/db';

/** 拼写练习日志（PRD 5.7）：只进练习统计，不影响识记卡调度。 */

export interface SpellingAttempt {
  wordId: string;
  typed: string;
  correct: boolean;
  hintsUsed: number;
}

export async function recordSpellingAttempt(db: ExamFlowDB, attempt: SpellingAttempt): Promise<void> {
  const createdAt = Date.now();
  const suffix = Math.random().toString(36).slice(2, 8);
  await db.spellingLogs.put({
    id: `${attempt.wordId}#${createdAt}#${suffix}`,
    wordId: attempt.wordId,
    correct: attempt.correct,
    hintsUsed: attempt.hintsUsed,
    typed: attempt.typed,
    createdAt,
  });
}

export interface SpellingStats {
  total: number;
  correct: number;
  accuracy: number;
  hinted: number;
}

export function summarizeSpelling(logs: Array<{ correct: boolean; hintsUsed: number }>): SpellingStats {
  const total = logs.length;
  const correct = logs.filter((l) => l.correct).length;
  return {
    total,
    correct,
    accuracy: total > 0 ? correct / total : 0,
    hinted: logs.filter((l) => l.hintsUsed > 0).length,
  };
}
