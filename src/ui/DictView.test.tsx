// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FullDictionary } from '../content/dict';
import { sha256Hex } from '../content/packVerifier';
import { ExamFlowDB } from '../storage/db';
import { DictView } from './DictView';

afterEach(() => cleanup());

const SHARDS: Record<string, Array<[string, string, string, number]>> = {
  a: [
    ['abandon', 'əˈbændən', 'vt. 放弃, 抛弃；n. 放任', 2100],
    ['ability', 'əˈbɪləti', 'n. 能力, 才能', 1500],
  ],
  t: [['trammel', 'træml', 'n. 鱼网, 拘束；vt. 束缚', 42080]],
};

async function fakeDict(): Promise<FullDictionary> {
  const texts = Object.fromEntries(
    Object.entries(SHARDS).map(([id, rows]) => [id, JSON.stringify({ e: rows })]),
  );
  const shards = await Promise.all(
    Object.entries(texts).map(async ([id, text]) => ({
      id,
      file: `${id}.json`,
      entries: SHARDS[id]!.length,
      forms: 0,
      bytes: text.length,
      sha256: await sha256Hex(new TextEncoder().encode(text)),
    })),
  );
  const manifest = {
    version: 'test',
    fingerprint: 'test',
    generatedAt: '',
    count: Object.values(SHARDS).reduce((n, rows) => n + rows.length, 0),
    formCount: 0,
    source: { name: 'ECDICT', url: '', license: 'MIT', used: '' },
    shards,
  };
  return new FullDictionary({
    base: 'dict/',
    cacheName: 'view-test-dict',
    fetchJson: async () => manifest,
    fetchText: async (url) =>
      texts[url.replace(/^dict\//, '').split('?')[0]!.replace(/\.json$/, '')] ?? '{"e":[]}',
  });
}

function makeDb(): ExamFlowDB {
  return new ExamFlowDB(`dict-view-test-${Math.random().toString(36).slice(2)}`);
}

describe('DictView · 全量词典页', () => {
  it('按首字母浏览、切分片、查看详情并可加入生词本', async () => {
    const dict = await fakeDict();
    const db = makeDb();
    render(<DictView db={db} exam="IELTS" inPack={() => false} dict={dict} />);

    expect(await screen.findByText('abandon')).toBeTruthy();
    expect(screen.getByText(/全量 3 词/)).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: 'T' }));
    expect(await screen.findByText('trammel')).toBeTruthy();

    fireEvent.click(screen.getByText('trammel'));
    expect(await screen.findByText('鱼网, 拘束')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '加入生词本' }));
    expect(await screen.findByText('已加入生词本')).toBeTruthy();

    await db.delete();
  });

  it('搜索前缀只返回该前缀的词', async () => {
    const dict = await fakeDict();
    const db = makeDb();
    render(<DictView db={db} exam="IELTS" inPack={() => false} dict={dict} />);
    fireEvent.change(screen.getByLabelText('查任意单词'), { target: { value: 'tram' } });
    expect(await screen.findByText('trammel')).toBeTruthy();
    expect(screen.queryByText('abandon')).toBeNull();
    await db.delete();
  });

  it('词包内的词不再重复加生词本', async () => {
    const dict = await fakeDict();
    const db = makeDb();
    render(<DictView db={db} exam="IELTS" inPack={(lemma) => lemma === 'trammel'} dict={dict} />);
    fireEvent.click(await screen.findByRole('tab', { name: 'T' }));
    fireEvent.click(await screen.findByText('trammel'));
    expect(await screen.findByText('已在当前考试词库')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '加入生词本' })).toBeNull();
    await db.delete();
  });
});
