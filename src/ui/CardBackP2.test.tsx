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
  it('官方笔记（自动生成）与我的笔记分开呈现', () => {
    render(
      <ExamTipBlock
        tip={null}
        note="我的助记：别和 site 混"
        official={['词族：cit（唤起、刺激）—— excite / excitement / incite', '拼写在第 1 个字母处开始不同（cite / bite）。']}
        onSave={() => {}}
      />,
    );
    expect(screen.getByText(/由形近辨析与词族自动生成/)).toBeTruthy();
    expect(screen.getByText(/词族：cit/)).toBeTruthy();
    expect(screen.getByText(/我的助记：别和 site 混/)).toBeTruthy();
  });

  it('无官方笔记时不渲染该区块', () => {
    render(<ExamTipBlock tip={null} note="" official={[]} onSave={() => {}} />);
    expect(screen.queryByText(/由形近辨析与词族自动生成/)).toBeNull();
  });
});
