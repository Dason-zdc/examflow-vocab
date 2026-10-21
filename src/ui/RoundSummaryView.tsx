import type { RoundSummary } from '../domain/sessionQueue';
import { Button } from './primitives';
import { CheckCircle2, Hourglass } from './icons';
import { ICON_STROKE } from './icons';

/** 本轮小结（UIUX P9）：队列清空后的终态面板 */

export interface RoundSummaryViewProps {
  summary: RoundSummary;
  remainingToday: number;
  onStartNext: () => void;
  onExtraNew: (n: number) => void;
  onUndo: () => void;
  undoAvailable: boolean;
}

export function RoundSummaryView({ summary, remainingToday, onStartNext, onExtraNew, onUndo, undoAvailable }: RoundSummaryViewProps) {
  const allDone = summary.pending === 0;
  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-line bg-surface px-6 py-10 text-center">
      {allDone ? (
        <CheckCircle2 size={32} strokeWidth={ICON_STROKE} aria-hidden className="text-success" />
      ) : (
        <Hourglass size={32} strokeWidth={ICON_STROKE} aria-hidden className="text-warning" />
      )}
      <h2 className="text-xl font-emphasize text-fg">{allDone ? '本轮完成' : '本轮其他卡片已完成'}</h2>
      <p className="text-md leading-body text-fg-2">
        本轮通关 {summary.passed} 张，待巩固 {summary.pending} 张。
      </p>
      {!allDone ? (
        <p className="max-w-72 text-sm leading-body text-muted">
          还有 {summary.pending} 张待巩固卡片。为避免连续重复，它们需要与上次出现间隔至少 3 张卡和 60 秒。
        </p>
      ) : null}
      <p className="text-sm text-muted">
        {remainingToday > 0 ? `今日计划还剩 ${remainingToday} 张。下一轮不会提前拉入未到期的卡片。` : '今日计划已完成，不会提前拉入未到期的卡片。'}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="primary" onClick={onStartNext}>
          开始下一轮
        </Button>
        <Button variant="secondary" onClick={() => onExtraNew(5)}>
          加学 5 张新卡
        </Button>
        <Button variant="ghost" onClick={onUndo} disabled={!undoAvailable}>
          撤销上次评分 <span className="font-word text-2xs text-meta">Z</span>
        </Button>
      </div>
    </div>
  );
}
