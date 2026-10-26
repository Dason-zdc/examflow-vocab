// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MorphologyCard } from './MorphologyCard';

afterEach(cleanup);

vi.mock('../content/rootFamilies', () => ({
  rootFamilies: {
    family: async (root: string) => {
      if (root !== 'sist') return null;
      return {
        root: 'sist',
        cn: '站',
        origin: '拉丁语',
        words: [
          { lemma: 'insist', pos: 'v.', cn: '坚持', formula: 'in+sist' },
          { lemma: 'resist', pos: 'v.', cn: '抵抗', formula: 're+sist' },
          { lemma: 'assist', pos: 'v.', cn: '协助', formula: 'as+sist' },
          { lemma: 'persist', pos: 'v.', cn: '持续', formula: 'per+sist' },
          { lemma: 'consist', pos: 'v.', cn: '由…组成', formula: 'con+sist' },
        ],
      };
    },
  },
}));

function renderCard(
  options: {
    lemma?: string;
    senseCn?: string;
    open?: boolean;
    known?: string[];
    onOpenWord?: (lemma: string) => void;
    onOpenRoots?: () => void;
  } = {},
) {
  const { lemma = 'consist', senseCn = '由…组成；在于', open = true, known = ['insist', 'resist', 'assist'], onOpenWord, onOpenRoots } = options;
  return render(
    <MorphologyCard
      lemma={lemma}
      senseCn={senseCn}
      open={open}
      onToggle={() => {}}
      knownLemmas={new Set(known)}
      {...(onOpenWord ? { onOpenWord } : {})}
      {...(onOpenRoots ? { onOpenRoots } : {})}
    />,
  );
}

describe('词根记忆链（卡片背面）', () => {
  it('四步压成一行：con(一起) + sist(站) → 站到一起 → ？', () => {
    renderCard();
    const chain = screen.getByTestId('memory-chain');
    expect(chain.textContent).toContain('con');
    expect(chain.textContent).toContain('(一起)');
    expect(chain.textContent).toContain('sist');
    expect(chain.textContent).toContain('(站)');
    expect(chain.textContent).toContain('站到一起');
    // 链尾词义默认遮住：先回忆，再点开
    expect(screen.queryByText('由…组成')).toBeNull();
  });

  it('点「?」揭示词义，而不是一上来就把答案摊开', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: /回忆词义/ }));
    expect(screen.getByText('由…组成')).toBeTruthy();
  });

  it('只列学过的同根词，最多 3 个；没学过的不出现', async () => {
    renderCard();
    expect(await screen.findByRole('button', { name: 'insist' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'resist' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'assist' })).toBeTruthy();
    // persist 不在已学集合里，consist 是当前词
    expect(screen.queryByRole('button', { name: 'persist' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'consist' })).toBeNull();
  });

  it('一个同根词都没学过时，不显示同根行', async () => {
    renderCard({ known: [] });
    expect(screen.getByTestId('memory-chain')).toBeTruthy();
    // 等异步家族加载完再断言
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('同根')).toBeNull();
  });

  it('同根词可点开查词', async () => {
    const opened: string[] = [];
    renderCard({ onOpenWord: (lemma) => opened.push(lemma) });
    fireEvent.click(await screen.findByRole('button', { name: 'insist' }));
    expect(opened).toEqual(['insist']);
  });

  it('拆解明细保留事实层：成分教学义与词源', () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '拆解 · 演变 · 同根词' }));
    expect(screen.getByText('拉丁语 · sistere')).toBeTruthy();
    expect(screen.getByText('站立、坚持')).toBeTruthy();
  });

  it('展开后显示词义演变与同根词拓展', async () => {
    renderCard();
    fireEvent.click(screen.getByRole('button', { name: '拆解 · 演变 · 同根词' }));
    expect(screen.getByTestId('morph-story').textContent).toContain('consistere');
    expect(await screen.findByTestId('morph-cognates')).toBeTruthy();
  });

  it('标出记忆链来源（AI 起草不冒充人工）', () => {
    renderCard();
    expect(screen.getByText('助记 · AI 起草')).toBeTruthy();
  });

  it('自动拆分与无链词渲染最小区块，保留问 AI 入口', () => {
    const { container } = renderCard({ lemma: 'deformation' });
    expect(container.querySelector('[aria-label="词根记忆链"]')).toBeTruthy();
    expect(screen.getByText('暂无人工背书的拆解')).toBeTruthy();
    expect(screen.getByRole('button', { name: '问 AI 核对' })).toBeTruthy();
  });

  it('收起时只留标题行', () => {
    renderCard({ open: false });
    expect(screen.queryByTestId('memory-chain')).toBeNull();
    expect(screen.getByText('con + sist')).toBeTruthy();
  });

  it('词根库入口可选', () => {
    const onOpenRoots = vi.fn();
    renderCard({ onOpenRoots });
    fireEvent.click(screen.getByRole('button', { name: '词根库' }));
    expect(onOpenRoots).toHaveBeenCalledTimes(1);
  });
});
