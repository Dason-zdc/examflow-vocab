import type { DailyPlan } from '../domain/planner';
import type { Settings } from '../domain/types';
import type { CoverageStats } from '../app/queries';
import { Notice, Panel, ProgressBar, StatBlock } from './primitives';
import { Button } from './primitives';
import { ICON_SIZE, ICON_STROKE, AlertTriangle, Plus } from './icons';

/** 每日计划面板（UIUX P2）：统计 + 提示 + 核心覆盖率 + 加学 */

export interface DailyPlanPanelProps {
  plan: DailyPlan | null;
  settings: Settings;
  coverage: CoverageStats | undefined;
  extraNewToday: number;
  onExtraNew: (n: number) => void;
  onOpenSettings: () => void;
}

export function DailyPlanPanel({ plan, settings, coverage, extraNewToday, onExtraNew, onOpenSettings }: DailyPlanPanelProps) {
  if (!settings.examDate) {
    return (
      <Panel title="今日计划">
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-body text-muted">先设置考试日期，才能生成每日计划。</p>
          <Button variant="primary" onClick={onOpenSettings}>
            设置考试日期
          </Button>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="今日计划" caption={`考试日 ${settings.examDate}`}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <StatBlock
            label="新卡"
            value={`${coverage?.newLearnedToday ?? 0} / ${plan?.newCount ?? 0}`}
            caption={`上限 ${settings.maxNewPerDay}${extraNewToday > 0 ? `（含加学 ${extraNewToday}）` : ''}`}
          />
          <StatBlock label="复习" value={`${coverage?.reviewedToday ?? 0} / ${plan?.reviewCount ?? 0}`} caption={`上限 ${settings.maxReviewPerDay}`} />
        </div>

        {plan?.warnings.map((w) => (
          <Notice
            key={w.code}
            tone={w.code === 'CANNOT_FINISH' || w.code === 'BACKLOG' ? 'warn' : w.code === 'OVERRUN_WINDOW' ? 'danger' : 'plain'}
            icon={w.code === 'EXAM_PAST' ? undefined : <AlertTriangle size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden className="mt-0.5 shrink-0" />}
          >
            {w.message}
          </Notice>
        ))}

        <div className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted">考试日预测掌握核心考点</span>
            <span className="font-word text-xs text-fg-2 tabular-nums">
              {coverage ? `${coverage.mastered} / ${coverage.coreTotal}` : '—'}
            </span>
          </div>
          <ProgressBar
            value={coverage?.mastered ?? 0}
            max={coverage?.coreTotal ?? 0}
            label={coverage ? `考试日预测掌握核心考点 ${coverage.mastered} / ${coverage.coreTotal}` : '核心考点覆盖率'}
          />
          <p className="text-2xs text-meta">核心卡片中记忆稳定度对应回忆概率 ≥ 90% 的数量（北极星指标口径）。</p>
        </div>

        <Button variant="secondary" onClick={() => onExtraNew(5)} disabled={!plan || plan.newCount === 0}>
          <Plus size={ICON_SIZE.inline} strokeWidth={ICON_STROKE} aria-hidden />
          加学 5 张新卡
        </Button>
        {settings.excludeBasicWords ? <p className="text-2xs text-meta">已排除基础词（高考及以下词汇）。</p> : null}
      </div>
    </Panel>
  );
}
