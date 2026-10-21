import type { Sense, Settings } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import type { DailyPlan } from '../domain/planner';
import type { CoverageStats } from '../app/queries';
import { DailyPlanPanel } from './DailyPlanPanel';
import { BackupPanel } from './BackupPanel';
import { HotkeyPanel } from './HotkeyPanel';
import { AiTutorPanel } from './AiTutorPanel';

/** 学习页右栏：每日计划 / 备份 / 快捷键 / AI 私教。抽出来是为了让 StudyView 只做编排。 */
export interface StudySidebarProps {
  plan: DailyPlan | null;
  settings: Settings;
  coverage: CoverageStats | undefined;
  persisted: boolean | undefined;
  extraNewToday: number;
  onExtraNew: (n: number) => void;
  onOpenSettings: () => void;
  onExport: () => Promise<void>;
  onImport: (file: File) => Promise<void>;
  ai: { word: PackWord; sense: Sense; sentence?: string; cardId: string; onAppendNote: (text: string) => void } | null;
}

export function StudySidebar({
  plan,
  settings,
  coverage,
  persisted,
  extraNewToday,
  onExtraNew,
  onOpenSettings,
  onExport,
  onImport,
  ai,
}: StudySidebarProps) {
  return (
    <aside className="flex flex-col gap-4" aria-label="学习侧栏">
      <DailyPlanPanel
        plan={plan}
        settings={settings}
        coverage={coverage}
        extraNewToday={extraNewToday}
        onExtraNew={onExtraNew}
        onOpenSettings={onOpenSettings}
      />
      <BackupPanel settings={settings} persisted={persisted} onExport={onExport} onImport={onImport} />
      {ai ? (
        <AiTutorPanel
          settings={settings}
          word={ai.word}
          sense={ai.sense}
          sentence={ai.sentence}
          cardId={ai.cardId}
          onAppendNote={ai.onAppendNote}
          onOpenSettings={onOpenSettings}
        />
      ) : (
        <HotkeyPanel />
      )}
      {ai ? <HotkeyPanel /> : null}
    </aside>
  );
}
