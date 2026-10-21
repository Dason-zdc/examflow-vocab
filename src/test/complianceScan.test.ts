import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { weightLabel } from '../ui/format';

/**
 * T-19（PRD §12.4）：合规禁用表述扫描门禁。
 * 命中即测试失败，阻断发版。
 *
 * 扫描口径：
 * - 范围：src/ 下全部 .ts/.tsx（*.test.* 除外——本文件自身就是词表载体）
 * - 对象：**字符串字面量**（注释与错误信息里的工程说明不算用户可见文案，
 *   但 packVerifier 的报错文案同样已主动去敏，见下）
 * - 违禁：一切把估计值表述成真实考试统计的措辞
 */
const FORBIDDEN = ['真题', '历年', '考频', '原题', '考试统计', '出现次数', '出现 N 次', '出现几次'];

const SRC_ROOT = join(__dirname, '..');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** 单遍扫描：注释跳过，字符串字面量收集 */
function stringLiterals(code: string): string[] {
  const re = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`/g;
  const literals: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const t = m[0];
    if (t.startsWith('/*') || t.startsWith('//')) continue;
    literals.push(t.slice(1, -1));
  }
  return literals;
}

describe('T-19 · 合规禁用表述扫描', () => {
  it('src/ 全部字符串字面量不含违禁措辞', () => {
    const violations: string[] = [];
    for (const file of walk(SRC_ROOT)) {
      const code = readFileSync(file, 'utf8');
      for (const lit of stringLiterals(code)) {
        const hit = FORBIDDEN.find((w) => lit.includes(w));
        if (hit) violations.push(`${relative(SRC_ROOT, file)}: 「${hit}」→ ${lit.slice(0, 60)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('权重文案恒为「估计权重」口径', () => {
    expect(weightLabel(42)).toBe('估计权重 42');
    expect(weightLabel(0)).toBe('估计权重 0');
  });
});
