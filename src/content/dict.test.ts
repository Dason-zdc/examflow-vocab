import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FullDictionary, inflectionCandidates, shardOf, splitSenses } from './dict';

/** 用真实产物跑测试：词典是静态数据，夹具另造一份只会掩盖构建脚本的错。 */
const DICT_DIR = join(process.cwd(), 'public', 'dict');
const read = (file: string) => readFileSync(join(DICT_DIR, file), 'utf8');

function makeDict(overrides: { fetchText?: (url: string) => Promise<string> } = {}) {
  return new FullDictionary({
    base: 'dict/',
    cacheName: 'test-dict',
    fetchJson: async (url) => JSON.parse(read(url.replace(/^dict\//, '').split('?')[0]!)),
    fetchText: overrides.fetchText ?? (async (url) => read(url.replace(/^dict\//, '').split('?')[0]!)),
  });
}

describe('FullDictionary · 全量查词', () => {
  it('精确命中词条：音标、词性释义、词频都在', async () => {
    const entry = await makeDict().lookup('trammel');
    expect(entry).not.toBeNull();
    expect(entry!.lemma).toBe('trammel');
    expect(entry!.phonetic).not.toBe('');
    expect(entry!.senses[0]!.pos).toBe('n.');
    expect(entry!.senses.some((s) => s.cn.includes('束缚'))).toBe(true);
    expect(entry!.rank).toBeGreaterThan(0);
    expect(entry!.inflected).toBe(false);
  });

  it('不规则变形走分片内变形表：mice → mouse', async () => {
    const entry = await makeDict().lookup('mice');
    expect(entry!.lemma).toBe('mouse');
    expect(entry!.surface).toBe('mice');
    expect(entry!.inflected).toBe(true);
  });

  it('跨首字母的不规则变形也能还原：went → go', async () => {
    const entry = await makeDict().lookup('went');
    expect(entry!.lemma).toBe('go');
    expect(entry!.inflected).toBe(true);
  });

  it('规则变形按后缀还原：trammels → trammel', async () => {
    const entry = await makeDict().lookup('trammels');
    expect(entry!.lemma).toBe('trammel');
    expect(entry!.inflected).toBe(true);
  });

  it('所有格撇号先剥再查：council\'s → council', async () => {
    const entry = await makeDict().lookup("council's");
    expect(entry!.lemma).toBe('council');
  });

  it('查不到就如实返回 null，不猜词', async () => {
    const dict = makeDict();
    expect(await dict.lookup('swosh')).toBeNull();
    expect(await dict.lookup('zzzzqqq')).toBeNull();
    expect(await dict.lookup('   ')).toBeNull();
  });

  it('前缀搜索只落在首字母分片，按词频升序', async () => {
    const hits = await makeDict().search('tram', 10);
    expect(hits.map((h) => h.lemma)).toContain('trammel');
    expect(hits.every((h) => h.lemma.startsWith('tram'))).toBe(true);
    const ranks = hits.map((h) => h.rank || Number.MAX_SAFE_INTEGER);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  });

  it('分片浏览带总数，便于词典页分页', async () => {
    const page = await makeDict().browse('x', 0, 5);
    expect(page.total).toBeGreaterThan(0);
    expect(page.entries.length).toBeLessThanOrEqual(5);
    expect(page.entries.every((e) => e.lemma.startsWith('x'))).toBe(true);
  });

  it('manifest 拉不到时整层降级为 null，不抛错', async () => {
    const dict = new FullDictionary({
      base: 'dict/',
      fetchJson: async () => {
        throw new Error('offline');
      },
      fetchText: async () => {
        throw new Error('offline');
      },
    });
    expect(await dict.manifest()).toBeNull();
    expect(await dict.lookup('trammel')).toBeNull();
  });

  it('分片 sha256 不匹配即拒绝加载', async () => {
    const dict = makeDict({
      fetchText: async (url) => (url.includes('t.json') ? '{"e":[]}' : read(url.replace(/^dict\//, '').split('?')[0]!)),
    });
    expect(await dict.lookup('trammel')).toBeNull();
  });
});

describe('FullDictionary · 解析与变形规则', () => {
  it('释义按词性切行，无词性的续行并入上一义项', () => {
    expect(splitSenses('n. 债券；vt. 结合；比喻用法')).toEqual([
      { pos: 'n.', cn: '债券' },
      { pos: 'vt.', cn: '结合，比喻用法' },
    ]);
    expect(splitSenses('仅中文')).toEqual([{ pos: '', cn: '仅中文' }]);
  });

  it('分片键：字母归本身，其余归 _', () => {
    expect(shardOf('Trammel')).toBe('t');
    expect(shardOf('3D')).toBe('_');
    expect(shardOf('')).toBe('_');
  });

  it('变形候选覆盖复数、过去式、进行时、比较级与双写辅音', () => {
    expect(inflectionCandidates('studies')).toContain('study');
    expect(inflectionCandidates('stopped')).toContain('stop');
    expect(inflectionCandidates('making')).toContain('make');
    expect(inflectionCandidates('bigger')).toContain('big');
    expect(inflectionCandidates('wives')).toContain('wife');
    expect(inflectionCandidates('happily')).toContain('happy');
  });

  it('不会把短词切坏', () => {
    expect(inflectionCandidates('as')).toEqual([]);
    expect(inflectionCandidates('is')).toEqual([]);
  });
});
