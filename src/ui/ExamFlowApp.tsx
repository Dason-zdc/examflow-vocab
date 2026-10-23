import { useEffect, useRef, useState } from 'react';
import type { ExamCode, Settings } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import { StudySessionProvider, useStudySession } from '../app/StudySessionProvider';
import { createScheduler } from '../domain/scheduler';
import { daysToExam } from '../domain/clock';
import { AppHeader } from './AppHeader';
import { StudyView } from './StudyView';
import { VocabBookView } from './VocabBookView';
import { DictView } from './DictView';
import { SettingsModal } from './SettingsModal';
import { DashboardContainer } from './DashboardContainer';
import { useExamFlow } from './useExamFlow';

/** 应用容器：装配数据编排 hook + Provider + 视图路由。业务在 app/domain 层，这里只组装。 */

export function ExamFlowApp() {
  const flow = useExamFlow();
  const [searchQuery, setSearchQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const prevRevision = useRef(flow.revision);

  async function submitSettings(next: Settings) {
    setSaving(true);
    try {
      await flow.submitSettings(next);
    } finally {
      setSaving(false);
    }
  }

  if (!flow.db || !flow.settings || !flow.dictionary) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-20 text-center" role="status">
          <p className="text-md text-muted">正在打开本地数据库并加载词书…</p>
          {flow.packError ? <p className="max-w-96 text-sm text-danger">{flow.packError}</p> : null}
        </div>
      </Shell>
    );
  }

  const db = flow.db;
  const settings = flow.settings;
  const dictionary = flow.dictionary;

  // 加学新卡：临时抬高当日新卡上限（不落库，跨日切后自然失效）
  const effectiveSettings: Settings = { ...settings, maxNewPerDay: settings.maxNewPerDay + flow.extraNewToday };

  return (
    <Shell>
      <StudySessionProvider db={db} dictionary={dictionary} settings={effectiveSettings} key={settings.exam}>
        <Chrome
          flow={flow}
          db={db}
          settings={settings}
          dictionary={dictionary}
          searchQuery={searchQuery}
          onSearch={(q) => {
            setSearchQuery(q);
            // 词典页就地过滤；其余视图沿用「搜索即进词库」的既有交互
            if (flow.view !== 'dict') flow.setView('vocab');
          }}
          prevRevision={prevRevision}
        />
      </StudySessionProvider>
      <SettingsModal open={flow.settingsOpen} settings={settings} saving={saving} sync={flow.sync} onClose={() => flow.setSettingsOpen(false)} onSave={submitSettings} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-toast focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:text-fg"
      >
        跳到主要内容
      </a>
      {children}
    </div>
  );
}

interface ChromeProps {
  flow: ReturnType<typeof useExamFlow>;
  db: ExamFlowDB;
  settings: Settings;
  dictionary: PackDictionary;
  searchQuery: string;
  onSearch: (q: string) => void;
  prevRevision: React.MutableRefObject<number>;
}

/** 外壳 + 路由：需要会话上下文（进度条、自动开始），故置于 Provider 内 */
function Chrome({ flow, db, settings, dictionary, searchQuery, onSearch, prevRevision }: ChromeProps) {
  const session = useStudySession();
  const scheduler = createScheduler();

  // 数据就绪且停留在学习页时自动开始本轮
  useEffect(() => {
    if (flow.ready && flow.view === 'study' && session.state.phase === 'idle' && !session.state.building) {
      void session.start();
    }
  }, [flow.ready, flow.view, session]);

  // 设置保存后重排队列（PRD 5.3：计划参数变更触发重排）
  useEffect(() => {
    if (flow.revision === prevRevision.current) return;
    prevRevision.current = flow.revision;
    if (flow.view === 'study' && !session.state.building) void session.start();
  }, [flow.revision, flow.view, prevRevision, session]);

  const progress =
    flow.coverage && flow.view === 'study'
      ? {
          done: flow.coverage.reviewedToday + flow.coverage.newLearnedToday,
          total: (session.state.plan?.reviewCount ?? 0) + (session.state.plan?.newCount ?? 0),
        }
      : null;

  /*
   * 空 examDate 时不得求值 daysToExam：parseDay('') 会抛错，
   * 而 render 期抛错会卸载整棵 React 树（新用户首屏白屏）。这里与 import 的
   * daysToExam 区分命名，显式走 null 分支。
   */
  const daysLeft = settings.examDate ? daysToExam(settings.examDate, flow.now, settings.dayStartHour) : null;

  return (
    <>
      <AppHeader
        settings={settings}
        daysToExam={daysLeft}
        progress={progress}
        view={flow.view}
        exams={flow.availableExams}
        searchQuery={searchQuery}
        onSearch={onSearch}
        onView={flow.setView}
        onSwitchExam={(exam: ExamCode) => void flow.switchExam(exam)}
        onOpenSettings={() => flow.setSettingsOpen(true)}
        onOpenDashboard={() => flow.setDashboardOpen(true)}
      />
      <main id="main" className="mx-auto max-w-container px-3 pb-20 pt-4 md:px-6 md:pb-10">
        {!settings.examDate ? (
          <div className="rounded-lg border border-line bg-surface px-6 py-16 text-center">
            <h1 className="text-xl font-emphasize text-fg">先设置考试日期</h1>
            <p className="mt-2 text-md leading-body text-muted">设置后即可生成每日计划并开始学习。</p>
          </div>
        ) : flow.view === 'study' ? (
          <StudyView
            db={db}
            dictionary={dictionary}
            settings={settings}
            scheduler={scheduler}
            now={flow.now}
            coverage={flow.coverage}
            persisted={flow.persisted}
            extraNewToday={flow.extraNewToday}
            onExtraNew={flow.addExtraNew}
            onOpenSettings={() => flow.setSettingsOpen(true)}
            onExport={flow.exportBackupFile}
            onImport={flow.importBackupFile}
          />
        ) : flow.view === 'vocab' ? (
          <VocabBookView db={db} exam={settings.exam} dictionary={dictionary} onReset={flow.resetProgress} initialQuery={searchQuery} />
        ) : (
          <DictView
            db={db}
            exam={settings.exam}
            inPack={(lemma) => Boolean(dictionary.getWord(lemma))}
            initialQuery={searchQuery}
          />
        )}
      </main>

      <DashboardContainer
        open={flow.dashboardOpen}
        db={db}
        dictionary={dictionary}
        settings={settings}
        scheduler={scheduler}
        now={flow.now}
        onClose={() => flow.setDashboardOpen(false)}
        onApplied={flow.refreshPlan}
      />
    </>
  );
}
