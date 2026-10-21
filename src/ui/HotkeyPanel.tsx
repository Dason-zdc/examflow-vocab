import { Panel } from './primitives';
import { Kbd } from './primitives';

/** 快捷键面板（UIUX P10）：桌面右侧栏常驻，移动端抽屉 */

const ROWS: Array<[string, string[]]> = [
  ['看答案 / 下一个', ['Space']],
  ['不认识 / 模糊 / 认识', ['1', '2', '3']],
  ['下一个', ['→', 'Enter']],
  ['发音 / 另一口音', ['C', '⇧', 'C']],
  ['词根 / 形近词', ['R', 'F']],
  ['斩词', ['X']],
  ['撤销上次评分', ['Z']],
  ['关闭弹窗', ['Esc']],
];

export function HotkeyPanel() {
  return (
    <Panel title="快捷键">
      <dl className="grid grid-cols-1 gap-y-2">
        {ROWS.map(([label, keys]) => (
          <div key={label} className="flex items-center justify-between gap-2">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="flex items-center gap-1">
              {keys.map((k, i) => (
                <Kbd key={`${k}-${i}`}>{k}</Kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-2xs text-meta">快捷键仅在桌面端（≥768px）且无弹窗打开时生效。</p>
    </Panel>
  );
}
