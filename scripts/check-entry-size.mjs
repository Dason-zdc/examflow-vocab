#!/usr/bin/env node
/**
 * 门禁 6：入口文件只装配
 *
 * 规则（来源：代码组织规范 §4 + docs/02-ARCHITECTURE.md §3.4）
 *   R1  src/main.tsx、src/App.tsx 有效行 < 100
 *   R2  入口不得出现业务逻辑关键字（import 行与注释行不参与判定）：
 *       FSRS / scheduler / schedule / planner / sessionQueue / reviewCommitter /
 *       cardFactory / Dexie / db. / dueAt / Rating / commit( / rating
 *       命中即判定「业务写进了入口」。
 *   R3  入口不得直接 import src/storage/**（读写一律经 src/app 用例与 queries）
 *
 * 为什么
 *   入口一旦开始承载分支与计算，就会长成巨型文件且无法单测。入口的职责只有：
 *   挂载 Provider、挂载路由/视图、启动。
 *
 * 用法：node scripts/check-entry-size.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, readText, lines, effectiveLines, violation, info, report, isMain } from './_common.mjs';

const ENTRY_FILES = ['src/main.tsx', 'src/main.ts', 'src/App.tsx', 'src/App.ts'];
const ENTRY_MAX = 100;

const BIZ_KEYWORDS = [
  'FSRS', 'fsrs(', 'scheduler', 'schedule(', 'planner', 'sessionQueue', 'reviewCommitter',
  'cardFactory', 'Dexie', 'db.', 'dueAt', 'Rating', 'commit(', 'rating',
];

const STORAGE_IMPORT_RE = /from\s+['"][^'"]*(?:storage|repositories)[^'"]*['"]/;

export function run() {
  const items = [];
  let found = 0;

  for (const rel of ENTRY_FILES) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) continue;
    found += 1;
    const text = readText(rel);
    const ls = lines(text);

    const eff = effectiveLines(text);
    if (eff >= ENTRY_MAX) {
      items.push(
        violation({
          file: rel,
          line: null,
          rule: `R1 入口文件有效行 < ${ENTRY_MAX}`,
          found: `有效行 ${eff}（总行 ${ls.length}）`,
          expected: `有效行 < ${ENTRY_MAX}`,
          fix: '入口只做装配：挂载 Provider / 路由 / 启动。分支与计算下沉到 src/app 用例或 src/domain 纯函数。',
        }),
      );
    }

    for (let i = 0; i < ls.length; i += 1) {
      const raw = ls[i];
      const trimmed = raw.trim();
      if (trimmed === '') continue;
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;

      // R3 入口不得直连存储层
      if (/^\s*import\b/.test(raw) && STORAGE_IMPORT_RE.test(raw)) {
        items.push(
          violation({
            file: rel,
            line: i + 1,
            rule: 'R3 入口不得直接 import src/storage/**',
            found: trimmed,
            expected: '读写一律经 src/app/queries.ts（读）与 src/app 用例（写）',
            fix: '改为 src/app/queries.ts 或对应用例导出的函数。',
          }),
        );
        continue;
      }

      // R2 业务关键字（跳过 import 行：import 名字里可能带 Provider 之类的合规词）
      if (/^\s*import\b/.test(raw)) continue;
      const hit = BIZ_KEYWORDS.find((k) => raw.includes(k));
      if (hit) {
        items.push(
          violation({
            file: rel,
            line: i + 1,
            rule: 'R2 入口不得出现业务逻辑',
            found: `命中业务关键字 "${hit}"：${trimmed}`,
            expected: '入口只有装配语句（createRoot / render / Provider / 路由挂载）',
            fix: `把这段逻辑移到 src/app/ 用例（如 reviewUseCase.ts）或 src/domain/ 纯函数，入口只保留调用。`,
          }),
        );
      }
    }
  }

  if (found === 0) items.push(info(ENTRY_FILES.join(', '), '入口文件尚不存在，本次跳过'));
  else items.push(info(`已检查 ${found} 个入口文件`, `有效行上限 ${ENTRY_MAX}`));

  return items;
}

if (isMain(import.meta.url)) {
  process.exit(report('门禁 6 · 入口只装配', run()));
}
