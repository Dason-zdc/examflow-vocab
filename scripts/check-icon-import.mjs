#!/usr/bin/env node
/**
 * 门禁 4：图标库唯一出口与尺寸规范（团队 P0）
 *
 * 规则（来源：docs/02-ARCHITECTURE.md §10.1）
 *   R1  `lucide-react` 只允许被 src/ui/icons.ts 引用。其它任何文件出现 import / require /
 *       动态 import('lucide-react') 即失败。目的：全项目不混用第二套图标、图标可整体替换。
 *   R2  src/ui/icons.ts 内部只允许 16 / 20 / 24 三种尺寸。
 *   R3  src/ui/icons.ts 内 strokeWidth 必须统一为 1.75。
 *   R4  src/ui/icons.ts 不得导出 lucide 的 DynamicIcon / createLucideIcon 之类的动态工厂
 *       （动态图标无法被尺寸与描边门禁校验，也破坏 tree-shaking）。
 *
 * 边界：src/ui/icons.ts 尚不存在时，R1 仍然生效（任何地方 import 都失败），
 *       R2/R3/R4 记 INFO 跳过——未落地的文件不该阻塞已落地的规则。
 *
 * 用法：node scripts/check-icon-import.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, walk, readText, lines, violation, info, report, isMain } from './_common.mjs';

export const ICONS_ENTRY = 'src/ui/icons.ts';
const ALLOWED_SIZES = [16, 20, 24];
const REQUIRED_STROKE = 1.75;

/** 命中 lucide-react 的引用写法 */
const IMPORT_RES = [
  /from\s+['"]lucide-react['"]/,
  /require\(\s*['"]lucide-react['"]\s*\)/,
  /import\(\s*['"]lucide-react['"]\s*\)/,
  /from\s+['"]lucide-react\//, // 深路径导入（该版本无 exports map，深路径不可靠）
];

const SIZE_RES = [
  /\bsize\s*=\s*\{\s*(\d+(?:\.\d+)?)\s*\}/,
  /\bsize\s*=\s*\{\s*['"](\d+(?:\.\d+)?)['"]\s*\}/,
  /\bsize\s*:\s*(\d+(?:\.\d+)?)/,
  /\bsize\s*=\s*(\d+(?:\.\d+)?)/,
];

const STROKE_RES = [/strokeWidth\s*=\s*\{\s*(\d+(?:\.\d+)?)\s*\}/, /strokeWidth\s*:\s*(\d+(?:\.\d+)?)/];

const FORBIDDEN_EXPORTS = ['DynamicIcon', 'createLucideIcon', 'Icon', 'icons'];

export function run() {
  const items = [];
  const files = walk('src', (rel) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel));
  if (files.length === 0) items.push(info('src/', '未找到代码文件，跳过'));

  for (const rel of files) {
    const ls = lines(readText(rel));
    for (let i = 0; i < ls.length; i += 1) {
      const raw = ls[i];
      const trimmed = raw.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;

      if (rel !== ICONS_ENTRY && IMPORT_RES.some((re) => re.test(raw))) {
        items.push(
          violation({
            file: rel,
            line: i + 1,
            rule: 'R1 团队 P0 · lucide-react 唯一出口',
            found: `直接引用 lucide-react：${trimmed}`,
            expected: `只有 ${ICONS_ENTRY} 可以 import 'lucide-react'`,
            fix: `删除该 import，改为从 '@/ui/icons' 引入已在白名单中的图标组件；若白名单里没有，先在 ${ICONS_ENTRY} 中新增再导出。`,
          }),
        );
      }
    }
  }

  const entryPath = path.join(ROOT, ICONS_ENTRY);
  if (!fs.existsSync(entryPath)) {
    items.push(info(ICONS_ENTRY, '图标出口文件尚不存在，R2/R3/R4 本次跳过（R1 仍然生效）'));
    return items;
  }

  const ls = lines(readText(ICONS_ENTRY));

  // R4 动态工厂导出
  for (let i = 0; i < ls.length; i += 1) {
    for (const name of FORBIDDEN_EXPORTS) {
      const re = new RegExp(`export\\s*\\{[^}]*\\b${name}\\b|export\\s+(?:const|function|default)\\s+${name}\\b|\\b${name}\\s*,`);
      if (re.test(ls[i])) {
        items.push(
          violation({
            file: ICONS_ENTRY,
            line: i + 1,
            rule: 'R4 团队 P0 · 禁止导出动态图标工厂',
            found: `导出/再导出 ${name}`,
            expected: '只再导出确定尺寸的具名图标组件，便于尺寸与描边门禁校验和 tree-shaking',
            fix: '改为具名再导出具体图标（如 export { Check, X, Star } from ...），并用包装组件固定 size 与 strokeWidth。',
          }),
        );
      }
    }
  }

  // R2 尺寸
  const sizesFound = new Set();
  for (const raw of ls) {
    for (const re of SIZE_RES) {
      re.lastIndex = 0;
      const m = raw.match(re);
      if (m) sizesFound.add(Number(m[1]));
    }
  }
  for (const s of [...sizesFound].sort((a, b) => a - b)) {
    if (!ALLOWED_SIZES.includes(s)) {
      items.push(
        violation({
          file: ICONS_ENTRY,
          line: null,
          rule: `R2 团队 P0 · 图标尺寸只允许 ${ALLOWED_SIZES.join(' / ')} px`,
          found: `出现尺寸 ${s}px`,
          expected: `仅 ${ALLOWED_SIZES.join(' / ')} px`,
          fix: '把该尺寸改为最接近的 16 / 20 / 24；设计稿里也只标这三种尺寸。',
        }),
      );
    }
  }

  // R3 描边
  const strokes = new Set();
  for (const raw of ls) {
    for (const re of STROKE_RES) {
      re.lastIndex = 0;
      const m = raw.match(re);
      if (m) strokes.add(Number(m[1]));
    }
  }
  for (const w of [...strokes].sort((a, b) => a - b)) {
    if (Math.abs(w - REQUIRED_STROKE) > 1e-9) {
      items.push(
        violation({
          file: ICONS_ENTRY,
          line: null,
          rule: `R3 团队 P0 · strokeWidth 统一为 ${REQUIRED_STROKE}`,
          found: `出现 strokeWidth ${w}`,
          expected: `strokeWidth = ${REQUIRED_STROKE}`,
          fix: `统一为 ${REQUIRED_STROKE}；需要视觉差异时用尺寸档位（16/20/24）区分，不靠描边粗细。`,
        }),
      );
    }
  }

  if (sizesFound.size === 0) items.push(info(ICONS_ENTRY, '未检测到 size 字面量，R2 本次跳过（建议用包装组件显式固定尺寸）'));
  if (strokes.size === 0) items.push(info(ICONS_ENTRY, `未检测到 strokeWidth 声明，需在包装组件中显式设为 ${REQUIRED_STROKE}`));

  return items;
}

if (isMain(import.meta.url)) {
  process.exit(report('门禁 4 · 图标唯一出口与尺寸', run()));
}
