import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { SynonymGroup } from '../domain/types';

/**
 * 数据包回归（US-08）。
 *
 * 这里测的是「产出」而不是「结构」：SynsetLens 的教训是，验收只证明「不该出现的没出现」，
 * 系统会在全绿状态下给出 0 个可用候选。所以断言直接盯着标杆用例 consist。
 */
const PACK_DIR = path.join(process.cwd(), 'public', 'packs', 'IELTS');

interface PackWordLike {
  lemma: string;
  synonyms?: unknown;
  senses: Array<{ id: string; cn: string; synonymGroups?: SynonymGroup[] }>;
}

function loadWords(): PackWordLike[] {
  return fs
    .readdirSync(PACK_DIR)
    .filter((file) => file.startsWith('chunk-'))
    .flatMap((file) => JSON.parse(fs.readFileSync(path.join(PACK_DIR, file), 'utf8')).words as PackWordLike[]);
}

const words = loadWords();
const consist = words.find((w) => w.lemma === 'consist')!;

function groupOf(word: PackWordLike, glossPart: string): SynonymGroup {
  const groups = word.senses.flatMap((s) => s.synonymGroups ?? []);
  const found = groups.find((g) => g.gloss.includes(glossPart));
  expect(found, `缺少 gloss 含「${glossPart}」的分组`).toBeDefined();
  return found!;
}

describe('IELTS 数据包 · 义项级同义替换', () => {
  it('词级 synonyms 字段已下线：同义关系只存在于义项上', () => {
    expect(words.filter((w) => 'synonyms' in w)).toHaveLength(0);
  });

  it('consist of 给出唯一正确候选 comprise，并给出改写模板', () => {
    const group = groupOf(consist, 'be composed of');
    expect(group.frame).toBe('of');
    const comprise = group.candidates.find((c) => c.lemma === 'comprise');
    expect(comprise, 'comprise 必须出现在 be composed of 这一组').toBeDefined();
    expect(comprise!.status).toBe('REWRITE');
    expect(comprise!.rewrite).toBe('consist of O → comprise O');
  });

  it('consist in 的候选不会串到 consist of 这一组（搭配隔离）', () => {
    const ofGroup = groupOf(consist, 'be composed of');
    expect(ofGroup.candidates.map((c) => c.lemma)).not.toContain('dwell');
    const inGroup = groupOf(consist, 'originate (in)');
    expect(inGroup.frame).toBe('in');
    expect(inGroup.candidates.map((c) => c.lemma)).toEqual(expect.arrayContaining(['dwell', 'lie']));
  });

  it('候选中文绑定义项：只在中文义项段与卡片重合时贴，且贴的是重合段', () => {
    const ofGroup = groupOf(consist, 'be composed of');
    const comprise = ofGroup.candidates.find((c) => c.lemma === 'comprise')!;
    expect(comprise.cn).toBe('由…组成');

    // dwell 的中文是「居住」，与这张卡（由…组成；在于）无共同义项段，宁可不贴
    const inGroup = groupOf(consist, 'originate (in)');
    expect(inGroup.candidates.find((c) => c.lemma === 'dwell')!.cn).toBeUndefined();
  });

  it('贴出的中文必须是单一义项段，不能是词级多义合并', () => {
    for (const word of words) {
      for (const sense of word.senses) {
        for (const group of sense.synonymGroups ?? []) {
          for (const cand of group.candidates) {
            if (cand.cn) expect(cand.cn).not.toMatch(/[、,，;；/]/);
          }
        }
      }
    }
  });

  it('每个义项分组都可回溯，五态的可用性承诺有配套字段', () => {
    const statuses = new Set(['DIRECT', 'INFERRED', 'REWRITE', 'CONFLICT', 'UNKNOWN']);
    for (const word of words) {
      for (const sense of word.senses) {
        for (const group of sense.synonymGroups ?? []) {
          expect(group.synset).toMatch(/^oewn-\d+-[nvars]$/);
          expect(group.gloss.length).toBeGreaterThan(0);
          expect(group.candidates.length).toBeGreaterThan(0);
          for (const cand of group.candidates) {
            expect(statuses.has(cand.status)).toBe(true);
            expect(cand.lemma).not.toBe(word.lemma);
            if (cand.status === 'REWRITE') expect(cand.rewrite).toBeTruthy();
            if (cand.status === 'CONFLICT') expect(cand.note).toBeTruthy();
          }
        }
      }
    }
  });

  it('义项级覆盖率不低于 60%（防止 ETL 静默退化为空数据）', () => {
    const senses = words.flatMap((w) => w.senses);
    const covered = senses.filter((s) => (s.synonymGroups ?? []).length > 0);
    expect(covered.length / senses.length).toBeGreaterThan(0.6);
  });
});
