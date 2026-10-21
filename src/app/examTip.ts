import type { ExamCode, Sense } from '../domain/types';
import type { PackWord } from '../content/packVerifier';

/**
 * 考点提炼：由已有数据推导，不编造外部事实。
 * - 权重 / 层级 / 来源来自数据包（估计值）
 * - 熟词僻义提示来自「本义项 vs 同词最高权重义项」的对比
 */

const TIER_LABEL: Record<'CORE' | 'ADVANCED' | 'EXTENDED', string> = {
  CORE: '核心',
  ADVANCED: '进阶',
  EXTENDED: '拓展',
};

export interface ExamTip {
  title: string;
  body: string;
}

export function buildExamTip(word: PackWord, sense: Sense, exam: ExamCode): ExamTip | null {
  const stat = sense.examStats[exam];
  if (!stat) return null;

  const others = word.senses
    .filter((s) => s.id !== sense.id)
    .map((s) => ({ sense: s, weight: s.examStats[exam]?.senseWeight ?? 0 }))
    .sort((a, b) => b.weight - a.weight);
  const top = others[0];

  const source = stat.sources.length > 0 ? stat.sources.join('、') : '公开词频信号';
  const suffix = `\n权重来源：${source}（估计值，不是考试实测计数）。`;

  if (stat.isEccentric && top && top.weight > 0) {
    return {
      title: '熟词僻义',
      body:
        `常见义是「${top.sense.cn}」，而本义项「${sense.cn}」的估计权重更高（${stat.senseWeight} vs ${top.weight}）。` +
        `阅读里遇到它时，优先按「${sense.cn}」理解。` +
        suffix,
    };
  }

  if (stat.tier === 'CORE') {
    return {
      title: '核心考点',
      body:
        `估计权重 ${stat.senseWeight}（${TIER_LABEL[stat.tier]}层级，本词最高频义项之一）。` +
        `先记住 ${sense.pos}「${sense.cn}」，再通过例句固定搭配与词性。` +
        suffix,
    };
  }

  return {
    title: `${TIER_LABEL[stat.tier]}考点`,
    body:
      `估计权重 ${stat.senseWeight}（${TIER_LABEL[stat.tier]}层级）。` +
      `在核心义项掌握之后再巩固本义项，避免平均用力。` +
      suffix,
  };
}
