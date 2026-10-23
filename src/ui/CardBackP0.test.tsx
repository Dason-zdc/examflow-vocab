// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CardBackDictionary } from './CardBackDictionary';
import { CardBackSentences } from './CardBackSentences';
import { CardBackFamilies } from './CardBackFamilies';
import type { PackWord } from '../content/packVerifier';
import type { Sense } from '../domain/types';

function examSense(id: string, cn: string, enDef = ''): Sense {
  return {
    id,
    pos: 'v.',
    cn,
    enDef,
    examStats: {
      IELTS: { senseWeight: 75, tier: 'CORE', kind: 'ESTIMATED', sources: ['ECDICT-frq'], isEccentric: false },
    },
  };
}

function fixture(only: Sense): PackWord {
  const wordId = 'w_cite';
  const senses = [only];
  return {
    id: wordId,
    lemma: 'cite',
    phoneticUk: '/sait/',
    phoneticUs: '',
    isBasic: false,
    forms: ['cited', 'cites', 'citing'],
    senses,
    sentences: [
      { id: 'x1', wordId, senseId: only.id, en: 'He cited a case.', zh: '他引用了一个案例。', surfaceForm: 'cited', provenance: { type: 'ADAPTED', origin: 'TATOEBA', sourceId: '123', note: '' } },
      { id: 'x2', wordId, senseId: only.id, en: 'She cited three authors.', zh: '她引用了三位作者。', surfaceForm: 'cited', provenance: { type: 'ADAPTED', origin: 'TATOEBA', sourceId: '456', note: '' } },
      { id: 'x3', wordId, senseId: only.id, en: 'The lawyer cited a precedent.', zh: '', surfaceForm: 'cited', provenance: { type: 'ADAPTED', origin: 'TATOEBA', sourceId: '789', note: '' } },
    ],
    confusables: [],
  };
}

describe('P0-3 义项区合并展示', () => {
  it('空英文释义不渲染占位文案', () => {
    const s1 = examSense('s1', '引用、引证；举例');
    render(<CardBackDictionary word={fixture(s1)} sense={s1} exam="IELTS" />);
    expect(screen.queryByText(/暂无英文释义/)).toBeNull();
    expect(screen.getByText('引用、引证；举例')).toBeTruthy();
    // 默认折叠：权重进度条区域不展开，提供「详情」入口
    expect(screen.getByRole('button', { name: '详情' })).toBeTruthy();
  });
});

describe('P0-4 例句区降噪', () => {
  it('无词群时不渲染该模块', () => {
    const { container } = render(<CardBackFamilies onOpenWord={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('渲染同源词群成员与派生词，并支持一键加入生词本', () => {
    const added: string[] = [];
    render(
      <CardBackFamilies
        family={{
          root: 'cit',
          rootMeaning: '唤起、刺激',
          origin: 'Latin',
          formula: 'ex( 向外 )+cit( 唤起、刺激 )',
          members: [{ lemma: 'excite', pos: 'v.', cn: '刺激、使兴奋', formula: 'ex( 向外 )+cit( 唤起、刺激 )', source: 'ECDICT' }],
          source: 'ECDICT-wordroot/manual',
        }}
        derivatives={[
          { lemma: 'cited', pos: 'v.', cn: '引用', kind: 'INFLECTION' },
          { lemma: 'citation', pos: 'n.', cn: '引用、引证', kind: 'DERIVATION' },
        ]}
        onOpenWord={() => {}}
        onAddWord={(lemma) => added.push(lemma)}
      />,
    );
    expect(screen.getByText('cit')).toBeTruthy();
    expect(screen.getByText('刺激、使兴奋')).toBeTruthy();
    // 派生词只展示 DERIVATION（citation），不展示屈折变化（cited）
    expect(screen.getByText('citation')).toBeTruthy();
    expect(screen.queryByText('cited')).toBeNull();
    const addBtn = screen.getByRole('button', { name: '加入生词本' });
    fireEvent.click(addBtn);
    expect(added).toEqual(['excite']);
  });

  it('第二条起默认折叠，点击展开其余例句', () => {
    render(<CardBackSentences word={fixture(examSense('s1', '引用'))} currentSenseId="s1" accent="uk" onWord={() => {}} />);
    // 仅首句可见，出现折叠入口（例句被拆成逐词按钮，按 token 断言）
    const expand = screen.getByRole('button', { name: /展开其余 2 条例句/ });
    expect(expand).toBeTruthy();
    expect(screen.queryByText('authors')).toBeNull();
    fireEvent.click(expand);
    expect(screen.getByText('authors')).toBeTruthy();
    expect(screen.getByText('precedent')).toBeTruthy();
  });
});
