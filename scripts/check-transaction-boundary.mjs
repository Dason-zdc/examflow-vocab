#!/usr/bin/env node
/**
 * 门禁 5：Dexie 事务边界唯一化
 *
 * 规则（来源：docs/02-ARCHITECTURE.md §7.3 / ADR-003）
 *   R1  `db.transaction(...)` 全项目只允许出现在 src/app/transactions.ts（或 .tsx）。
 *       其它任何文件开事务即失败。
 *   R2  同样禁止 Dexie 的 `db.transaction` 变体：`.transaction('rw'` / `.transaction('r'` /
 *       `new Transaction` / `Dexie.transaction`。
 *
 * 为什么这条是硬门禁
 *   事务体内 await 任何非 Dexie Promise 会触发隐式提交并抛 TransactionInactiveError，
 *   或更糟——静默丢事务。事务出口散落各处时，这个问题无法靠 review 发现。
 *   收敛到单一文件后，只要保证「事务体内只有 Dexie 操作与纯计算」这一条纪律即可。
 *
 * 边界：src/app/transactions.ts 尚不存在时记 INFO，不判失败（增量开发期）。
 *
 * 用法：node scripts/check-transaction-boundary.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, readText, lines, violation, info, report, isMain } from './_common.mjs';

export const TX_FILES = ['src/app/transactions.ts', 'src/app/transactions.tsx'];

const TX_RES = [
  /\bdb\s*\.\s*transaction\s*\(/,
  /\btransaction\s*\(\s*['"`](?:rw|rw!|r)\b/,
  /\bDexie\s*\.\s*transaction\b/,
  /\bnew\s+Transaction\s*\(/,
];

export function run() {
  const items = [];
  const files = walk('src', (rel) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel));
  if (files.length === 0) items.push(info('src/', '未找到代码文件，跳过'));

  for (const rel of files) {
    if (TX_FILES.includes(rel)) continue;
    const ls = lines(readText(rel));
    for (let i = 0; i < ls.length; i += 1) {
      const raw = ls[i];
      const trimmed = raw.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      const hit = TX_RES.find((re) => re.test(raw));
      if (!hit) continue;
      items.push(
        violation({
          file: rel,
          line: i + 1,
          rule: 'R1 事务边界唯一化 · db.transaction 只允许出现在 src/app/transactions.ts',
          found: `在此处开启 Dexie 事务：${trimmed}`,
          expected: `事务只在 ${TX_FILES[0]} 中开启；其它文件只提供纯函数计算结果`,
          fix:
            '把业务计算（FSRS 调度、队列推进、撤销快照）移到进入事务之前完成（src/domain/ 纯函数），' +
            `然后调用 ${TX_FILES[0]} 导出的用例函数（如 applyCommitPlan），由它在单事务内完成 cards.put + reviewLogs.add + sessionState.put。`,
        }),
      );
    }
  }

  const exists = TX_FILES.find((f) => fs.existsSync(path.join(ROOT, f)));
  if (!exists) {
    items.push(info(TX_FILES[0], '事务出口文件尚不存在，本次只做「禁止别处开事务」检查'));
  } else {
    items.push(info(exists, '已识别事务唯一出口'));
  }

  return items;
}

if (isMain(import.meta.url)) {
  process.exit(report('门禁 5 · Dexie 事务边界', run()));
}
