import type { Card as FsrsCard } from 'ts-fsrs';

/** ========== 内容数据（来自数据包，只读） ========== */

export type ExamCode = 'KAOYAN' | 'CET4' | 'CET6' | 'IELTS' | 'TOEFL';

export const EXAM_CODES: readonly ExamCode[] = ['KAOYAN', 'CET4', 'CET6', 'IELTS', 'TOEFL'];

/**
 * 义项在某考试中的权重统计（PRD v0.3 · D-03/D-04/D-08 定稿）。
 *
 * 合规红线：本项目**没有真题语料**，因此不允许出现「在雅思中出现 N 次」这类
 * 真题考频表述。senseWeight 是由公开信号合成的**估计值**，kind 恒为 'ESTIMATED'，
 * 且必须携带 sources 说明权重来源。UI 必须如实展示为估计值。
 */
export interface SenseExamStat {
  /** 0~100 的义项权重估计值（替代旧 freq） */
  senseWeight: number;
  /** 该考试中的层级：核心 ≈30% / 进阶 ≈40% / 拓展 ≈30% */
  tier: 'CORE' | 'ADVANCED' | 'EXTENDED';
  /** 合规标记：估计值，恒为 'ESTIMATED' */
  kind: 'ESTIMATED';
  /** 权重来源信号（如 'AWL-Sublist2'、'ECDICT-frq'）——必填，覆盖率须 100% */
  sources: string[];
  /** 是否为该考试的熟词僻义 */
  isEccentric: boolean;
}

export interface Sense {
  id: string;
  pos: string;
  cn: string;
  /** WordNet 英文释义 */
  enDef?: string;
  /** 按考试分别统计 */
  examStats: Partial<Record<ExamCode, SenseExamStat>>;
}

export interface Etymology {
  formula: string;
  origin: string;
  derivatives: Array<{ lemma: string; pos: string; cn: string }>;
}

export type ConfusableReason = 'SPELLING' | 'SOUND' | 'ROOT';

export interface Confusable {
  lemma: string;
  reason: ConfusableReason;
  tip: string;
  /** 形近词音标（数据包携带，UI 展示用） */
  phonetic?: string;
}

export interface Synonym {
  lemma: string;
  pos: string;
  cn: string;
}

export interface Word {
  /** 稳定 ID，永不复用，如 'w_address' */
  id: string;
  /** 原形 */
  lemma: string;
  phoneticUk: string;
  phoneticUs: string;
  /** 是否在基础词排除表中 */
  isBasic: boolean;
  senses: Sense[];
  etymology?: Etymology;
  confusables: Confusable[];
  synonyms: Synonym[];
  /** 废弃标记，不物理删除 */
  deprecated?: boolean;
}

export interface RealExamProvenance {
  type: 'REAL_EXAM';
  exam: ExamCode;
  year: number;
  paper: string;
  section: string;
}

export interface AdaptedProvenance {
  type: 'ADAPTED';
  note: string;
}

export type Provenance = RealExamProvenance | AdaptedProvenance;

export interface ExampleSentence {
  id: string;
  wordId: string;
  /** 关联义项，不再用字符串匹配 */
  senseId: string;
  en: string;
  zh: string;
  /** 句中实际形式，如 'addressed' */
  surfaceForm: string;
  provenance: Provenance;
}

/** ========== 用户数据（IndexedDB，可读写） ========== */

export type CardKind = 'PRIMARY' | 'ECCENTRIC' | 'CUSTOM';

/** 用户可见的三档评分，映射到 ts-fsrs 的 Again / Hard / Good */
export type RatingCode = 'AGAIN' | 'HARD' | 'GOOD';

export interface Card {
  /** `${exam}:${senseId}` 或自定义词 ID */
  id: string;
  exam: ExamCode;
  wordId: string;
  senseId: string;
  kind: CardKind;
  fsrs: FsrsCard;
  /** 斩词 / 手动暂停 */
  suspended: boolean;
  /** 最近一次「每日首评」所属学习日，'YYYY-MM-DD' */
  lastFirstReviewDay: string | null;
}

export interface ReviewLog {
  id: string;
  cardId: string;
  /** ms */
  reviewedAt: number;
  /** 按日切计算的学习日 */
  studyDay: string;
  rating: RatingCode;
  /** 是否在揭示前预判 */
  prejudged: boolean;
  /** 是否在背面修改过评分 */
  corrected: boolean;
  /** true 表示同日重现，不参与 FSRS */
  sessionOnly: boolean;
  /** 正面停留 + 背面停留 */
  durationMs: number;
  /** 用于撤销 */
  fsrsBefore?: FsrsCard;
  /**
   * 本次提交前的 lastFirstReviewDay。
   * 非 PRD 字段：撤销需要逐字段还原，而 lastFirstReviewDay 不在 fsrs 快照里，
   * 缺少它会导致撤销后「每日首评」判定被悄悄改写。
   */
  firstReviewDayBefore?: string | null;
}

export interface UserWordMeta {
  wordId: string;
  starred: boolean;
  note: string;
  updatedAt: number;
}

export interface CustomWord {
  id: string;
  lemma: string;
  phonetic: string;
  cn: string;
  sourceSentence?: string;
  createdAt: number;
}

export interface Settings {
  exam: ExamCode;
  /** 'YYYY-MM-DD'，存日期而不是剩余天数 */
  examDate: string;
  dayStartHour: number;
  maxNewPerDay: number;
  maxReviewPerDay: number;
  excludeBasicWords: boolean;
  accent: 'uk' | 'us';
  autoPlayAudio: boolean;
  dataPackVersion: string;
  lastBackupAt: number | null;
  /** 本地存储结构版本，用于迁移 */
  schemaVersion: number;
}

export const DEFAULT_SETTINGS: Omit<Settings, 'examDate'> = {
  exam: 'IELTS',
  dayStartHour: 4,
  maxNewPerDay: 50,
  maxReviewPerDay: 300,
  excludeBasicWords: true,
  accent: 'uk',
  autoPlayAudio: false,
  dataPackVersion: '0.0.0',
  lastBackupAt: null,
  schemaVersion: 1,
};

/** 复习优先级层级（PRD v0.3 §5.3，与数据包 tier 对齐） */
export type CardTier = 'CORE' | 'ADVANCED' | 'EXTENDED';

export const TIER_WEIGHT: Record<CardTier, number> = {
  CORE: 1.0,
  ADVANCED: 0.7,
  EXTENDED: 0.4,
};
