#!/usr/bin/env node
/**
 * 门禁 3：禁止硬编码颜色（团队 P0）
 *
 * 扫描范围：src/** 下的 .ts/.tsx/.js/.jsx/.mjs/.cjs/.css
 * 唯一豁免：src/styles/design-tokens.css 与 src/styles/design-tokens.json
 *           —— 它们是色值的唯一定义处（primitive 区），必须出现 hex，否则令牌无处定义。
 *
 * 判定
 *   R1 颜色字面量：#rgb / #rgba / #rrggbb / #rrggbbaa / rgb() / rgba() / hsl() / hsla()
 *                  / oklch() / lch() / lab() / hwb() / color-mix()
 *      放行白名单：#fff #ffffff #000 #000000 white black transparent currentColor inherit none
 *   R2 Tailwind 任意值颜色类：(bg|text|border|ring|fill|stroke|divide|outline|from|via|to|
 *                             decoration|accent|caret|placeholder|shadow)-[#...] 或 -(rgb|hsl|oklch)(
 *      说明：这类写法绕开 tailwind.config.ts 的令牌映射，等同于硬编码。
 *   R3 放行：var(--*) CSS 变量、tailwind.config.ts 中已映射的令牌类名（bg-bg / text-fg 等）
 *
 * 已知误报与逃生舱
 *   3 位 hex（#add / #beef 等）可能与 DOM id 选择器、锚点重名。确属误报时，
 *   在该行末尾加 `// gate-allow-color: <原因>` 抑制，抑制数量会在输出中统计并需人工复核。
 *
 * 用法：node scripts/check-no-hardcoded-color.mjs
 */

import { walk, readText, lines, violation, info, report, isMain } from './_common.mjs';

/** 令牌定义区：唯一允许出现原始色值的地方 */
const TOKEN_FILES = new Set(['src/styles/design-tokens.css', 'src/styles/design-tokens.json']);

const ALLOWED_WORDS = new Set(['white', 'black', 'transparent', 'currentColor', 'currentcolor', 'inherit', 'none']);
const ALLOWED_HEX = new Set(['#fff', '#ffffff', '#000', '#000000']);

const COLOR_LITERAL_RE =
  /#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b|(?:rgb|rgba|hsl|hsla|oklch|lch|lab|hwb|color-mix)\s*\(/g;

const TW_ARBITRARY_RE =
  /\b(?:bg|text|border|ring|fill|stroke|divide|outline|from|via|to|decoration|accent|caret|placeholder|shadow)-\[?\s*(?:#|rgba?\(|hsla?\(|oklch\()/g;

const CSS_VAR_RE = /var\(\s*--/;

/** 行内抑制逃生舱：// gate-allow-color: <原因> */
const SUPPRESS_RE = /gate-allow-color\s*:/;

export function run() {
  const items = [];
  let suppressed = 0;
  const files = walk('src', (rel) => /\.(ts|tsx|js|jsx|mjs|cjs|css)$/.test(rel));
  if (files.length === 0) items.push(info('src/', '未找到可扫描文件，跳过'));

  let tokenFilesSeen = 0;
  for (const rel of files) {
    if (TOKEN_FILES.has(rel)) {
      tokenFilesSeen += 1;
      continue;
    }
    const ls = lines(readText(rel));
    for (let i = 0; i < ls.length; i += 1) {
      const raw = ls[i];
      // 注释行不判定（注释里举例说明色值不算硬编码）；但仍会扫到字符串，故只跳过纯注释行
      const trimmed = raw.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
      if (SUPPRESS_RE.test(raw)) {
        suppressed += 1;
        continue;
      }

      COLOR_LITERAL_RE.lastIndex = 0;
      let m;
      while ((m = COLOR_LITERAL_RE.exec(raw)) !== null) {
        const hit = m[0];
        const lower = hit.toLowerCase();
        if (hit.startsWith('#') && ALLOWED_HEX.has(lower)) continue;
        items.push(
          violation({
            file: rel,
            line: i + 1,
            rule: 'R1 团队 P0 · 禁止硬编码颜色字面量',
            found: `出现颜色字面量 ${hit}`,
            expected: '色值只出现在 src/styles/design-tokens.css 的 primitive 区；业务代码只引用令牌（Tailwind 令牌类名或 var(--color-*)）',
            fix:
              '在 src/styles/design-tokens.css 的 primitive 区新增语义变量，并在 tailwind.config.ts 的 theme.extend.colors 映射为令牌类名，然后用令牌替换该字面量。',
          }),
        );
      }

      TW_ARBITRARY_RE.lastIndex = 0;
      while ((m = TW_ARBITRARY_RE.exec(raw)) !== null) {
        items.push(
          violation({
            file: rel,
            line: i + 1,
            rule: 'R2 团队 P0 · 禁止 Tailwind 任意值颜色类',
            found: `出现任意值颜色类 ${m[0]}`,
            expected: '颜色走 tailwind.config.ts 已映射的令牌类名（如 bg-surface / text-fg / border-line）',
            fix: '把该色值提升为 design-tokens.css 中的语义变量并映射到 tailwind.config.ts，然后用令牌类名替换任意值写法。',
          }),
        );
      }
    }
  }

  if (tokenFilesSeen === 0) {
    items.push(info('src/styles/design-tokens.css', '令牌定义文件不存在，本次无豁免；请先由设计侧产出令牌文件'));
  } else {
    items.push(info(`豁免 ${tokenFilesSeen} 个令牌定义文件`, 'design-tokens.css / design-tokens.json 是色值唯一定义处'));
  }
  if (!hasCssVarChain()) {
    items.push(info('src/styles/design-tokens.css', '未检测到 var(--*) 引用链，请确认 index.css 与 tailwind.config.ts 仍走 CSS 变量'));
  }
  if (suppressed > 0) {
    items.push(info(`行内抑制 ${suppressed} 处`, '使用了 // gate-allow-color: 逃生舱，需人工复核是否确为误报'));
  }

  return items;
}

function hasCssVarChain() {
  try {
    return CSS_VAR_RE.test(readText('src/styles/design-tokens.css'));
  } catch {
    return true; // 文件不存在时不额外告警（上面已有 INFO）
  }
}

if (isMain(import.meta.url)) {
  process.exit(report('门禁 3 · 禁止硬编码颜色', run()));
}
