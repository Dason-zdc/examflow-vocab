import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ExamCode, Settings } from '../domain/types';
import { openDatabase, requestPersistentStorage, type ExamFlowDB } from '../storage/db';
import { loadPackWithRecovery, type LoadedPack } from '../content/packRecovery';
import { PackDictionary } from '../content/dictionary';
import { useSettings, useCoverage, useCustomWords, type CoverageStats } from '../app/queries';
import { customWordToPackWord } from '../content/customWord';
import { ensureCardsForExam, ensureSettings, saveSettings } from '../app/onboardingUseCase';
import { importBackup } from '../app/backupUseCase';
import { exportBackup, parseBackup, serializeBackup } from '../storage/backupService';
import { resetExamProgress } from '../app/userWordsUseCase';
import { useSync, type SyncController } from '../app/sync/useSync';
import { useAvailableExams } from '../app/useAvailableExams';
import { DEFAULT_SETTINGS } from '../domain/types';
import { studyDayOf } from '../domain/clock';
import { createScheduler } from '../domain/scheduler';

/** 应用数据编排：库打开 → 设置 → 数据包 → 覆盖率 → 各写用例。UI 只消费这里的返回值。 */

/** scheduler 单例（覆盖率查询用；retrievability 无参数依赖） */
const SCHEDULER = createScheduler();

export type ViewKey = 'study' | 'vocab';

export interface ExamFlowController {
  ready: boolean;
  packError: string | null;
  db: ExamFlowDB | null;
  settings: Settings | undefined;
  dictionary: PackDictionary | null;
  coverage: CoverageStats | undefined;
  persisted: boolean | undefined;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  now: number;
  studyDay: string;
  extraNewToday: number;
  addExtraNew: (n: number) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  submitSettings: (next: Settings) => Promise<void>;
  switchExam: (exam: ExamCode) => Promise<void>;
  exportBackupFile: () => Promise<void>;
  importBackupFile: (file: File) => Promise<void>;
  resetProgress: () => Promise<void>;
  /** 设置保存后由 UI 触发会话重建 */
  revision: number;
  /** 云同步：账号、状态与手动同步 */
  sync: SyncController;
  /** 已发布数据包的考试（只有这些能切换） */
  availableExams: ExamCode[];
  dashboardOpen: boolean;
  setDashboardOpen: (open: boolean) => void;
  /** 进度被外部改写（如入门测试）后让会话重排 */
  refreshPlan: () => void;
}

export function useExamFlow(): ExamFlowController {
  const [db, setDb] = useState<ExamFlowDB | null>(null);
  const [pack, setPack] = useState<LoadedPack | null>(null);
  const [packError, setPackError] = useState<string | null>(null);
  const [persisted, setPersisted] = useState<boolean | undefined>(undefined);
  const [view, setView] = useState<ViewKey>('study');
  const [extraNewToday, setExtraNewToday] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dashboardOpen, setDashboardOpen] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tick, setTick] = useState(() => Date.now());
  const ensuredRef = useRef<string>('');

  // 1. 打开数据库 + 持久化存储
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const opened = await openDatabase();
      if (cancelled) {
        opened.close();
        return;
      }
      setDb(opened);
      void requestPersistentStorage().then(setPersisted);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 2. 设置行不存在时写入默认值（examDate 为空 → UI 引导设置）
  const settings = useSettings(db);
  useEffect(() => {
    if (!db || settings !== undefined) return;
    void ensureSettings(db, DEFAULT_SETTINGS, '');
  }, [db, settings]);

  // 首次进入且未设置考试日期：自动打开设置弹窗
  useEffect(() => {
    if (settings && settings.examDate === '') setSettingsOpen(true);
  }, [settings]);

  const exam = settings?.exam;
  const excludeBasic = settings?.excludeBasicWords ?? true;
  const availableExams = useAvailableExams(exam ?? 'IELTS');

  // 3. 加载数据包 + 首次建卡（按 exam+version 幂等）
  useEffect(() => {
    if (!db || !exam) return;
    let cancelled = false;
    setPackError(null);
    void (async () => {
      try {
        // 用带自愈的入口：缓存中毒（版本串代）时清缓存并只重载一次，而不是把用户卡死在报错上
        const loaded = await loadPackWithRecovery({ exam, db });
        if (cancelled) return;
        setPack(loaded);
        const dict = new PackDictionary(loaded.words, loaded.lemmaMap);
        const key = `${exam}@${loaded.version}`;
        if (ensuredRef.current !== key) {
          ensuredRef.current = key;
          await ensureCardsForExam(db, dict, exam, { excludeBasic });
        }
      } catch (err) {
        if (!cancelled) setPackError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, exam]);

  const customWords = useCustomWords(db);
  const dictionary = useMemo(() => {
    if (!pack) return null;
    const base = new PackDictionary(pack.words, pack.lemmaMap);
    if (!exam || !customWords || customWords.length === 0) return base;
    // 自定义生词并入词典：点词即查加入的词也能进入学习卡视图
    return base.withExtraWords(customWords.map((word) => customWordToPackWord(word, exam)));
  }, [pack, customWords, exam]);

  // 4. 时钟：30s 一跳，刷新到期标签与覆盖率
  useEffect(() => {
    const t = window.setInterval(() => setTick(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const now = tick;
  const studyDay = useMemo(() => studyDayOf(now, settings?.dayStartHour ?? 4), [now, settings?.dayStartHour]);

  const coverage = useCoverage(db, exam ?? 'IELTS', dictionary, SCHEDULER, now, studyDay);
  const sync = useSync(db);

  const ready = Boolean(db && settings && dictionary && settings.examDate);

  const submitSettings = useCallback(
    async (next: Settings) => {
      if (!db) return;
      await saveSettings(db, next);
      setSettingsOpen(false);
      setRevision((v) => v + 1);
      if (next.exam !== settings?.exam) setExtraNewToday(0);
    },
    [db, settings?.exam],
  );

  const switchExam = useCallback(
    async (next: ExamCode) => {
      if (!db || !settings || next === settings.exam) return;
      await saveSettings(db, { ...settings, exam: next });
      setExtraNewToday(0);
    },
    [db, settings],
  );

  const exportBackupFile = useCallback(async () => {
    if (!db || !settings) return;
    const file = await exportBackup(db);
    const blob = new Blob([serializeBackup(file)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `examflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await saveSettings(db, { ...settings, lastBackupAt: Date.now() });
  }, [db, settings]);

  const importBackupFile = useCallback(
    async (file: File) => {
      if (!db) return;
      const text = await file.text();
      const parsed = parseBackup(text);
      // PRD §7.2：先原生确认；确认后才自动导出当前数据，再执行导入
      const ok = window.confirm('导入将覆盖当前进度。导入前会先自动导出一份当前数据作为备份，是否继续？');
      if (!ok) return;
      await importBackup(db, parsed, {
        mode: 'overwrite',
        onBeforeImport: (current) => {
          const blob = new Blob([serializeBackup(current)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `examflow-before-import-${Date.now()}.json`;
          a.click();
          URL.revokeObjectURL(url);
        },
      });
      setRevision((v) => v + 1);
    },
    [db],
  );

  const resetProgress = useCallback(async () => {
    if (!db || !settings || !dictionary) return;
    await resetExamProgress(db, settings.exam, dictionary, { excludeBasic: settings.excludeBasicWords });
    setRevision((v) => v + 1);
  }, [db, settings, dictionary]);

  const addExtraNew = useCallback((n: number) => setExtraNewToday((v) => v + n), []);
  const refreshPlan = useCallback(() => setRevision((v) => v + 1), []);

  return {
    ready,
    packError,
    db,
    settings,
    dictionary,
    coverage,
    persisted,
    view,
    setView,
    now,
    studyDay,
    extraNewToday,
    addExtraNew,
    settingsOpen,
    setSettingsOpen,
    submitSettings,
    switchExam,
    exportBackupFile,
    importBackupFile,
    resetProgress,
    revision,
    sync,
    availableExams,
    dashboardOpen,
    setDashboardOpen,
    refreshPlan,
  };
}
