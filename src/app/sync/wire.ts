import type { Card as FsrsCard } from 'ts-fsrs';
import type {
  Card,
  CardKind,
  CustomWord,
  ExamCode,
  RatingCode,
  ReviewLog,
  Settings,
  UserWordMeta,
} from '../../domain/types';
import type { CardRow, CustomWordRow, ReviewLogRow, SettingsRow } from '../../storage/db';
import type { PullRecord } from '../transactions';
import type { PullPlanWire, PushChange, WireChanges, WireRow } from './types';

/**
 * 线格式编解码：领域对象（camelCase / Date）与服务端列（snake_case / JSON 文本）互转。
 * 放在单独文件，方便单测与复用；服务端不感知领域语义，只按白名单列落库。
 */

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function bool(value: unknown): boolean {
  return value === true || value === 1 || value === '1';
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** ts-fsrs 卡片的 Date 字段在 JSON 里退化为字符串，拉取时必须还原 */
function decodeFsrs(input: unknown): FsrsCard | null {
  if (input === null || input === undefined || input === '') return null;
  let raw: Record<string, unknown>;
  try {
    raw = typeof input === 'string' ? (JSON.parse(input) as Record<string, unknown>) : (input as Record<string, unknown>);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object' || raw.due === undefined) return null;
  const { due, last_review, ...rest } = raw;
  const dueDate = new Date(String(due));
  if (Number.isNaN(dueDate.getTime())) return null;
  const lastDate = last_review ? new Date(String(last_review)) : null;
  return {
    ...(rest as unknown as FsrsCard),
    due: dueDate,
    ...(lastDate && !Number.isNaN(lastDate.getTime()) ? { last_review: lastDate } : {}),
  };
}

function decodeCard(row: WireRow): Card | null {
  const fsrs = decodeFsrs(row.fsrs);
  if (!fsrs) return null;
  return {
    id: str(row.id),
    exam: str(row.exam) as ExamCode,
    wordId: str(row.word_id),
    senseId: str(row.sense_id),
    kind: (str(row.kind) || 'PRIMARY') as CardKind,
    fsrs,
    suspended: bool(row.suspended),
    lastFirstReviewDay: typeof row.last_first_review_day === 'string' ? row.last_first_review_day : null,
  };
}

function decodeLog(row: WireRow): ReviewLog | null {
  const id = str(row.id);
  if (!id) return null;
  const fsrsBefore = decodeFsrs(row.fsrs_before);
  return {
    id,
    cardId: str(row.card_id),
    reviewedAt: num(row.reviewed_at),
    studyDay: str(row.study_day),
    rating: (str(row.rating) || 'GOOD') as RatingCode,
    prejudged: bool(row.prejudged),
    corrected: bool(row.corrected),
    sessionOnly: bool(row.session_only),
    durationMs: num(row.duration_ms),
    ...(fsrsBefore ? { fsrsBefore } : {}),
    firstReviewDayBefore: typeof row.first_review_day_before === 'string' ? row.first_review_day_before : null,
  };
}

function decodeMeta(row: WireRow): UserWordMeta | null {
  const wordId = str(row.word_id ?? row.id);
  if (!wordId) return null;
  return { wordId, starred: bool(row.starred), note: str(row.note), updatedAt: num(row.v) };
}

function decodeCustom(row: WireRow): CustomWord | null {
  const id = str(row.id);
  if (!id) return null;
  const source = typeof row.source_sentence === 'string' && row.source_sentence ? row.source_sentence : undefined;
  return {
    id,
    lemma: str(row.lemma),
    phonetic: str(row.phonetic),
    cn: str(row.cn),
    ...(source ? { sourceSentence: source } : {}),
    createdAt: num(row.created_at),
  };
}

function decodeSettings(row: WireRow): Settings | null {
  return {
    exam: str(row.exam) as ExamCode,
    examDate: str(row.exam_date),
    dayStartHour: num(row.day_start_hour),
    maxNewPerDay: num(row.max_new_per_day),
    maxReviewPerDay: num(row.max_review_per_day),
    excludeBasicWords: bool(row.exclude_basic_words),
    accent: str(row.accent) === 'us' ? 'us' : 'uk',
    autoPlayAudio: bool(row.auto_play_audio),
    dataPackVersion: str(row.data_pack_version),
    lastBackupAt: row.last_backup_at == null ? null : num(row.last_backup_at),
    schemaVersion: num(row.schema_version),
    // AI 配置是本机凭证，不参与同步（服务端也没有对应列）
    aiBaseUrl: '',
    aiApiKey: '',
    aiModel: '',
  };
}

function mapRows<T>(
  rows: WireRow[] | undefined,
  decode: (row: WireRow) => T | null,
  idOf: (row: WireRow) => string,
): PullRecord<T>[] {
  const out: PullRecord<T>[] = [];
  for (const row of rows ?? []) {
    const id = idOf(row);
    if (!id) continue;
    if (row.deleted) {
      out.push({ id, v: num(row.v), deleted: true, data: null });
      continue;
    }
    try {
      const data = decode(row);
      if (data !== null) out.push({ id, v: num(row.v), deleted: false, data });
    } catch {
      // 单行损坏不阻断整次同步：跳过该行，其它行照常合并
    }
  }
  return out;
}

export function toPullPlan(changes: WireChanges): PullPlanWire {
  const cards = mapRows(changes.cards, decodeCard, (r) => str(r.id));
  const reviewLogs = mapRows(changes.review_logs, decodeLog, (r) => str(r.id));
  const userWordMeta = mapRows(changes.user_word_meta, decodeMeta, (r) => str(r.word_id ?? r.id));
  const customWords = mapRows(changes.custom_words, decodeCustom, (r) => str(r.id));

  let settings: PullRecord<Settings> | null = null;
  const settingRow = changes.settings?.[0];
  if (settingRow) {
    if (settingRow.deleted) {
      settings = { id: 'default', v: num(settingRow.v), deleted: true, data: null };
    } else {
      const data = decodeSettings(settingRow);
      if (data) settings = { id: 'default', v: num(settingRow.v), deleted: false, data };
    }
  }

  return { cards, reviewLogs, userWordMeta, customWords, settings };
}

export function encodeCard(row: CardRow, v: number): PushChange {
  return {
    op: 'upsert',
    v,
    data: {
      id: row.id,
      exam: row.exam,
      word_id: row.wordId,
      sense_id: row.senseId,
      kind: row.kind,
      fsrs: JSON.stringify(row.fsrs),
      suspended: row.suspended ? 1 : 0,
      last_first_review_day: row.lastFirstReviewDay,
    },
  };
}

export function encodeLog(row: ReviewLogRow, v: number): PushChange {
  return {
    op: 'upsert',
    v,
    data: {
      id: row.id,
      card_id: row.cardId,
      reviewed_at: row.reviewedAt,
      study_day: row.studyDay,
      rating: row.rating,
      prejudged: row.prejudged ? 1 : 0,
      corrected: row.corrected ? 1 : 0,
      session_only: row.sessionOnly ? 1 : 0,
      duration_ms: row.durationMs,
      fsrs_before: row.fsrsBefore ? JSON.stringify(row.fsrsBefore) : null,
      first_review_day_before: row.firstReviewDayBefore ?? null,
    },
  };
}

export function encodeMeta(row: UserWordMeta, v: number): PushChange {
  return { op: 'upsert', v, data: { word_id: row.wordId, starred: row.starred ? 1 : 0, note: row.note } };
}

export function encodeCustom(row: CustomWordRow, v: number): PushChange {
  return {
    op: 'upsert',
    v,
    data: {
      id: row.id,
      lemma: row.lemma,
      phonetic: row.phonetic,
      cn: row.cn,
      source_sentence: row.sourceSentence ?? null,
      created_at: row.createdAt,
    },
  };
}

export function encodeSettings(row: SettingsRow, v: number): PushChange {
  return {
    op: 'upsert',
    v,
    data: {
      exam: row.exam,
      exam_date: row.examDate,
      day_start_hour: row.dayStartHour,
      max_new_per_day: row.maxNewPerDay,
      max_review_per_day: row.maxReviewPerDay,
      exclude_basic_words: row.excludeBasicWords ? 1 : 0,
      accent: row.accent,
      auto_play_audio: row.autoPlayAudio ? 1 : 0,
      data_pack_version: row.dataPackVersion,
      last_backup_at: row.lastBackupAt,
      schema_version: row.schemaVersion,
    },
  };
}
