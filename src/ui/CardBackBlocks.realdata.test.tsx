// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { ConfusableBlock, IeltsRewriteBlock } from './CardBackBlocks';
import type { PackWord } from '../content/packVerifier';

afterEach(cleanup);

/** 用真实数据包抽查：拆分后两块在「非人工清单词」上是否还在 */
function word(lemma: string): PackWord {
  const dir = join(process.cwd(), 'public/packs/IELTS');
  for (const file of readdirSync(dir).filter((f) => f.startsWith('chunk-'))) {
    const data = JSON.parse(readFileSync(join(dir, file), 'utf-8')) as { words: PackWord[] };
    const hit = data.words.find((w) => w.lemma === lemma);
    if (hit) return hit;
  }
  throw new Error(`missing ${lemma}`);
}

describe('真实数据抽查：拆块后不空', () => {
  it('consist 无人工高危对 → 词形相近回退', () => {
    const w = word('consist');
    render(<ConfusableBlock lemma={w.lemma} confusables={w.confusables} open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(screen.getByText('词形相近')).toBeTruthy();
    expect(screen.getByText(w.confusables[0]!.lemma)).toBeTruthy();
  });

  it('consist 无人工改写种子 → WordNet 同义照常展示', () => {
    const w = word('consist');
    const sense = w.senses.find((s) => (s.synonymGroups ?? []).length > 0)!;
    render(<IeltsRewriteBlock lemma={w.lemma} senseCn={sense.cn} groups={sense.synonymGroups} onOpenWord={() => {}} />);
    expect(screen.getByText('同义替换')).toBeTruthy();
    const gloss = sense.synonymGroups![0]!.gloss;
    expect(screen.getByText(gloss)).toBeTruthy();
  });

  it('人工清单词仍走高价值形态：affect 给线索与对比例句', () => {
    const w = word('affect');
    render(<ConfusableBlock lemma={w.lemma} confusables={w.confusables} open onToggle={() => {}} onOpenWord={() => {}} />);
    expect(screen.getByText('易混词')).toBeTruthy();
    expect(screen.getByText(/v\.（Action/)).toBeTruthy();
    expect(screen.queryByText('词形相近')).toBeNull();
  });
});

describe('义项对齐：enDef 挑组', () => {
  it('conclude 只显示与 enDef（bring to a close）对应的组，不出现 reason / resolve', () => {
    const w = word('conclude');
    const sense = w.senses.find((s) => (s.synonymGroups ?? []).length > 1)!;
    render(
      <IeltsRewriteBlock
        lemma={w.lemma}
        senseCn={sense.cn}
        {...(sense.enDef ? { enDef: sense.enDef } : {})}
        groups={sense.synonymGroups}
        onOpenWord={() => {}}
      />,
    );
    expect(screen.getByText('come to a close')).toBeTruthy();
    expect(screen.getByText('close')).toBeTruthy();
    // 跨义项的候选不能再出现
    expect(screen.queryByText('reason')).toBeNull();
    expect(screen.queryByText('resolve')).toBeNull();
    // 搭配不符必须带理由，否则会被当成可直接替换
    expect(screen.getByText('搭配不同')).toBeTruthy();
    expect(screen.getByText(/带 with/)).toBeTruthy();
  });

  it('present 选中与 enDef 对应的「提出」组', () => {
    const w = word('present');
    const sense = w.senses.find((s) => (s.synonymGroups ?? []).length > 1)!;
    render(
      <IeltsRewriteBlock
        lemma={w.lemma}
        senseCn={sense.cn}
        {...(sense.enDef ? { enDef: sense.enDef } : {})}
        groups={sense.synonymGroups}
        onOpenWord={() => {}}
      />,
    );
    expect(screen.getByText('bring forward and present to the mind')).toBeTruthy();
    expect(screen.queryByText('give an exhibition of to an interested audience')).toBeNull();
  });
});
