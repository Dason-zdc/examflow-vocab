import { useMemo, useState } from 'react';
import type { Settings } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import type { PackDictionary } from '../content/dictionary';
import type { Scheduler } from '../domain/scheduler';
import { useCardsForExam, useSpellingStats, useStudyDayCounts } from '../app/queries';
import { pickPlacementWords } from '../app/placement';
import { suspendWords } from '../app/userWordsUseCase';
import { DashboardModal } from './DashboardModal';
import { PlacementTestModal } from './PlacementTestModal';

/** 仪表盘容器：把只读查询与入门测试的写操作收在一处，ExamFlowApp 只负责开关。 */

export interface DashboardContainerProps {
  open: boolean;
  db: ExamFlowDB;
  dictionary: PackDictionary;
  settings: Settings;
  scheduler: Scheduler;
  now: number;
  onClose: () => void;
  /** 入门测试写入后让会话重排 */
  onApplied: () => void;
}

export function DashboardContainer({ open, db, dictionary, settings, scheduler, now, onClose, onApplied }: DashboardContainerProps) {
  const cards = useCardsForExam(db, settings.exam);
  const dayCounts = useStudyDayCounts(db);
  const spelling = useSpellingStats(db);
  const [placementOpen, setPlacementOpen] = useState(false);

  const placementWords = useMemo(
    () => (cards ? pickPlacementWords(cards, dictionary, settings.exam) : []),
    [cards, dictionary, settings.exam],
  );

  if (!cards) return null;

  return (
    <>
      <DashboardModal
        open={open}
        cards={cards}
        dictionary={dictionary}
        settings={settings}
        scheduler={scheduler}
        now={now}
        studyDayCounts={dayCounts}
        spelling={spelling}
        onClose={onClose}
        onOpenPlacement={() => setPlacementOpen(true)}
      />
      <PlacementTestModal
        open={placementOpen}
        words={placementWords}
        onClose={() => setPlacementOpen(false)}
        onFinish={async (knownWordIds) => {
          await suspendWords(db, knownWordIds);
          setPlacementOpen(false);
          onApplied();
        }}
      />
    </>
  );
}
