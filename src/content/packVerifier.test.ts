import { describe, expect, it } from 'vitest';
import {
  PackFormatError,
  assertChunkShape,
  assertLemmaMapShape,
  assertManifestShape,
  sha256Hex,
  type PackWord,
} from './packVerifier';

const EXAM = 'IELTS';

function goodWord(overrides: Partial<PackWord> = {}): PackWord {
  return {
    id: 'w_test',
    lemma: 'test',
    phoneticUk: '/test/',
    phoneticUs: '',
    isBasic: false,
    forms: ['tests'],
    senses: [
      {
        id: 's_test_n',
        pos: 'n.',
        cn: '测试',
        examStats: {
          [EXAM]: { senseWeight: 55, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: false },
        },
      },
    ],
    sentences: [
      {
        id: 'x_test_1',
        wordId: 'w_test',
        senseId: 's_test_n',
        en: 'This is a test.',
        zh: '这是一个测试。',
        surfaceForm: 'test',
        provenance: { type: 'ADAPTED', note: '仿真例句' },
      },
    ],
    etymology: undefined,
    confusables: [],
    ...overrides,
  } as PackWord;
}

function goodChunk(words: PackWord[] = [goodWord()]) {
  return { exam: EXAM, version: '1.1.0', chunk: 0, wordCount: words.length, words };
}

describe('packVerifier · manifest 形状', () => {
  const good = {
    exam: EXAM,
    version: '1.1.0',
    minAppVersion: '1.0.0',
    generatedAt: '2026-10-21T00:00:00+08:00',
    wordCount: 2000,
    chunkSize: 300,
    chunks: [{ n: 0, file: 'chunk-0.json', wordCount: 300, sha256: 'a'.repeat(64), bytes: 100 }],
    lemmaMap: { file: 'lemma-map.json', sha256: 'b'.repeat(64), bytes: 100, entries: 6631 },
    deprecatedWordIds: [],
    frequencyMethod: '',
    provenanceNote: '',
    sources: [],
    license: '',
  };

  it('合法 manifest 通过', () => {
    expect(assertManifestShape(good).exam).toBe(EXAM);
  });

  it('sha256 不是 64 位十六进制即拒绝', () => {
    const bad = { ...good, chunks: [{ ...good.chunks[0]!, sha256: 'xyz' }] };
    expect(() => assertManifestShape(bad)).toThrow(PackFormatError);
    const badLemma = { ...good, lemmaMap: { ...good.lemmaMap, sha256: 'XYZ' } };
    expect(() => assertManifestShape(badLemma)).toThrow(/lemmaMap.sha256/);
  });

  it('缺 exam / version / chunks 即拒绝', () => {
    expect(() => assertManifestShape({ version: '1.0.0', chunks: [] })).toThrow(/exam/);
    expect(() => assertManifestShape({ exam: EXAM, chunks: [] })).toThrow(/version/);
    expect(() => assertManifestShape({ exam: EXAM, version: '1.0.0' })).toThrow(/chunks/);
  });
});

describe('packVerifier · chunk 形状与合规', () => {
  it('合法 chunk 通过', () => {
    const c = assertChunkShape(goodChunk(), { exam: EXAM, version: '1.1.0', chunk: 0 });
    expect(c.words).toHaveLength(1);
  });

  it('exam / version / chunk 编号与 manifest 不一致即拒绝', () => {
    expect(() => assertChunkShape(goodChunk(), { exam: 'KAOYAN', version: '1.1.0', chunk: 0 })).toThrow(/exam/);
    expect(() => assertChunkShape(goodChunk(), { exam: EXAM, version: '1.0.0', chunk: 0 })).toThrow(/version/);
    expect(() => assertChunkShape(goodChunk(), { exam: EXAM, version: '1.1.0', chunk: 3 })).toThrow(/chunk/);
  });

  it('wordCount 与 words 实际长度不符即拒绝', () => {
    const c = { ...goodChunk(), wordCount: 5 };
    expect(() => assertChunkShape(c, { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/wordCount/);
  });

  it('合规：provenance 不是 ADAPTED 即拒绝（无真题语料）', () => {
    const w = goodWord();
    w.sentences[0]!.provenance = { type: 'REAL_EXAM', exam: EXAM, year: 2021, paper: 'Cambridge 16', section: 'T1' };
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/ADAPTED/);
  });

  it('合规：kind 不是 ESTIMATED 即拒绝', () => {
    const w = goodWord();
    w.senses[0]!.examStats[EXAM]!.kind = 'REAL' as 'ESTIMATED';
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/ESTIMATED/);
  });

  it('合规：sources 为空即拒绝（估计值必须说明来源）', () => {
    const w = goodWord();
    w.senses[0]!.examStats[EXAM]!.sources = [];
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/sources/);
  });

  it('tier 非法值即拒绝', () => {
    const w = goodWord();
    w.senses[0]!.examStats[EXAM]!.tier = 'LEGENDARY' as 'CORE';
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/tier/);
  });

  it('例句关联到不存在的义项即拒绝', () => {
    const w = goodWord();
    w.sentences[0]!.senseId = 's_not_exists';
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/senseId/);
  });

  it('单词没有任何义项带该考试统计即拒绝', () => {
    const w = goodWord();
    w.senses[0]!.examStats = {};
    expect(() => assertChunkShape(goodChunk([w]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/统计/);
  });

  it('lemma-map entries 与实际长度不符即拒绝', () => {
    expect(() => assertLemmaMapShape({ exam: EXAM, version: '1.1.0', entries: 2, map: { a: 'b' } })).toThrow(/entries/);
    expect(assertLemmaMapShape({ exam: EXAM, version: '1.1.0', entries: 1, map: { tests: 'test' } }).map.tests).toBe('test');
  });
});

describe('packVerifier · sha256', () => {
  it('与 node:crypto 结果一致', async () => {
    const { createHash } = await import('node:crypto');
    const bytes = new TextEncoder().encode('examflow-vocab pack integrity');
    const expected = createHash('sha256').update(bytes).digest('hex');
    expect(await sha256Hex(bytes)).toBe(expected);
  });

  it('ArrayBuffer 与 Uint8Array 输入结果一致', async () => {
    const bytes = new TextEncoder().encode('same bytes');
    const a = await sha256Hex(bytes);
    const b = await sha256Hex(bytes.buffer as ArrayBuffer);
    expect(a).toBe(b);
  });
});

describe('packVerifier · 义项级同义替换约束 (US-08)', () => {
  const group = () => ({
    synset: 'oewn-02639437-v',
    gloss: 'be composed of',
    frame: 'of',
    candidates: [
      { lemma: 'comprise', pos: 'v.', status: 'REWRITE' as const, inPack: true, rewrite: 'consist of O → comprise O' },
    ],
  });

  function withGroups(groups: unknown): PackWord {
    const w = goodWord();
    (w.senses[0] as { synonymGroups?: unknown }).synonymGroups = groups;
    return w;
  }

  it('结构合法时通过', () => {
    expect(() => assertChunkShape(goodChunk([withGroups([group()])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).not.toThrow();
  });

  it('分组缺 synset 即拒绝：同义关系必须能回溯到义项', () => {
    const g = group();
    delete (g as { synset?: string }).synset;
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/synset/);
  });

  it('分组缺英文释义即拒绝：没有释义的分组没法判断用的是哪个义项', () => {
    const g = group();
    delete (g as { gloss?: string }).gloss;
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/gloss/);
  });

  it('状态不在五态之内即拒绝', () => {
    const g = group();
    (g.candidates[0] as { status: string }).status = 'MAYBE';
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/五态/);
  });

  it('候选是本词即拒绝', () => {
    const g = group();
    g.candidates[0]!.lemma = 'test';
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/本词/);
  });

  it('判为需改写却没有模板即拒绝：可用性承诺必须可执行', () => {
    const g = group();
    delete (g.candidates[0] as { rewrite?: string }).rewrite;
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/rewrite/);
  });

  it('判为搭配不符却没有理由即拒绝', () => {
    const g = group();
    (g.candidates[0] as { status: string }).status = 'CONFLICT';
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/note/);
  });

  it('中文释义含多义分隔符即拒绝：那是词级释义，不是义项级', () => {
    const g = group();
    (g.candidates[0] as { cn?: string }).cn = '居住、居住(于)';
    expect(() => assertChunkShape(goodChunk([withGroups([g])]), { exam: EXAM, version: '1.1.0', chunk: 0 })).toThrow(/义项级/);
  });
});
