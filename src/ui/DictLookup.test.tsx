// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { FullDictionary } from '../content/dict';
import { sha256Hex } from '../content/packVerifier';
import { WordPreviewModal } from './WordPreviewModal';
import { LookupModal } from './LookupModal';

afterEach(() => cleanup());

const ROWS: Array<[string, string, string, number]> = [
  ['trammel', 'træml', 'n. 鱼网, 拘束, 束缚；vt. 拘束, 束缚', 42080],
  ['tremble', 'trembl', 'vi. 发抖, 颤抖；n. 颤抖', 5120],
];

async function fakeDict(): Promise<FullDictionary> {
  const text = JSON.stringify({ e: ROWS, f: { trammels: 'trammel' } });
  const sha256 = await sha256Hex(new TextEncoder().encode(text));
  const manifest = {
    version: 'test',
    fingerprint: 'test',
    generatedAt: '',
    count: ROWS.length,
    formCount: 1,
    source: { name: 'ECDICT', url: '', license: 'MIT', used: '' },
    shards: [{ id: 't', file: 't.json', entries: ROWS.length, forms: 1, bytes: text.length, sha256 }],
  };
  return new FullDictionary({
    base: 'dict/',
    cacheName: 'ui-test-dict',
    fetchJson: async () => manifest,
    fetchText: async () => text,
  });
}

describe('WordPreviewModal · 词典兜底', () => {
  it('数据包未收录时展示词典释义，而不是「未收录」', async () => {
    const dict = await fakeDict();
    render(<WordPreviewModal lemma="trammel" word={null} exam="IELTS" onClose={() => {}} dict={dict} />);
    expect(await screen.findByText('鱼网, 拘束, 束缚')).toBeTruthy();
    expect(screen.getByText('词典')).toBeTruthy();
    expect(screen.getByText('低频词')).toBeTruthy();
    expect(screen.queryByText(/均未收录/)).toBeNull();
  });

  it('查不到时才说两边都没有', async () => {
    const dict = await fakeDict();
    render(<WordPreviewModal lemma="swosh" word={null} exam="IELTS" onClose={() => {}} dict={dict} />);
    expect(await screen.findByText(/词库与词典均未收录/)).toBeTruthy();
  });
});

describe('LookupModal · 词典释义可带入生词本', () => {
  it('库外词显示释义，并把首个义项填进自定义词条', async () => {
    const dict = await fakeDict();
    render(
      <LookupModal
        open
        surface="trammel"
        word={null}
        exam="IELTS"
        starred={false}
        onClose={() => {}}
        onPlay={() => {}}
        onAdd={async () => {}}
        dict={dict}
      />,
    );
    expect(await screen.findByText('鱼网, 拘束, 束缚')).toBeTruthy();
    await waitFor(() => expect((screen.getByLabelText('中文释义') as HTMLInputElement).value).toBe('鱼网, 拘束, 束缚'));
  });
});

