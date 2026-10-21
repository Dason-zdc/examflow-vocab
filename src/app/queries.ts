import { useLiveQuery } from 'dexie-react-hooks';
import type { Card, ExamCode, Settings, UserWordMeta } from '../domain/types';
import { SETTINGS_KEY, type ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import type { Scheduler } from '../domain/scheduler';
import { tierOfCard } from './sessionBuilder';

/**
 * 只读查询层（架构 §应用层）：UI 不直接写 Dexie 语句，统一从这里出。
 * useLiveQuery 在 IndexedDB 变更时自动重算；查询本身不加事务（只读）。
 */

export function useSettings(db: ExamFlowDB | null): Settings | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const row = await db.settings.get(SETTINGS_KEY);
    if (!row) return undefined;
    const { id: _id, ...rest } = row;
    return rest as Settings;
  }, [db]);
}

/** 某考试的全部卡片（内存镜像由 Provider 维护；这里给词库/统计页用） */
export function useCardsForExam(db: ExamFlowDB | null, exam: ExamCode): Card[] | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = await db.cards.where('exam').equals(exam).toArray();
    return rows.map(({ dueAt: _dueAt, ...rest }) => rest as Card);
  }, [db, exam]);
}

/**
 * 到期卡：due <= now 且未暂停（学习页主数据源）
 *
 * 不用 [exam+dueAt] 复合索引：fake-indexeddb 对数组下界的 IDBKeyRange
 * .includes() 恒为 false（规范应按字典序比较数组），between() 会静默返回
 * 空集——「没有卡可学」恰是最难察觉的失效。复验：Node 探针建库写入两行
 * 带该索引的数据，between(['IELTS',0],['IELTS',now]) 期望 1 行实得 0；
 * 真实浏览器/Dexie 无此问题。词库 2,600~3,000 张/考试，等值索引 + 过滤
 * 成本可忽略，换确定性。
 */
export function useDueCards(db: ExamFlowDB | null, exam: ExamCode, now: number): Card[] | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = await db.cards
      .where('exam')
      .equals(exam)
      .and((c) => !c.suspended && c.dueAt <= now)
      .toArray();
    return rows.map(({ dueAt: _dueAt, ...rest }) => rest as Card);
  }, [db, exam, now]);
}

/** 尚未学习过的新卡数量（reps = 0 且未暂停） */
export function useNewCardCount(db: ExamFlowDB | null, exam: ExamCode): number | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    return db.cards.where('exam').equals(exam).filter((c) => c.fsrs.reps === 0 && !c.suspended).count();
  }, [db, exam]);
}

/** 全部考试的新卡分布（设置页切换考试时展示） */
export function useNewCardCounts(db: ExamFlowDB | null): Partial<Record<ExamCode, number>> | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = await db.cards.where('exam').equals('KAOYAN').or('exam').equals('CET4').or('exam').equals('CET6').or('exam').equals('IELTS').or('exam').equals('TOEFL').toArray();
    const out: Partial<Record<ExamCode, number>> = {};
    for (const c of rows) {
      if (c.fsrs.reps === 0 && !c.suspended) out[c.exam] = (out[c.exam] ?? 0) + 1;
    }
    return out;
  }, [db]);
}

export function useUserWordMeta(db: ExamFlowDB | null): UserWordMeta[] | undefined {
  return useLiveQuery(async () => (db ? db.userWordMeta.toArray() : undefined), [db]);
}

export interface ReviewLogRow {
  id: string;
  cardId: string;
  reviewedAt: number;
  studyDay: string;
  rating: string;
  sessionOnly: boolean;
}

/** 最近复习日志（小结页/统计） */
export function useRecentReviewLogs(db: ExamFlowDB | null, limit = 100): ReviewLogRow[] | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = await db.reviewLogs.orderBy('reviewedAt').reverse().limit(limit).toArray();
    return rows.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      reviewedAt: r.reviewedAt,
      studyDay: r.studyDay,
      rating: r.rating,
      sessionOnly: r.sessionOnly,
    }));
  }, [db, limit]);
}

/** 某学习日的复习量（热力图/坚持天数） */
export function useStudyDayCounts(db: ExamFlowDB | null): Array<{ studyDay: string; count: number }> | undefined {
  return useLiveQuery(async () => {
    if (!db) return undefined;
    const rows = await db.reviewLogs.toArray();
    const byDay = new Map<string, number>();
    for (const r of rows) byDay.set(r.studyDay, (byDay.get(r.studyDay) ?? 0) + 1);
    return [...byDay.entries()].map(([studyDay, count]) => ({ studyDay, count })).sort((a, b) => a.studyDay.localeCompare(b.studyDay));
  }, [db]);
}

export interface CoverageStats {
  /** 核心考点卡片总数（该考试 tier = CORE 的义项卡） */
  coreTotal: number;
  /** 其中 R ≥ 0.9 的数量（北极星指标口径） */
  mastered: number;
  /** 今日已学新卡数（lastFirstReviewDay = 今日） */
  newLearnedToday: number;
  /** 今日已复习卡片数（去重） */
  reviewedToday: number;
}

/**
 * 北极星指标 + 计划面板统计（PRD §3 / §5.3）：
 * 核心覆盖率 = 核心卡中 R ≥ 0.9 的占比。R 由 scheduler 现算，不落库。
 */
export function useCoverage(
  db: ExamFlowDB | null,
  exam: ExamCode,
  dictionary: PackDictionary | null,
  scheduler: Scheduler,
  now: number,
  studyDay: string,
): CoverageStats | undefined {
  return useLiveQuery(async () => {
    if (!db || !dictionary) return undefined;
    const rows = await db.cards.where('exam').equals(exam).toArray();
    const cards = rows.map(({ dueAt: _dueAt, ...rest }) => rest as Card);
    let coreTotal = 0;
    let mastered = 0;
    let newLearnedToday = 0;
    for (const c of cards) {
      if (c.suspended) continue;
      if (tierOfCard(c, dictionary, exam) === 'CORE') {
        coreTotal += 1;
        if (scheduler.retrievability(c.fsrs, now) >= 0.9) mastered += 1;
      }
      if (c.lastFirstReviewDay === studyDay && c.fsrs.reps > 0) newLearnedToday += 1;
    }
    const logs = await db.reviewLogs.where('studyDay').equals(studyDay).toArray();
    const reviewedToday = new Set(logs.map((l) => l.cardId)).size;
    return { coreTotal, mastered, newLearnedToday, reviewedToday };
  }, [db, exam, dictionary, scheduler, now, studyDay]);
}
