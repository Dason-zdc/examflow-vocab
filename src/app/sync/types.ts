import type { Card, CustomWord, ReviewLog, Settings, UserWordMeta } from '../../domain/types';
import type { PullRecord } from '../transactions';

export interface AuthResponse {
  token: string;
  userId: string;
  username: string;
}

/** 服务端线格式行（snake_case；fsrs 字段为 JSON 文本） */
export interface WireRow {
  id?: string;
  v: number;
  deleted: boolean;
  [key: string]: unknown;
}

export interface WireChanges {
  settings?: WireRow[];
  cards?: WireRow[];
  review_logs?: WireRow[];
  user_word_meta?: WireRow[];
  custom_words?: WireRow[];
}

export interface PushChange {
  op: 'upsert' | 'delete';
  v: number;
  data?: Record<string, unknown>;
}

export interface PushChanges {
  settings: PushChange[];
  cards: PushChange[];
  review_logs: PushChange[];
  user_word_meta: PushChange[];
  custom_words: PushChange[];
}

export type PullPlanWire = {
  cards: PullRecord<Card>[];
  reviewLogs: PullRecord<ReviewLog>[];
  userWordMeta: PullRecord<UserWordMeta>[];
  customWords: PullRecord<CustomWord>[];
  settings: PullRecord<Settings> | null;
};

export type SyncRunStatus = 'disabled' | 'ok' | 'error';

export interface SyncRunResult {
  status: SyncRunStatus;
  applied: number;
  pushed: number;
  error?: string;
}
