#!/usr/bin/env node
/**
 * 门禁 1：单文件行数
 *
 * 规则（来源：代码组织规范 §4 + docs/02-ARCHITECTURE.md §3.4）
 *   R1  src/ 下代码文件（.ts/.tsx/.js/.jsx/.mjs/.cjs）有效行 <= 300
 *       有效行 = 总行 - 空行 - 整行注释。300 是硬上限不是目标，超 200 就该警惕。
 *   R2  入口文件 src/main.tsx、src/App.tsx 有效行 < 100（入口只装配，不写业务）
 *
 * 边界：.css/.json（设计令牌、数据包样例）不计入代码行数门禁——它们是数据与令牌源，
 *       天然会长。加 --include-data 可把它们纳入观察（仅 INFO，不判失败）。
 *
 * 用法：node scripts/check-file-length.mjs [--include-data] [--max=300]
 */

import { walk, byExt, CODE_EXT, readText, lines, effectiveLines, violation, info, report, isMain, parseArgv } from './_common.mjs';

const CODE_MAX = 300;
const ENTRY_MAX = 100;
const ENTRY_FILES = ['src/main.tsx', 'src/main.ts', 'src/App.tsx', 'src/App.ts'];

export function run(opts = {}) {
  const max = Number(opts.max ?? CODE_MAX);
  const includeData = Boolean(opts.includeData);
  const items = [];

  const codeFiles = walk('src', (rel) => byExt(CODE_EXT)(rel));
  if (codeFiles.length === 0) items.push(info('src/', '未找到代码文件，跳过'));

  for (const rel of codeFiles) {
    const text = readText(rel);
    const total = lines(text).length;
    const eff = effectiveLines(text);
    const isEntry = ENTRY_FILES.includes(rel);
    const limit = isEntry ? ENTRY_MAX : max;

    if (eff > limit) {
      items.push(
        violation({
          file: rel,
          line: null,
          rule: isEntry ? `R2 入口文件有效行 < ${ENTRY_MAX}` : `R1 单文件有效行 <= ${max}`,
          found: `有效行 ${eff}（总行 ${total}），超出上限 ${limit}`,
          expected: `有效行 <= ${limit}（总行 ${total}）`,
          fix: isEntry
            ? '入口只做装配（挂载 Provider / 路由 / 启动）。把分支与计算下沉到 src/app/ 用例或 src/domain/ 纯函数。'
            : '按子功能拆文件（一个文件一个主职责、一个主导出），不是拆函数凑数。拆到 src/domain/、src/app/ 或 src/ui/components/ 下对应职责文件。',
        }),
      );
    } else if (eff > 200 && !isEntry) {
      items.push(info(rel, `有效行 ${eff}，已过 200 行警戒线（上限 ${max}），建议提前拆分`));
    }
  }

  for (const f of ENTRY_FILES) {
    if (!codeFiles.includes(f)) items.push(info(f, '入口文件尚不存在，R2 本次跳过'));
  }

  if (includeData) {
    const dataFiles = walk('src', (rel) => /\.css$|\.json$/.test(rel));
    for (const rel of dataFiles) {
      const eff = effectiveLines(readText(rel));
      if (eff > max) items.push(info(rel, `数据/样式文件有效行 ${eff}（不计入门禁，仅观察）`));
    }
  }

  return items;
}

if (isMain(import.meta.url)) {
  const { flags, kv } = parseArgv();
  process.exit(report('门禁 1 · 单文件行数', run({ includeData: flags.has('include-data'), max: kv.max })));
}
