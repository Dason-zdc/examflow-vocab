#!/usr/bin/env node
/**
 * 门禁 2：禁止 emoji（团队 P0）
 *
 * 扫描范围
 *   - src/**                        代码、注释、字符串字面量
 *   - public/packs/ 下所有 .json    数据包内容（单词释义、例句、tips 里也不许有 emoji）
 *   - docs/ 下所有 .md              含 UI/UX 文档，避免出现「emoji 当图标」的设计稿描述
 *
 * 判定字符集（团队 P0 emoji 区间集，已实测校准）
 *   - \p{Extended_Pictographic}     Unicode 象形符号属性：😀 ✅ ❌ ⚠ ⭐ ❤ ⚡ 🔥 👍 全部命中
 *   - U+FE0F                        变体选择符（VS16，把文字符号渲染成彩色 emoji）
 *   - U+1F1E6–U+1F1FF               区域指示符（国旗）
 *
 * 明确放行（不是 emoji，属排版字符）
 *   - 箭头 → ← ⇧ ↑ ↓ ⇒ 等（U+2190–U+21FF）
 *   - ★ ☆ 等(U+2605/2606) 未被 Extended_Pictographic 覆盖 —— 但见下方 --strict-symbol
 *   如需连 ★ ☆ 一起禁，加 --strict-symbol。
 *
 * 用法：node scripts/check-no-emoji.mjs [--strict-symbol]
 */

import { walk, readText, lines, violation, info, report, isMain, parseArgv } from './_common.mjs';

const EMOJI_RE = /\p{Extended_Pictographic}|\uFE0F|[\u{1F1E6}-\u{1F1FF}]/gu;
/** 严格模式下额外禁用的「常被当功能图标用的符号」 */
const STRICT_SYMBOL_RE = /[★☆✦✧✔✗✘✓✚⬤⬛⬜◆◇▪▫]/gu;

const SCAN_DIRS = ['src', 'public/packs', 'docs'];

export function run(opts = {}) {
  const strict = Boolean(opts.strictSymbol);
  const re = new RegExp(EMOJI_RE.source + (strict ? `|${STRICT_SYMBOL_RE.source}` : ''), 'gu');
  const items = [];
  let scanned = 0;

  const files = SCAN_DIRS.flatMap((dir) =>
    walk(dir, (rel) => /\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|html|svg)$/.test(rel)),
  );

  if (files.length === 0) items.push(info(SCAN_DIRS.join(', '), '未找到可扫描文件，跳过'));

  for (const rel of files) {
    scanned += 1;
    const text = readText(rel);
    const ls = lines(text);
    for (let i = 0; i < ls.length; i += 1) {
      re.lastIndex = 0;
      const hits = ls[i].match(re);
      if (!hits) continue;
      const uniq = [...new Set(hits)];
      const codes = uniq.map((c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
      items.push(
        violation({
          file: rel,
          line: i + 1,
          rule: '团队 P0 · 禁止 emoji（含数据包内容与 UI 文档）',
          found: `出现 emoji ${uniq.join(' ')}（${codes}）`,
          expected: '该位置不出现任何 emoji；图标一律走 src/ui/icons.ts 的 lucide-react 图标（16/20/24px）',
          fix:
            rel.startsWith('public/packs')
              ? '数据包内容由 ETL 产出：在 scripts/etl_build_pack.py 的清洗步骤里剔除 emoji，重新生成并刷新 sha256。'
              : rel.startsWith('docs')
                ? 'UI/UX 文档里不要用 emoji 描述图标位；改写为图标名（如 "ChevronRight 16"）。'
                : '删除该 emoji；若它是功能图标，从 src/ui/icons.ts 引入对应 lucide 图标替代。',
        }),
      );
    }
  }

  items.push(info(`扫描文件数 ${scanned}`, strict ? '严格模式（含 ★☆ 等符号）' : '标准模式（箭头与 ★☆ 放行）'));
  return items;
}

if (isMain(import.meta.url)) {
  const { flags } = parseArgv();
  process.exit(report('门禁 2 · 禁止 emoji', run({ strictSymbol: flags.has('strict-symbol') })));
}
