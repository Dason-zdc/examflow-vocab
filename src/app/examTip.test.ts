import { describe, expect, it } from 'vitest';
import type { Sense } from '../domain/types';
import type { PackWord } from '../content/packVerifier';
import { makeSense, makeWord } from '../test/factories';
import { buildExamTip } from './examTip';

function wordWith(senses: Sense[]): PackWord {
  return { ...makeWord('w_test', senses), forms: [], sentences: [] };
}

function stat(weight: number, eccentric = false) {
  return {
    IELTS: {
      senseWeight: weight,
      tier: 'CORE' as const,
      kind: 'ESTIMATED' as const,
      sources: ['ECDICT-frq'],
      isEccentric: eccentric,
    },
  };
}

describe('考点提炼', () => {
  it('熟词僻义给出常见义对照', () => {
    const common = makeSense('s_common', { cn: '地址', examStats: stat(20) });
    const eccentric = makeSense('s_ecc', { cn: '处理，解决', examStats: stat(80, true) });
    const tip = buildExamTip(wordWith([common, eccentric]), eccentric, 'IELTS');
    expect(tip?.title).toBe('熟词僻义');
    expect(tip?.body).toContain('地址');
    expect(tip?.body).toContain('80 vs 20');
  });

  it('核心义项标注权重与来源，并声明是估计值', () => {
    const sense = makeSense('s_core', { cn: '组成部分', examStats: stat(76) });
    const tip = buildExamTip(wordWith([sense]), sense, 'IELTS');
    expect(tip?.title).toBe('核心考点');
    expect(tip?.body).toContain('76');
    expect(tip?.body).toContain('估计值');
    expect(tip?.body).not.toContain('考频');
  });

  it('缺少该考试统计时返回 null', () => {
    const sense = makeSense('s_x', { examStats: {} });
    expect(buildExamTip(wordWith([sense]), sense, 'IELTS')).toBeNull();
  });
});
