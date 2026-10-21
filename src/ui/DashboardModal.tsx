import { useMemo } from 'react';
import type { Card, Settings } from '../domain/types';
import type { PackDictionary } from '../content/dictionary';
import type { Scheduler } from '../domain/scheduler';
import { DAY_MS, formatDay, parseDay, studyDayOf } from '../domain/clock';
import { computeDashboard } from '../app/dashboard';
import type { SpellingStats } from '../app/spellingUseCase';
import { ModalShell } from './ModalShell';
import { Button, ProgressBar, StatBlock } from './primitives';
import { formatMonthDay } from './format';

/** 学习仪表盘（S-04）：核心覆盖率、考试日预测、积压、近 7 日与到期分布。 */

export interface DashboardModalProps {
  open: boolean;
  cards: Card[];
  dictionary: PackDictionary;
  settings: Settings;
  scheduler: Scheduler;
  now: number;
  studyDayCounts: Array<{ studyDay: string; count: number }> | undefined;
  spelling: SpellingStats | undefined;
  onClose: () => void;
  onOpenPlacement: () => void;
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function DashboardModal({
  open,
  cards,
  dictionary,
  settings,
  scheduler,
  now,
  studyDayCounts,
  spelling,
  onClose,
  onOpenPlacement,
}: DashboardModalProps) {
  const stats = useMemo(
    () => computeDashboard({ cards, dictionary, exam: settings.exam, scheduler, now, settings }),
    [cards, dictionary, settings, scheduler, now],
  );

  const last7 = useMemo(() => {
    const map = new Map((studyDayCounts ?? []).map((d) => [d.studyDay, d.count]));
    const todayStart = parseDay(studyDayOf(now, settings.dayStartHour));
    return Array.from({ length: 7 }, (_, i) => {
      const ts = todayStart - (6 - i) * DAY_MS;
      const key = formatDay(new Date(ts));
      return { key, label: formatMonthDay(ts), count: map.get(key) ?? 0 };
    });
  }, [studyDayCounts, now, settings.dayStartHour]);

  const maxLast7 = Math.max(1, ...last7.map((d) => d.count));
  const maxNext7 = Math.max(1, ...stats.next7.map((d) => d.count));

  return (
    <ModalShell
      open={open}
      title="学习仪表盘"
      titleId="dashboard-title"
      onClose={onClose}
      widthClass="sm:max-w-200"
      footer={
        <>
          <Button variant="ghost" onClick={onOpenPlacement}>
            入门水平测试
          </Button>
          <Button variant="secondary" onClick={onClose}>
            关闭
          </Button>
        </>
      }
    >
      <section aria-label="核心覆盖率">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-emphasize text-fg-2">核心覆盖率</span>
          <span className="font-word text-2xl font-emphasize text-fg tabular-nums">{pct(stats.coverage)}</span>
        </div>
        <ProgressBar value={stats.masteredNow} max={Math.max(1, stats.coreTotal)} label={`核心覆盖率 ${pct(stats.coverage)}`} />
        <p className="mt-1 text-xs text-muted">
          核心卡 {stats.coreTotal} 张，当前 R ≥ 0.9 的有 {stats.masteredNow} 张。
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <StatBlock label="已学" value={stats.learned} caption={`共 ${stats.total} 张卡`} />
        <StatBlock label="今日到期" value={stats.dueNow} caption={stats.backlog > 0 ? `积压 ${stats.backlog} 张` : '无积压'} />
        <StatBlock
          label="考试日预测"
          value={stats.hasExamDate ? stats.predictedAtExam : '-'}
          caption={stats.hasExamDate ? `占比 ${pct(stats.predictedCoverage)}` : '未设置考期'}
        />
        <StatBlock label="拼写正确率" value={spelling && spelling.total > 0 ? pct(spelling.accuracy) : '-'} caption={spelling && spelling.total > 0 ? `${spelling.correct}/${spelling.total} 次` : '暂无练习'} />
      </div>

      {stats.hasExamDate && stats.learned > 0 && stats.atRisk > 0 ? (
        <p className="rounded-sm bg-warning-soft px-3 py-2 text-xs text-warning" role="status">
          考试日预计有 {stats.atRisk} 张核心卡的回忆概率低于 90%，建议提高每日复习上限或在考前过轮窗口前补强。
        </p>
      ) : null}

      <section aria-label="近 7 日学习量">
        <h3 className="mb-2 text-sm font-emphasize text-fg-2">近 7 日复习量</h3>
        {last7.every((d) => d.count === 0) ? (
          <p className="rounded-lg bg-warm px-3 py-4 text-center text-xs text-meta">还没有学习记录，完成第一张卡后这里会出现曲线。</p>
        ) : (
        <div className="flex h-24 items-end gap-1">
          {last7.map((d) => (
            <div key={d.key} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex w-full flex-1 items-end">
                <div
                  className="w-full rounded-t-sm bg-accent-soft"
                  style={{ height: `${Math.max(4, Math.round((d.count / maxLast7) * 100))}%` }}
                  aria-hidden
                />
              </div>
              <span className="font-word text-2xs text-meta tabular-nums">{d.label}</span>
              <span className="text-2xs text-muted tabular-nums">{d.count}</span>
            </div>
          ))}
        </div>
        )}
      </section>

      <section aria-label="未来 7 天到期">
        <h3 className="mb-2 text-sm font-emphasize text-fg-2">未来 7 天到期</h3>
        <ul className="flex flex-col gap-1">
          {stats.next7.map((d) => (
            <li key={d.day} className="flex items-center gap-2 text-xs">
              <span className="w-14 shrink-0 font-word text-meta tabular-nums">{d.day.slice(5)}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-warm">
                <span className="block h-full rounded-pill bg-accent" style={{ width: `${Math.round((d.count / maxNext7) * 100)}%` }} />
              </span>
              <span className="w-8 shrink-0 text-right text-muted tabular-nums">{d.count}</span>
            </li>
          ))}
        </ul>
      </section>
    </ModalShell>
  );
}
