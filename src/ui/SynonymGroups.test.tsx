// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { SynonymGroups } from './SynonymGroups';
import { NetworkBlock } from './CardBackBlocks';
import type { SynonymGroup } from '../domain/types';

afterEach(() => cleanup());

const groups: SynonymGroup[] = [
  {
    synset: 'oewn-02659476-v',
    gloss: 'originate (in)',
    frame: 'in',
    candidates: [
      { lemma: 'dwell', pos: 'v.', status: 'DIRECT', inPack: false },
      { lemma: 'lie', pos: 'v.', status: 'DIRECT', inPack: false },
    ],
  },
  {
    synset: 'oewn-02639437-v',
    gloss: 'be composed of',
    frame: 'of',
    candidates: [
      {
        lemma: 'comprise',
        pos: 'v.',
        status: 'REWRITE',
        inPack: true,
        rewrite: 'consist of O → comprise O',
        note: '同义集内，但它在此义项直接带宾语，需去掉介词',
      },
      {
        lemma: 'dwell',
        pos: 'v.',
        status: 'CONFLICT',
        inPack: false,
        note: '该义项语料里它带 in，不带 of',
      },
    ],
  },
];

describe('SynonymGroups · 义项级同义替换 (US-08)', () => {
  it('按义项分组渲染：每组带英文释义与搭配框架', () => {
    render(<SynonymGroups groups={groups} onOpenWord={() => {}} />);
    expect(screen.getByText('originate (in)')).toBeTruthy();
    expect(screen.getByText('+ in')).toBeTruthy();
    expect(screen.getByText('be composed of')).toBeTruthy();
    expect(screen.getByText('+ of')).toBeTruthy();
  });

  it('五态以徽章呈现，而不是把候选混成一堆', () => {
    render(<SynonymGroups groups={groups} onOpenWord={() => {}} />);
    expect(screen.getAllByText('可替换')).toHaveLength(2);
    expect(screen.getByText('需改写')).toBeTruthy();
    expect(screen.getByText('搭配不符')).toBeTruthy();
  });

  it('需改写给出替换模板，搭配不符给出理由', () => {
    render(<SynonymGroups groups={groups} onOpenWord={() => {}} />);
    expect(screen.getByText('consist of O → comprise O')).toBeTruthy();
    expect(screen.getByText('该义项语料里它带 in，不带 of')).toBeTruthy();
  });

  it('库内候选可跳词条，库外候选只是文本（不给出虚假入口）', () => {
    const opened: string[] = [];
    render(<SynonymGroups groups={groups} onOpenWord={(lemma) => opened.push(lemma)} />);
    fireEvent.click(screen.getByRole('button', { name: 'comprise' }));
    expect(opened).toEqual(['comprise']);
    expect(screen.queryByRole('button', { name: 'dwell' })).toBeNull();
  });

  it('没有同义数据时明确说明，而不是渲染空分组', () => {
    render(<SynonymGroups groups={[]} onOpenWord={() => {}} />);
    expect(screen.getByText('该义项暂无同义替换数据')).toBeTruthy();
  });
});

describe('NetworkBlock · 同义区块接入', () => {
  it('标题行统计候选数与义项组数，展开后按义项渲染', () => {
    render(<NetworkBlock confusables={[]} synonyms={groups} open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(screen.getByText('4 同义')).toBeTruthy();
    expect(screen.getByText('2 个义项')).toBeTruthy();
    expect(screen.getByText('be composed of')).toBeTruthy();
  });

  it('没有同义数据时不谎报分组数', () => {
    render(<NetworkBlock confusables={[]} synonyms={[]} open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(screen.getByText('0 同义')).toBeTruthy();
    expect(screen.queryByText(/个义项/)).toBeNull();
    expect(screen.getByText('该义项暂无同义替换数据')).toBeTruthy();
  });
});
