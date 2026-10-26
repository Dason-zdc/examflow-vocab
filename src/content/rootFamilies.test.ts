import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/** 织网数据是构建产物：这里只校验「关键家族在 + 体积可控 + 公式含中文释义」 */

const FILE = path.join(process.cwd(), 'public', 'dict', 'root-families.json');

interface Payload {
  version: string;
  roots: Record<string, { cn: string; origin: string; words: Array<[string, string, string, number, string]> }>;
}

function load(): Payload {
  return JSON.parse(fs.readFileSync(FILE, 'utf8')) as Payload;
}

describe('同根词网索引', () => {
  it('dict 家族覆盖用户示例里的同根词', () => {
    const data = load();
    const family = data.roots.dict;
    expect(family).toBeTruthy();
    expect(family!.cn).toBe('说');
    const lemmas = family!.words.map((w) => w[0]);
    expect(lemmas).toContain('predict');
    expect(lemmas).toContain('contradiction');
    expect(lemmas.some((w) => w.startsWith('dictat'))).toBe(true);
  });

  it('每个成员都带中文与「成分(释义)」公式（变体可用，如 ann → enn）', () => {
    const data = load();
    for (const [root, family] of Object.entries(data.roots)) {
      for (const [, , cn, , formula] of family.words) {
        expect(cn.length, `${root} 成员缺中文`).toBeGreaterThan(0);
        expect(/\(.+\)/.test(formula), `${root}: ${formula}`).toBe(true);
      }
    }
  });

  it('索引体积控制在 300 KB 内（避免首屏拉取过重）', () => {
    const bytes = fs.statSync(FILE).size;
    expect(bytes).toBeLessThan(300 * 1024);
  });
});
