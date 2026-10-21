#!/usr/bin/env node
/**
 * 门禁聚合执行器：npm run check
 *
 * 串行执行六条门禁，任一违反即整体非零退出。
 * 每条门禁独立可执行：node scripts/check-xxx.mjs（便于只跑一条）。
 *
 * 用法
 *   npm run check                      全量
 *   node scripts/run-checks.mjs --only=emoji,color
 *   node scripts/run-checks.mjs --json
 *   node scripts/run-checks.mjs --strict-symbol   # 传给 emoji 门禁：连 ★☆ 也禁
 */

import { report, parseArgv } from './_common.mjs';

import { run as fileLength } from './check-file-length.mjs';
import { run as noEmoji } from './check-no-emoji.mjs';
import { run as noColor } from './check-no-hardcoded-color.mjs';
import { run as iconImport } from './check-icon-import.mjs';
import { run as txBoundary } from './check-transaction-boundary.mjs';
import { run as entrySize } from './check-entry-size.mjs';

const { flags, kv } = parseArgv();

const CHECKS = [
  { key: 'length', name: '门禁 1 · 单文件行数', run: () => fileLength() },
  { key: 'emoji', name: '门禁 2 · 禁止 emoji', run: () => noEmoji({ strictSymbol: flags.has('strict-symbol') }) },
  { key: 'color', name: '门禁 3 · 禁止硬编码颜色', run: () => noColor() },
  { key: 'icon', name: '门禁 4 · 图标唯一出口与尺寸', run: () => iconImport() },
  { key: 'tx', name: '门禁 5 · Dexie 事务边界', run: () => txBoundary() },
  { key: 'entry', name: '门禁 6 · 入口只装配', run: () => entrySize() },
];

const only = kv.only ? kv.only.split(',').map((s) => s.trim()) : null;
const asJson = flags.has('json');

const selected = only ? CHECKS.filter((c) => only.includes(c.key)) : CHECKS;
if (selected.length === 0) {
  console.error(`未匹配到门禁：${only.join(', ')}。可选：${CHECKS.map((c) => c.key).join(', ')}`);
  process.exit(2);
}

let exitCode = 0;
const summary = [];

for (const c of selected) {
  let items;
  try {
    items = c.run();
  } catch (err) {
    console.log(`\nFAIL  ${c.name}`);
    console.log(`      门禁自身执行异常：${err && err.stack ? err.stack : err}`);
    exitCode = 1;
    summary.push({ key: c.key, name: c.name, pass: false, violations: 0, error: String(err) });
    continue;
  }
  const code = asJson ? 0 : report(c.name, items);
  if (code !== 0) exitCode = 1;
  summary.push({
    key: c.key,
    name: c.name,
    pass: items.every((i) => i.rule === 'INFO'),
    violations: items.filter((i) => i.rule !== 'INFO').length,
    infos: items.filter((i) => i.rule === 'INFO').length,
  });
}

console.log(`\n${'='.repeat(64)}`);
console.log(`质量门禁汇总：${summary.filter((s) => s.pass).length}/${summary.length} 通过`);
for (const s of summary) {
  console.log(`  ${s.pass ? 'PASS' : 'FAIL'}  ${s.name}  (违反 ${s.violations} / 提示 ${s.infos ?? 0})`);
}
console.log('='.repeat(64));

if (asJson) {
  console.log('\nJSON 输出：');
  console.log(JSON.stringify(summary, null, 2));
}

if (exitCode !== 0) {
  console.log('\n门禁未通过。按上方「修复」指引逐条处理后重跑：npm run check');
} else {
  console.log('\n全部门禁通过。');
}
process.exit(exitCode);
