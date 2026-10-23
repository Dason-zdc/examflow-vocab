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

/**
 * 同义候选的可用性分级（五态，语义见 scripts/etl_synonyms.py）。
 *
 * 这是 US-08 的核心契约：同义关系必须挂在义项上，候选必须带「能不能直接用」的判断，
 * 而不是把同义集成员压成一个词级列表让用户自己猜。
 */
export type SynonymStatus = 'DIRECT' | 'INFERRED' | 'REWRITE' | 'CONFLICT' | 'UNKNOWN';

/** 义项级同义候选 */
export interface SenseSynonym {
  lemma: string;
  pos: string;
  status: SynonymStatus;
  /**
   * 该候选的中文释义。只在候选词义唯一时由 ETL 贴上；
   * 多义合并（如「居住、居住(于)」）一律留空——词级高频释义贴到具体义项上正是错配来源。
   */
  cn?: string;
  /** 判定依据（搭配不符 / 需改写时必填） */
  note?: string;
  /** 替换模板，如 `consist of O → comprise O` */
  rewrite?: string;
  /** 候选是否在本数据包内（决定能否跳转词条） */
  inPack: boolean;
}

/** 一个同义集（synset）= 一个具体义项下的候选集合 */
export interface SynonymGroup {
  /** WordNet 义项 id，可回溯证据 */
  synset: string;
  /** 该义项的英文释义（WordNet gloss） */
  gloss: string;
  /** 该义项的搭配框架，如 `of` / `in`；名词没有介词槽时缺省 */
  frame?: string;
  candidates: SenseSynonym[];
}

export interface Sense {
  id: string;
  pos: string;
  cn: string;
  /** WordNet 英文释义 */
  enDef?: string;
  /** 按考试分别统计 */
  examStats: Partial<Record<ExamCode, SenseExamStat>>;
  /** 该义项暂无可用语料例句（数据包 v1.3 起不再用模板句填充） */
  sentencePending?: boolean;
  /** 义项级同义替换（数据包 v1.6 起）；缺省表示该义项没有同义集成员 */
  synonymGroups?: SynonymGroup[];
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

/** P1 · 同源词群中的一个成员（同根词 + 记忆公式） */
export interface FamilyMember {
  lemma: string;
  pos: string;
  cn: string;
  /** 记忆公式：只由词根表 / 词缀表中可查到的成分拼接，不做联想编造 */
  formula: string;
  source: string;
}

/** P1 · 同源词群：以词根为轴组织「一次记一串」的学习路径（与形近词的「防错」互补） */
export interface WordFamily {
  root: string;
  rootMeaning: string;
  origin: string;
  formula: string;
  members: FamilyMember[];
  source: string;
}

/** P1 · 派生词：INFLECTION = 屈折变化，DERIVATION = 后缀派生（产物必须在词典中存在） */
export interface Derivative {
  lemma: string;
  pos: string;
  cn: string;
  kind: 'INFLECTION' | 'DERIVATION';
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
  /** P1 · 同源词群（v1.5 起，数据包可选字段） */
  wordFamily?: WordFamily;
  /** P1 · 派生词（v1.5 起，数据包可选字段） */
  derivatives?: Derivative[];
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
  /** 例句出处：AUTHORED 人工撰写 / TATOEBA 语料句对 / TEMPLATE 模板生成 */
  origin?: 'AUTHORED' | 'TATOEBA' | 'TEMPLATE';
  /** 语料句对 ID（Tatoeba sentence id），用于溯源与署名 */
  sourceId?: string;
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
  /** AI 私教（P1，自备 OpenAI 兼容接口）：Base URL / Key / 模型名；空串表示未配置 */
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
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
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
};

/**
 * 设置行 → 完整 Settings：抹平历史版本缺失字段。
 *
 * 老版本写入的 IndexedDB 设置行没有后加的字段（如 AI 配置），
 * 直接当 Settings 用会在 `.trim()` 之类的地方炸掉；所有读入口统一走这里。
 * 同时剥离存储行专有的 id / updatedAt。
 */
export function withDefaultSettings(value: Partial<Settings & { id?: string; updatedAt?: number }> | null | undefined): Settings {
  const merged: Record<string, unknown> = { ...DEFAULT_SETTINGS, examDate: '' };
  if (value) {
    for (const [key, field] of Object.entries(value)) {
      if (key === 'id' || key === 'updatedAt') continue;
      if (field !== undefined) merged[key] = field;
    }
  }
  return merged as unknown as Settings;
}

/** 复习优先级层级（PRD v0.3 §5.3，与数据包 tier 对齐） */
export type CardTier = 'CORE' | 'ADVANCED' | 'EXTENDED';

export const TIER_WEIGHT: Record<CardTier, number> = {
  CORE: 1.0,
  ADVANCED: 0.7,
  EXTENDED: 0.4,
};
