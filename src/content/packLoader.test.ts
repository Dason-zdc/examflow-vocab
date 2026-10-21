import { beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { ExamFlowDB } from '../storage/db';
import { loadPack } from './packLoader';
import type { PackWord } from './packVerifier';

const EXAM = 'IELTS' as const;
const VERSION = '1.1.0';

function word(lemma: string): PackWord {
  return {
    id: `w_${lemma}`,
    lemma,
    phoneticUk: `/${lemma}/`,
    phoneticUs: '',
    isBasic: false,
    forms: [],
    senses: [
      {
        id: `s_${lemma}_n`,
        pos: 'n.',
        cn: `${lemma} 的释义`,
        examStats: {
          IELTS: { senseWeight: 50, tier: 'ADVANCED', kind: 'ESTIMATED', sources: ['test'], isEccentric: false },
        },
      },
    ],
    sentences: [
      {
        id: `x_${lemma}_1`,
        wordId: `w_${lemma}`,
        senseId: `s_${lemma}_n`,
        en: `A sentence with ${lemma}.`,
        zh: `一个含 ${lemma} 的句子。`,
        surfaceForm: lemma,
        provenance: { type: 'ADAPTED', note: '仿真例句' },
      },
    ],
    confusables: [],
    synonyms: [],
  };
}

function bytesOf(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

const WORDS: PackWord[] = [word('alpha'), word('beta'), word('gamma')];

function buildFixture(): {
  manifest: Record<string, unknown>;
  files: Record<string, Uint8Array>;
} {
  const chunk0 = { exam: EXAM, version: VERSION, chunk: 0, wordCount: 2, words: WORDS.slice(0, 2) };
  const chunk1 = { exam: EXAM, version: VERSION, chunk: 1, wordCount: 1, words: WORDS.slice(2) };
  const lemmaMap = { exam: EXAM, version: VERSION, entries: 2, map: { alphas: 'alpha', betas: 'beta' } };
  const files: Record<string, Uint8Array> = {
    'chunk-0.json': bytesOf(chunk0),
    'chunk-1.json': bytesOf(chunk1),
    'lemma-map.json': bytesOf(lemmaMap),
  };
  const manifest = {
    exam: EXAM,
    version: VERSION,
    minAppVersion: '1.0.0',
    generatedAt: '2026-10-21T00:00:00+08:00',
    wordCount: 3,
    chunkSize: 2,
    chunks: [
      { n: 0, file: 'chunk-0.json', wordCount: 2, sha256: sha256Of(files['chunk-0.json']!), bytes: files['chunk-0.json']!.length },
      { n: 1, file: 'chunk-1.json', wordCount: 1, sha256: sha256Of(files['chunk-1.json']!), bytes: files['chunk-1.json']!.length },
    ],
    lemmaMap: {
      file: 'lemma-map.json',
      sha256: sha256Of(files['lemma-map.json']!),
      bytes: files['lemma-map.json']!.length,
      entries: 2,
    },
    deprecatedWordIds: [],
    frequencyMethod: 'test',
    provenanceNote: 'test',
    sources: [],
    license: 'test',
  };
  return { manifest, files };
}

const fixture = buildFixture();

/** 网络桩：记录调用次数，支持篡改与离线 */
function makeFetch(overrides: { failManifest?: boolean; tamper?: string } = {}) {
  const calls = { json: 0, bytes: 0 };
  return {
    calls,
    fetchJson: async (url: string) => {
      calls.json += 1;
      if (url.endsWith('manifest.json')) {
        if (overrides.failManifest) throw new Error('offline');
        return fixture.manifest;
      }
      throw new Error(`unexpected json url ${url}`);
    },
    fetchBytes: async (url: string) => {
      calls.bytes += 1;
      const name = url.split('/').pop()!;
      const bytes = fixture.files[name];
      if (!bytes) throw new Error(`unexpected bytes url ${url}`);
      if (overrides.tamper === name) {
        const copy = new Uint8Array(bytes);
        copy[10] = copy[10]! ^ 0xff;
        return copy;
      }
      return bytes;
    },
  };
}

let db: ExamFlowDB;

beforeEach(async () => {
  await new ExamFlowDB('pack-loader-test').delete();
  db = new ExamFlowDB('pack-loader-test');
  await db.open();
});

describe('packLoader · 加载编排', () => {
  it('首次加载走网络：sha256 校验通过后入库缓存', async () => {
    const net = makeFetch();
    const pack = await loadPack({ exam: EXAM, db, ...net });

    expect(pack.version).toBe(VERSION);
    expect(pack.words.map((w) => w.lemma)).toEqual(['alpha', 'beta', 'gamma']);
    expect(pack.lemmaMap).toEqual({ alphas: 'alpha', betas: 'beta' });
    expect(pack.stats).toEqual({ fromCache: 0, fromNetwork: 3, offline: false });
    expect(await db.packChunks.count()).toBe(3); // 2 chunks + lemma-map(n=-1)
    expect(net.calls.json).toBe(1);
  });

  it('二次加载全部命中缓存，不再发起网络请求', async () => {
    const first = makeFetch();
    await loadPack({ exam: EXAM, db, ...first });

    const second = makeFetch();
    const pack = await loadPack({ exam: EXAM, db, ...second });
    expect(pack.stats).toEqual({ fromCache: 3, fromNetwork: 0, offline: false });
    expect(second.calls.bytes).toBe(0);
    expect(second.calls.json).toBe(1); // manifest 每次仍探测网络（用于发现新版本）
    expect(pack.words).toHaveLength(3);
  });

  it('分块字节被篡改时 sha256 校验失败并给出明确错误', async () => {
    const net = makeFetch({ tamper: 'chunk-1.json' });
    await expect(loadPack({ exam: EXAM, db, ...net })).rejects.toThrow(/sha256 不匹配/);
    // 校验失败的分块不得入缓存
    expect(await db.packChunks.count()).toBe(1); // 只有 chunk-0 成功入库
  });

  it('manifest 拉取失败时退回离线缓存', async () => {
    await loadPack({ exam: EXAM, db, ...makeFetch() });

    const offline = makeFetch({ failManifest: true });
    const pack = await loadPack({ exam: EXAM, db, ...offline });
    expect(pack.stats.offline).toBe(true);
    expect(pack.version).toBe(VERSION);
    expect(pack.words.map((w) => w.lemma)).toEqual(['alpha', 'beta', 'gamma']);
    expect(offline.calls.bytes).toBe(0);
  });

  it('离线且无缓存时抛出原始网络错误', async () => {
    const net = makeFetch({ failManifest: true });
    await expect(loadPack({ exam: EXAM, db, ...net })).rejects.toThrow(/offline/);
  });

  it('onProgress 覆盖 manifest 之外的每一步（2 chunks + lemma-map）', async () => {
    const seen: Array<[number, number]> = [];
    await loadPack({ exam: EXAM, db, ...makeFetch(), onProgress: (d, t) => seen.push([d, t]) });
    expect(seen).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });

  it('deprecated 词被过滤，不出现在 words / wordById', async () => {
    const deprecatedFixture = structuredClone(fixture.manifest) as { deprecatedWordIds: string[] };
    deprecatedFixture.deprecatedWordIds = ['w_beta'];
    const net = makeFetch();
    net.fetchJson = async (url: string) => {
      if (url.endsWith('manifest.json')) return deprecatedFixture;
      throw new Error('unexpected');
    };
    const pack = await loadPack({ exam: EXAM, db, ...net });
    expect(pack.words.map((w) => w.lemma)).toEqual(['alpha', 'gamma']);
    expect(pack.wordById.has('w_beta')).toBe(false);
  });
});
