import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { createHash } from 'node:crypto';
import { ExamFlowDB } from '../storage/db';
import { putCachedChunk } from './packCache';
import { fetchPackBytes, fetchPackJson } from './packLoader';
import {
  createMemoryFlagStore,
  isRecoverablePackError,
  loadPackWithRecovery,
  purgePackRuntime,
  PackRecoveryError,
  type PackRecoveryHooks,
  type PackRuntimeEnv,
} from './packRecovery';
import { PackFormatError, type PackWord } from './packVerifier';

/**
 * 回归测试：数据包加载不得被陈旧缓存卡死。
 * 1. 网络请求必须显式绕过 HTTP 缓存（去掉 cache:'reload' 即失败）；
 * 2. 加载期撞上 PackFormatError / sha256 不匹配必须走「清理 + 只重载一次」，
 *    而不是把错误直接抛到 UI 让用户永久卡住（去掉自愈逻辑即失败）。
 */

const EXAM = 'IELTS' as const;
const OTHER_EXAM = 'CET6' as const;
const VERSION = '1.5.0';
const STALE = '1.4.0';

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
  };
}

function bytesOf(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function chunkPayload(version: string, n: number): Record<string, unknown> {
  const words = [word('alpha'), word('beta')];
  return { exam: EXAM, version, chunk: n, wordCount: words.length, words };
}

function lemmaPayload(version: string): Record<string, unknown> {
  return { exam: EXAM, version, entries: 1, map: { alphas: 'alpha' } };
}

const FILES: Record<string, Uint8Array> = {
  'chunk-0.json': bytesOf(chunkPayload(VERSION, 0)),
  'lemma-map.json': bytesOf(lemmaPayload(VERSION)),
};

const MANIFEST: Record<string, unknown> = {
  exam: EXAM,
  version: VERSION,
  minAppVersion: '1.0.0',
  generatedAt: '2026-10-22T00:00:00Z',
  wordCount: 2,
  chunkSize: 300,
  chunks: [
    {
      n: 0,
      file: 'chunk-0.json',
      wordCount: 2,
      sha256: sha256Of(FILES['chunk-0.json']!),
      bytes: FILES['chunk-0.json']!.length,
    },
  ],
  lemmaMap: {
    file: 'lemma-map.json',
    sha256: sha256Of(FILES['lemma-map.json']!),
    bytes: FILES['lemma-map.json']!.length,
    entries: 1,
  },
  deprecatedWordIds: [],
  frequencyMethod: 'test',
  provenanceNote: 'test',
  sources: [],
  license: 'test',
};

function makeFetch(overrides: { failManifest?: boolean; bytes?: Record<string, Uint8Array> } = {}) {
  return {
    fetchJson: async (url: string) => {
      if (url.endsWith('manifest.json')) {
        if (overrides.failManifest) throw new Error('offline');
        return MANIFEST;
      }
      throw new Error(`unexpected json url ${url}`);
    },
    fetchBytes: async (url: string) => {
      const name = url.split('/').pop() ?? '';
      const bytes = (overrides.bytes ?? FILES)[name];
      if (!bytes) throw new Error(`unexpected bytes url ${url}`);
      return bytes;
    },
  };
}

/** 假运行时：workbox 缓存 + 一个已注册的 SW */
function fakeEnv() {
  const deleted: string[] = [];
  let unregistered = 0;
  const env: PackRuntimeEnv = {
    caches: {
      keys: async () => ['workbox-precache-v2-https://example.test/', 'app-shell'],
      delete: async (key: string) => {
        deleted.push(key);
        return true;
      },
    } as unknown as CacheStorage,
    serviceWorker: {
      getRegistrations: async () => [
        {
          unregister: async () => {
            unregistered += 1;
            return true;
          },
        },
      ],
    } as unknown as ServiceWorkerContainer,
  };
  return { env, deleted, unregistered: () => unregistered };
}

function makeRecovery(env: PackRuntimeEnv) {
  const flags = createMemoryFlagStore();
  let reloads = 0;
  const recovery: Partial<PackRecoveryHooks> = {
    flags,
    reload: () => {
      reloads += 1;
    },
    purge: (db, exam) => purgePackRuntime(db, exam, env),
  };
  return { recovery, flags, reloads: () => reloads };
}

/** 制造「中毒」缓存：key 标称当前版本，内容却是上一代（invalidateStaleChunks 删不掉它） */
async function seedPoisonedChunk(db: ExamFlowDB): Promise<void> {
  await putCachedChunk(db, { exam: EXAM, version: VERSION, n: 0, payload: chunkPayload(STALE, 0) });
  await putCachedChunk(db, { exam: EXAM, version: STALE, n: 0, payload: chunkPayload(STALE, 0) });
  await putCachedChunk(db, { exam: OTHER_EXAM, version: VERSION, n: 0, payload: { exam: OTHER_EXAM } });
}

let db: ExamFlowDB;

beforeEach(async () => {
  await new ExamFlowDB('pack-recovery-test').delete();
  db = new ExamFlowDB('pack-recovery-test');
  await db.open();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('数据包请求绕过 HTTP 缓存', () => {
  it('fetchPackJson / fetchPackBytes 都显式带 cache: reload', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ hello: 'world' }), { status: 200 });
      }),
    );

    const json = await fetchPackJson('/packs/IELTS/manifest.json');
    const bytes = await fetchPackBytes('/packs/IELTS/chunk-0.json');

    expect(json).toEqual({ hello: 'world' });
    expect(new TextDecoder().decode(bytes)).toBe(JSON.stringify({ hello: 'world' }));
    expect(calls.map((c) => c.url)).toEqual(['/packs/IELTS/manifest.json', '/packs/IELTS/chunk-0.json']);
    for (const call of calls) expect(call.init?.cache).toBe('reload');
  });

  it('非 2xx 时沿用原有的错误文案', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    await expect(fetchPackJson('/packs/IELTS/manifest.json')).rejects.toThrow(/-> 404/);
    await expect(fetchPackBytes('/packs/IELTS/chunk-0.json')).rejects.toThrow(/-> 404/);
  });
});

describe('数据包自愈', () => {
  it('缓存里的 chunk 版本不一致时清理本地缓存并只重载一次', async () => {
    await seedPoisonedChunk(db);
    const { env, deleted, unregistered } = fakeEnv();
    const { recovery, reloads } = makeRecovery(env);

    const err: unknown = await loadPackWithRecovery({ exam: EXAM, db, ...makeFetch(), recovery }).catch((e) => e);

    expect(err).toBeInstanceOf(PackRecoveryError);
    expect((err as Error).message).toContain('chunk.version=1.4.0');
    expect(reloads()).toBe(1);
    expect(deleted).toEqual(['workbox-precache-v2-https://example.test/']);
    expect(unregistered()).toBe(1);
    // 本考试的分块（含同版本中毒行）全清，其它考试不受影响
    expect(await db.packChunks.where('exam').equals(EXAM).count()).toBe(0);
    expect(await db.packChunks.where('exam').equals(OTHER_EXAM).count()).toBe(1);
  });

  it('自愈后仍然失败时不再重载，把原始 PackFormatError 交给 UI', async () => {
    await seedPoisonedChunk(db);
    const { env } = fakeEnv();
    const { recovery, reloads } = makeRecovery(env);

    await expect(loadPackWithRecovery({ exam: EXAM, db, ...makeFetch(), recovery })).rejects.toBeInstanceOf(
      PackRecoveryError,
    );
    await seedPoisonedChunk(db);
    const second: unknown = await loadPackWithRecovery({ exam: EXAM, db, ...makeFetch(), recovery }).catch((e) => e);

    expect(second).toBeInstanceOf(PackFormatError);
    expect(reloads()).toBe(1); // 绝不进入刷新循环
  });

  it('加载成功后解除一次性标记，后续真正损坏时还能再自愈', async () => {
    const { env } = fakeEnv();
    const { recovery, flags, reloads } = makeRecovery(env);

    await loadPackWithRecovery({ exam: EXAM, db, ...makeFetch(), recovery });
    expect(flags.has(EXAM)).toBe(false);

    await seedPoisonedChunk(db);
    await expect(loadPackWithRecovery({ exam: EXAM, db, ...makeFetch(), recovery })).rejects.toBeInstanceOf(
      PackRecoveryError,
    );
    expect(reloads()).toBe(1);
    expect(flags.has(EXAM)).toBe(true);
  });

  it('sha256 不匹配同样触发自愈（陈旧缓存串代的另一种表现）', async () => {
    const bytes: Record<string, Uint8Array> = { ...FILES };
    const tampered = new Uint8Array(FILES['chunk-0.json']!);
    tampered[10] = tampered[10]! ^ 0xff;
    bytes['chunk-0.json'] = tampered;

    const { env } = fakeEnv();
    const { recovery, reloads } = makeRecovery(env);

    await expect(
      loadPackWithRecovery({ exam: EXAM, db, ...makeFetch({ bytes }), recovery }),
    ).rejects.toBeInstanceOf(PackRecoveryError);
    expect(reloads()).toBe(1);
    expect(await db.packChunks.count()).toBe(0); // 校验失败的分块不得残留
  });

  it('网络失败不属于缓存中毒：不清理、不重载，原样上抛', async () => {
    const { env, deleted } = fakeEnv();
    const { recovery, reloads } = makeRecovery(env);

    await expect(
      loadPackWithRecovery({ exam: EXAM, db, ...makeFetch({ failManifest: true }), recovery }),
    ).rejects.toThrow(/offline/);
    expect(reloads()).toBe(0);
    expect(deleted).toEqual([]);
  });

  it('没有 workbox 缓存时不注销 Service Worker，保留离线能力', async () => {
    await seedPoisonedChunk(db);
    const env: PackRuntimeEnv = {
      caches: {
        keys: async () => ['app-shell'],
        delete: async () => true,
      } as unknown as CacheStorage,
      serviceWorker: {
        getRegistrations: async () => [{ unregister: async () => true }],
      } as unknown as ServiceWorkerContainer,
    };

    const report = await purgePackRuntime(db, EXAM, env);

    expect(report).toEqual({ exam: EXAM, dbRows: 2, caches: [], serviceWorkers: 0 });
  });

  it('可自愈判定只覆盖缓存中毒类错误', () => {
    expect(isRecoverablePackError(new PackFormatError('chunk.version 不一致'))).toBe(true);
    expect(isRecoverablePackError(new Error('数据包校验失败：chunk-0.json sha256 不匹配'))).toBe(true);
    expect(isRecoverablePackError(new Error('offline'))).toBe(false);
    expect(isRecoverablePackError(new Error('数据包 IELTS 没有任何可用单词'))).toBe(false);
  });
});
