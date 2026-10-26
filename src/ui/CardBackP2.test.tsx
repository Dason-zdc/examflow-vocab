// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

afterEach(() => cleanup());
import { WordHeaderBar } from './WordHeaderBar';
import { ExamTipBlock } from './CardBackBlocks';
import type { PackWord } from '../content/packVerifier';

const word: PackWord = {
  id: 'w_cite',
  lemma: 'cite',
  phoneticUk: '/sait/',
  phoneticUs: '/saɪt/',
  isBasic: false,
  forms: [],
  senses: [],
  sentences: [],
  confusables: [],
};

describe('P2-1 顶部信息条', () => {
  it('一行收敛：词头 + 双音标 + 收藏 + 拼写，并带键位提示', () => {
    const played: string[] = [];
    render(
      <WordHeaderBar
        word={word}
        starred={false}
        onToggleStar={() => {}}
        onPlay={(a) => played.push(a)}
        onOpenSpell={() => {}}
      />,
    );
    expect(screen.getByText('cite')).toBeTruthy();
    expect(screen.getByText('/sait/')).toBeTruthy();
    expect(screen.getByText('/saɪt/')).toBeTruthy();
    expect(screen.getByRole('button', { name: /收藏/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /拼写/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '朗读 cite（英式）' }));
    expect(played).toEqual(['uk']);
  });

  it('已收藏时切换标签为「已收藏」', () => {
    let toggled = 0;
    render(
      <WordHeaderBar
        word={word}
        starred
        onToggleStar={() => { toggled += 1; }}
        onPlay={() => {}}
        onOpenSpell={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /取消收藏/ }));
    expect(toggled).toBe(1);
  });
});

describe('P2-2 笔记体系', () => {
  it('我的笔记独立呈现，不与助记混在一起', () => {
    render(<ExamTipBlock tip={null} note="我的助记：别和 site 混" onSave={() => {}} />);
    expect(screen.getByText(/我的助记：别和 site 混/)).toBeTruthy();
  });

  it('没有笔记时不渲染笔记块', () => {
    render(<ExamTipBlock tip={null} note="" onSave={() => {}} />);
    expect(screen.queryByText(/我的笔记/)).toBeNull();
  });
});
