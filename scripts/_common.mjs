/**
 * CI 门禁公共工具（零依赖，Node >= 20.19）
 *
 * 设计约定：
 * 1. 每条门禁脚本独立可执行（node scripts/check-xxx.mjs），也导出 run() 供 run-checks.mjs 聚合。
 * 2. 违反项一律是「诊断式」：文件 + 行号 + 命中的内容 + 期望 + 修复指引。
 *    禁止只报「检查失败」。
 * 3. 门禁失败即非零退出，但「目标文件尚不存在」只报 INFO，不判失败——
 *    项目处于增量开发期，未落地的文件不该阻塞已落地的规则。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 项目根：scripts/ 的上一级 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 判定脚本是否被直接执行（而非被 run-checks.mjs 导入） */
export function isMain(metaUrl) {
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
  return Boolean(invoked) && invoked === path.resolve(fileURLToPath(metaUrl));
}

/** 简易 argv 解析：--flag / --key=value */
export function parseArgv(argv = process.argv.slice(2)) {
  const flags = new Set();
  const kv = {};
  for (const a of argv) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v === undefined) flags.add(k);
      else kv[k] = v;
    }
  }
  return { flags, kv };
}

/** 默认忽略目录 */
export const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.cache', '.vite', 'dev-dist',
]);

export const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
export const STYLE_EXT = new Set(['.css', '.scss', '.less']);
export const DATA_EXT = new Set(['.json']);
export const DOC_EXT = new Set(['.md']);

/**
 * 遍历目录，返回相对 ROOT 的 POSIX 路径列表。
 * @param {string} relDir 相对 ROOT 的目录
 * @param {(p: string) => boolean} accept 相对路径判定
 */
export function walk(relDir, accept) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const stack = [abs];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) {
        if (IGNORE_DIRS.has(ent.name)) continue;
        stack.push(path.join(dir, ent.name));
        continue;
      }
      const rel = path.relative(ROOT, path.join(dir, ent.name)).split(path.sep).join('/');
      if (accept(rel)) out.push(rel);
    }
  }
  return out.sort();
}

/**
 * 按扩展名筛选：exts 为 Set 或 (ext)=>boolean
 */
export function byExt(...extSets) {
  const all = new Set(extSets.flatMap((s) => [...s]));
  return (rel) => all.has(path.extname(rel));
}

export function readText(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/** 拆行，保留行号（1-based） */
export function lines(text) {
  return text.split(/\r?\n/);
}

/**
 * 有效行判定：空行、整行注释不计入「代码行数」。
 * 支持 //、*（块注释中间行）、/*、#（shell/css 不做注释处理，css 用 /*）
 */
export function isBlankOrComment(line) {
  const t = line.trim();
  if (t === '') return true;
  if (t.startsWith('//')) return true;
  if (t.startsWith('/*')) return true;
  if (t.startsWith('*')) return true;
  if (t.startsWith('*/')) return true;
  return false;
}

/** 有效行数（不含空行与整行注释） */
export function effectiveLines(text) {
  return lines(text).filter((l) => !isBlankOrComment(l)).length;
}

/**
 * 构造一条违反项。
 * @param {object} v { file, line?, rule, found, expected, fix }
 */
export function violation(v) {
  return { file: v.file, line: v.line ?? null, rule: v.rule, found: v.found, expected: v.expected, fix: v.fix };
}

export function info(file, message) {
  return { file, line: null, rule: 'INFO', found: message, expected: '—', fix: '无需处理' };
}

/** 统一输出：先列 INFO，再列违反项；返回退出码 */
export function report(checkName, items) {
  const infos = items.filter((i) => i.rule === 'INFO');
  const bad = items.filter((i) => i.rule !== 'INFO');

  const pad = (s, n) => String(s).padEnd(n);
  console.log(`\n${bad.length === 0 ? 'PASS' : 'FAIL'}  ${checkName}`);
  if (infos.length) for (const i of infos) console.log(`      [INFO] ${i.file}: ${i.found}`);
  if (bad.length === 0) {
    console.log(`      0 处违反`);
    return 0;
  }
  console.log(`      ${bad.length} 处违反：`);
  for (const b of bad) {
    const loc = b.line ? `${b.file}:${b.line}` : b.file;
    console.log(`      - ${loc}`);
    console.log(`          ${pad('规则', 6)} ${b.rule}`);
    console.log(`          ${pad('命中', 6)} ${b.found}`);
    console.log(`          ${pad('期望', 6)} ${b.expected}`);
    console.log(`          ${pad('修复', 6)} ${b.fix}`);
  }
  return 1;
}

/** 转义给正则用 */
export function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
