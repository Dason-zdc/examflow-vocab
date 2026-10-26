// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { RootFamilyIndex } from '../content/rootFamilies';
import type { ExamFlowDB } from '../storage/db';
import { RootsView } from './RootsView';

const state = vi.hoisted(() => ({ added: [] as string[] }));

vi.mock('../app/customWordsUseCase', () => ({
  addCustomWord: async (_db: unknown, input: { lemma: string }) => {
    state.added.push(input.lemma);
    return { wordId: 'w', cardId: 'c', alreadyExisted: false };
  },
}));

afterEach(cleanup);

const PAYLOAD = {
  version: '1.0.0',
  roots: {
    dict: {
      cn: '说',
      origin: '拉丁语',
      words: [
        ['predict', 'v.', '预言、预测', 900, 'pre(预先)+dict(说)'],
        ['contradict', 'v.', '反驳、与…矛盾', 1800, 'contra(相反)+dict(说)'],
        ['dictionary', 'n.', '词典', 2200, 'dict(说)+ion(…的行为)+ary(与…有关的)'],
      ],
    },
    port: {
      cn: '携带',
      origin: '拉丁语',
      words: [
        ['transport', 'v.', '运输', 1200, 'trans(跨越)+port(携带)'],
        ['export', 'v.', '出口', 1500, 'ex(向外)+port(携带)'],
      ],
    },
  },
};

function fakeIndex() {
  return new RootFamilyIndex({ fetchJson: async () => PAYLOAD });
}

const db = {} as ExamFlowDB;

describe('词根库', () => {
  it('列出词根家族，并按家族大小排序', async () => {
    render(<RootsView db={db} exam="IELTS" inPack={() => false} index={fakeIndex()} />);
    const list = await screen.findByLabelText('词根列表');
    expect(within(list).getByText('dict')).toBeTruthy();
    expect(within(list).getByText('说')).toBeTruthy();
    expect(screen.getByText('3 词')).toBeTruthy();
    expect(screen.getByText('2 词')).toBeTruthy();
  });

  it('选中词根后展示同根词与构词公式', async () => {
    render(<RootsView db={db} exam="IELTS" inPack={() => false} index={fakeIndex()} />);
    fireEvent.click(await screen.findByText('port'));
    expect(await screen.findByText('transport')).toBeTruthy();
    expect(screen.getByText('trans(跨越)+port(携带)')).toBeTruthy();
  });

  it('支持按中文义与家族成员搜索', async () => {
    render(<RootsView db={db} exam="IELTS" inPack={() => false} index={fakeIndex()} />);
    const list = await screen.findByLabelText('词根列表');
    fireEvent.change(screen.getByLabelText('搜索词根'), { target: { value: '携带' } });
    expect(within(list).queryByText('dict')).toBeNull();
    expect(within(list).getByText('port')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('搜索词根'), { target: { value: 'predict' } });
    expect(within(list).getByText('dict')).toBeTruthy();
    expect(within(list).queryByText('port')).toBeNull();
  });

  it('家族成员可加入生词本，词库内词不重复加入', async () => {
    render(<RootsView db={db} exam="IELTS" inPack={(lemma) => lemma === 'predict'} index={fakeIndex()} />);
    expect(await screen.findByText('词库内')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '加入生词本 contradict' }));
    expect(await screen.findByText('已加入')).toBeTruthy();
    expect(state.added).toEqual(['contradict']);
  });
});
