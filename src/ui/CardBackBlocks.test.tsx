// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfusableBlock, IeltsRewriteBlock } from './CardBackBlocks';
import { confusablePairsFor } from '../content/confusables';
import { rewritesFor } from '../content/ieltsRewrites';
import type { SynonymGroup } from '../domain/types';

afterEach(() => cleanup());

describe('易混词块', () => {
  it('人工高危对：当前词在前，给一条线索 + 一组对比例句', () => {
    render(<ConfusableBlock lemma="affect" open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(screen.getByText('affect')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'effect' })).toBeTruthy();
    expect(screen.getByText(/v\.（Action/)).toBeTruthy();
    expect(screen.getByText('The delay affected the whole schedule.')).toBeTruthy();
    expect(screen.getByText('The delay had a serious effect on the schedule.')).toBeTruthy();
  });

  it('当前词在 B 侧时线索顺序也对调', () => {
    render(<ConfusableBlock lemma="effect" open onToggle={() => {}} onOpenWord={() => {}} />);
    const cue = screen.getByText(/End result/).textContent ?? '';
    // 先讲 effect，再讲 affect
    expect(cue.indexOf('effect')).toBeLessThan(cue.indexOf('affect'));
  });

  it('没有人工高危对、也没有形近词数据时整块不渲染', () => {
    const { container } = render(<ConfusableBlock lemma="consist" open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('无人工高危对时降级为「词形相近」：只列词与释义，不冒充高频混淆', () => {
    render(
      <ConfusableBlock
        lemma="consist"
        open
        onToggle={() => {}}
        onOpenWord={() => {}}
        confusables={[
          { lemma: 'consult', reason: 'SPELLING', tip: '拼写在第 5 个字母处开始不同', cn: '商讨、协商' },
          { lemma: 'contest', reason: 'SPELLING', tip: '拼写在第 4 个字母处开始不同', cn: '竞赛、争论' },
          { lemma: 'convict', reason: 'SPELLING', tip: '拼写在第 4 个字母处开始不同', cn: '囚犯' },
        ]}
      />,
    );
    expect(screen.getByText('词形相近')).toBeTruthy();
    expect(screen.getByText('拼写或读音接近，未必是高频混淆')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'consult' })).toBeTruthy();
    expect(screen.getByText('商讨、协商')).toBeTruthy();
    // 最多 2 条，不铺满
    expect(screen.queryByRole('button', { name: 'convict' })).toBeNull();
    // 不把 ETL 的模板 tip 当正文摊出来
    expect(screen.queryByText(/拼写在第/)).toBeNull();
  });

  it('答错过的词允许看 2 对，没答错只看 1 对', () => {
    expect(confusablePairsFor('affect', { lapses: 0 })).toHaveLength(1);
    expect(confusablePairsFor('affect', { lapses: 2 }).length).toBeGreaterThanOrEqual(1);
    // 单对数据不会因为 lapses 被复制成两对
    expect(confusablePairsFor('affect', { lapses: 2 })).toHaveLength(1);
  });

  it('点对照词可跳查', () => {
    const opened: string[] = [];
    render(<ConfusableBlock lemma="affect" open onToggle={() => {}} onOpenWord={(l) => opened.push(l)} />);
    fireEvent.click(screen.getByRole('button', { name: 'effect' }));
    expect(opened).toEqual(['effect']);
  });
});

describe('雅思改写块', () => {
  it('按义项给少量高频改写，每条带中文', () => {
    render(<IeltsRewriteBlock lemma="significant" senseCn="显著的、重要的" />);
    expect(screen.getByText('considerable')).toBeTruthy();
    expect(screen.getByText('相当大的')).toBeTruthy();
    expect(screen.getByText('substantial')).toBeTruthy();
  });

  it('义项对不上就不贴：decline「婉拒」义项不显示「下降」的改写', () => {
    const { container } = render(<IeltsRewriteBlock lemma="decline" senseCn="婉拒、谢绝" />);
    expect(container.firstChild).toBeNull();
  });

  it('义项对上才显示', () => {
    render(<IeltsRewriteBlock lemma="decline" senseCn="下降、衰退" />);
    expect(screen.getByText('decrease')).toBeTruthy();
    expect(screen.getByText('drop')).toBeTruthy();
  });

  it('只保留「需改写」一种徽章', () => {
    render(<IeltsRewriteBlock lemma="consist" senseCn="由…组成；在于" />);
    expect(screen.getAllByText('需改写')).toHaveLength(3);
    // 五态里的其它徽章不再出现
    expect(screen.queryByText('可替换')).toBeNull();
    expect(screen.queryByText('框架一致')).toBeNull();
    expect(screen.queryByText('搭配不符')).toBeNull();
    expect(screen.getByText('consist of A → comprise A（去掉 of）')).toBeTruthy();
  });

  it('没有人工数据时回退到 WordNet 义项级同义：DIRECT 照常展示，但不打徽章', () => {
    const groups: SynonymGroup[] = [
      {
        synset: 'oewn-test-v',
        gloss: 'be composed of',
        frame: 'of',
        candidates: [
          { lemma: 'dwell', pos: 'v.', status: 'DIRECT', inPack: false, cn: '居住' },
          { lemma: 'comprise', pos: 'v.', status: 'REWRITE', inPack: true, rewrite: 'consist of O → comprise O' },
        ],
      },
    ];
    render(<IeltsRewriteBlock lemma="constitute" senseCn="构成、组成" groups={groups} />);
    expect(screen.getByText('be composed of')).toBeTruthy();
    expect(screen.getByText('+ of')).toBeTruthy();
    expect(screen.getByText('dwell')).toBeTruthy();
    expect(screen.getByText('comprise')).toBeTruthy();
    // 只有「需改写」打徽章，DIRECT 不打
    expect(screen.getAllByText('需改写')).toHaveLength(1);
  });

  it('没有 enDef 时只回退第一组，不把多义全部平铺', () => {
    const group = (n: number): SynonymGroup => ({
      synset: `s${n}`,
      gloss: `gloss-${n}`,
      candidates: [
        { lemma: `a${n}`, pos: 'v.', status: 'DIRECT', inPack: false },
        { lemma: `b${n}`, pos: 'v.', status: 'DIRECT', inPack: false },
        { lemma: `c${n}`, pos: 'v.', status: 'DIRECT', inPack: false },
      ],
    });
    render(<IeltsRewriteBlock lemma="zzz" senseCn="测试" groups={[group(1), group(2), group(3)]} />);
    expect(screen.getByText('gloss-1')).toBeTruthy();
    expect(screen.queryByText('gloss-2')).toBeNull();
    expect(screen.getByText('a1')).toBeTruthy();
    expect(screen.getByText('b1')).toBeTruthy();
    expect(screen.queryByText('c1')).toBeNull();
  });

  it('enDef 命中哪一组就只显示哪一组（解决跨义项候选）', () => {
    const groups: SynonymGroup[] = [
      {
        synset: 's1',
        gloss: 'decide by reasoning',
        candidates: [{ lemma: 'reason', pos: 'v.', status: 'DIRECT', inPack: false }],
      },
      {
        synset: 's2',
        gloss: 'come to a close',
        candidates: [{ lemma: 'close', pos: 'v.', status: 'CONFLICT', inPack: false, note: '它带 with，不带 to' }],
      },
    ];
    render(<IeltsRewriteBlock lemma="conclude" senseCn="结束、作结论、推断" enDef="bring to a close" groups={groups} />);
    expect(screen.getByText('come to a close')).toBeTruthy();
    expect(screen.queryByText('reason')).toBeNull();
    expect(screen.getByText('搭配不同')).toBeTruthy();
    expect(screen.getByText('它带 with，不带 to')).toBeTruthy();
  });

  it('没有任何数据就整块不渲染', () => {
    const { container } = render(<IeltsRewriteBlock lemma="consist" senseCn="由…组成" />);
    // consist 有人工数据，换一个没有的
    expect(container.firstChild).not.toBeNull();
    cleanup();
    const empty = render(<IeltsRewriteBlock lemma="zebra" senseCn="斑马" />);
    expect(empty.container.firstChild).toBeNull();
  });
});

describe('改写数据自身', () => {
  it('每条都带中文，短语允许', () => {
    for (const lemma of ['significant', 'decline', 'consist', 'many']) {
      const items = rewritesFor(lemma, '下降、减少；显著的、重要的；由…组成；许多');
      expect(items.length, lemma).toBeGreaterThan(0);
      for (const item of items) {
        expect(item.phrase.trim().length, `${lemma} phrase`).toBeGreaterThan(0);
        expect(item.cn.trim().length, `${lemma} ${item.phrase}`).toBeGreaterThan(0);
      }
    }
  });
});
