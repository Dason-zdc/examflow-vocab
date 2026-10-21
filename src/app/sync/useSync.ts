import { useCallback, useEffect, useRef, useState } from 'react';
import type { ExamFlowDB, SyncStateRow } from '../../storage/db';
import {
  EMPTY_SYNC_STATE,
  loadSyncState,
  loginAccount,
  logoutAccount,
  registerAccount,
  syncNow,
} from './syncEngine';

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error';

export interface SyncController {
  state: SyncStateRow;
  phase: SyncPhase;
  error: string | null;
  register: (username: string, password: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  syncNow: () => Promise<void>;
}

const AUTO_SYNC_MS = 30_000;

/** 同步编排 hook：账号、手动/自动同步、状态。UI 只消费这里的返回值。 */
export function useSync(db: ExamFlowDB | null): SyncController {
  const [state, setState] = useState<SyncStateRow>(EMPTY_SYNC_STATE);
  const [phase, setPhase] = useState<SyncPhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const dbRef = useRef<ExamFlowDB | null>(db);
  dbRef.current = db;

  const refresh = useCallback(async () => {
    const current = dbRef.current;
    if (!current) return;
    setState(await loadSyncState(current));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, db]);

  const runSync = useCallback(async () => {
    const current = dbRef.current;
    if (!current || busy.current) return;
    busy.current = true;
    setPhase('syncing');
    setError(null);
    try {
      const result = await syncNow(current);
      setState(await loadSyncState(current));
      if (result.status === 'error') {
        setPhase('error');
        setError(result.error ?? '同步失败');
      } else {
        setPhase('ok');
      }
    } catch (err) {
      setPhase('error');
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busy.current = false;
    }
  }, []);

  const submit = useCallback(
    async (kind: 'register' | 'login', username: string, password: string) => {
      const current = dbRef.current;
      if (!current) return;
      setPhase('syncing');
      setError(null);
      try {
        if (kind === 'register') await registerAccount(current, username, password);
        else await loginAccount(current, username, password);
        setState(await loadSyncState(current));
        await runSync();
      } catch (err) {
        setPhase('error');
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [runSync],
  );

  const register = useCallback((username: string, password: string) => submit('register', username, password), [submit]);
  const login = useCallback((username: string, password: string) => submit('login', username, password), [submit]);

  const logout = useCallback(async () => {
    const current = dbRef.current;
    if (!current) return;
    await logoutAccount(current);
    setState(await loadSyncState(current));
    setPhase('idle');
    setError(null);
  }, []);

  // 自动同步：已登录时每 30 秒一跳，网络恢复时立即补一次
  useEffect(() => {
    if (!db || !state.enabled || !state.token) return;
    const timer = window.setInterval(() => {
      if (navigator.onLine) void runSync();
    }, AUTO_SYNC_MS);
    const onOnline = () => void runSync();
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
    };
  }, [db, state.enabled, state.token, runSync]);

  return { state, phase, error, register, login, logout, syncNow: runSync };
}
