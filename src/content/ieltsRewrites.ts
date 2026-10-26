/**
 * 雅思写作改写（人工撰写，按义项）。
 *
 * 与同义替换（US-08）的分工：
 * - synonymGroups 回答「这个词能不能在同一句里换掉」，靠 WordNet 义项 + 语料搭配判定；
 * - 这里回答「写作时怎么换个说法更地道」，可以给短语、可以要求改结构。
 *
 * 因此这一块只保留一种徽章：「需改写」——表示原句不能直接替换，得动介词或句法。
 * 不搬五态徽章：DIRECT / INFERRED 这类判断对写作用处不大，反而增加阅读负担。
 *
 * 内容为本项目自撰（AUTHORED），例句与搭配均为常见书面用法，不复制词典正文。
 */

export interface IeltsRewriteItem {
  /** 改写说法，允许短语（lead to / a multitude of） */
  phrase: string;
  /** 中文，必须给：用户看的是「换个说法后中文还是不是这个意思」 */
  cn: string;
  /** 原句不能直接换，需要调整结构 */
  needRewrite?: boolean;
  /** 一句提示：搭配或语域上的注意点 */
  note?: string;
}

export interface IeltsRewriteEntry {
  lemma: string;
  /** 义项中文片段；缺省表示该词不分义项、整词通用 */
  sense?: string;
  items: IeltsRewriteItem[];
}

export const IELTS_REWRITES: readonly IeltsRewriteEntry[] = [
  {
    lemma: 'significant',
    sense: '显著',
    items: [
      { phrase: 'considerable', cn: '相当大的' },
      { phrase: 'substantial', cn: '可观的' },
      { phrase: 'marked', cn: '明显的' },
    ],
  },
  {
    lemma: 'decline',
    sense: '下降',
    items: [
      { phrase: 'decrease', cn: '减少' },
      { phrase: 'drop', cn: '下降' },
      { phrase: 'fall', cn: '下跌' },
    ],
  },
  {
    lemma: 'increase',
    items: [
      { phrase: 'rise', cn: '上升' },
      { phrase: 'grow', cn: '增长' },
      { phrase: 'climb', cn: '攀升' },
    ],
  },
  {
    lemma: 'important',
    items: [
      { phrase: 'crucial', cn: '关键的' },
      { phrase: 'vital', cn: '至关重要的' },
      { phrase: 'paramount', cn: '首要的' },
    ],
  },
  {
    lemma: 'show',
    sense: '显示',
    items: [
      { phrase: 'demonstrate', cn: '表明' },
      { phrase: 'indicate', cn: '显示' },
      { phrase: 'reveal', cn: '揭示' },
    ],
  },
  {
    lemma: 'cause',
    sense: '导致',
    items: [
      { phrase: 'lead to', cn: '导致' },
      { phrase: 'give rise to', cn: '引起' },
      { phrase: 'result in', cn: '造成' },
    ],
  },
  {
    lemma: 'reduce',
    items: [
      { phrase: 'cut', cn: '削减' },
      { phrase: 'lower', cn: '降低' },
      { phrase: 'diminish', cn: '减弱' },
    ],
  },
  {
    lemma: 'problem',
    items: [
      { phrase: 'issue', cn: '议题、问题' },
      { phrase: 'challenge', cn: '挑战' },
      { phrase: 'obstacle', cn: '障碍' },
    ],
  },
  {
    lemma: 'advantage',
    items: [
      { phrase: 'benefit', cn: '好处' },
      { phrase: 'merit', cn: '优点' },
      { phrase: 'strength', cn: '长处' },
    ],
  },
  {
    lemma: 'disadvantage',
    items: [
      { phrase: 'drawback', cn: '缺点' },
      { phrase: 'downside', cn: '弊端' },
      { phrase: 'limitation', cn: '局限' },
    ],
  },
  {
    lemma: 'think',
    sense: '认为',
    items: [
      { phrase: 'argue', cn: '主张' },
      { phrase: 'maintain', cn: '坚持认为' },
      { phrase: 'contend', cn: '声称' },
    ],
  },
  {
    lemma: 'many',
    items: [
      { phrase: 'numerous', cn: '众多的' },
      { phrase: 'a multitude of', cn: '大量的' },
      { phrase: 'a considerable number of', cn: '相当多的' },
    ],
  },
  {
    lemma: 'very',
    items: [
      { phrase: 'highly', cn: '高度地' },
      { phrase: 'extremely', cn: '极其' },
      { phrase: 'particularly', cn: '尤其' },
    ],
  },
  {
    lemma: 'big',
    items: [
      { phrase: 'substantial', cn: '可观的' },
      { phrase: 'considerable', cn: '相当大的' },
      { phrase: 'sizeable', cn: '相当大的' },
    ],
  },
  {
    lemma: 'good',
    items: [
      { phrase: 'beneficial', cn: '有益的' },
      { phrase: 'favourable', cn: '有利的' },
      { phrase: 'positive', cn: '积极的' },
    ],
  },
  {
    lemma: 'bad',
    items: [
      { phrase: 'adverse', cn: '不利的' },
      { phrase: 'detrimental', cn: '有害的' },
      { phrase: 'negative', cn: '负面的' },
    ],
  },
  {
    lemma: 'help',
    items: [
      { phrase: 'facilitate', cn: '促进、便利' },
      { phrase: 'assist', cn: '协助' },
      { phrase: 'contribute to', cn: '有助于', needRewrite: true, note: '后接名词或动名词，不接 to do' },
    ],
  },
  {
    lemma: 'get',
    sense: '得到',
    items: [
      { phrase: 'obtain', cn: '获得' },
      { phrase: 'acquire', cn: '取得' },
      { phrase: 'secure', cn: '争取到' },
    ],
  },
  {
    lemma: 'use',
    items: [
      { phrase: 'utilize', cn: '利用' },
      { phrase: 'employ', cn: '采用' },
      { phrase: 'adopt', cn: '采纳' },
    ],
  },
  {
    lemma: 'because',
    items: [
      { phrase: 'owing to', cn: '由于', needRewrite: true, note: '后接名词短语' },
      { phrase: 'due to', cn: '由于', needRewrite: true, note: '后接名词短语' },
      { phrase: 'as a result of', cn: '由于', needRewrite: true, note: '后接名词短语' },
    ],
  },
  {
    lemma: 'but',
    items: [
      { phrase: 'however', cn: '然而', needRewrite: true, note: '另起一句，用逗号隔开' },
      { phrase: 'nevertheless', cn: '尽管如此', needRewrite: true, note: '另起一句' },
      { phrase: 'whereas', cn: '而', needRewrite: true, note: '连接两个完整从句' },
    ],
  },
  {
    lemma: 'so',
    sense: '因此',
    items: [
      { phrase: 'therefore', cn: '因此' },
      { phrase: 'consequently', cn: '因而' },
      { phrase: 'thus', cn: '从而' },
    ],
  },
  {
    lemma: 'opinion',
    sense: '意见',
    items: [
      { phrase: 'from my perspective', cn: '在我看来', needRewrite: true, note: '整句改写：In my opinion, … → From my perspective, …' },
      { phrase: 'I would argue that', cn: '我认为' },
      { phrase: 'it seems to me that', cn: '在我看来' },
    ],
  },
  {
    lemma: 'nowadays',
    items: [
      { phrase: 'currently', cn: '目前' },
      { phrase: 'in recent years', cn: '近年来' },
      { phrase: 'at present', cn: '目前' },
    ],
  },
  {
    lemma: 'consist',
    sense: '组成',
    items: [
      { phrase: 'comprise', cn: '由…组成', needRewrite: true, note: 'consist of A → comprise A（去掉 of）' },
      { phrase: 'be composed of', cn: '由…组成', needRewrite: true, note: '主动改被动：consist of A → be composed of A' },
      { phrase: 'be made up of', cn: '由…组成', needRewrite: true, note: '主动改被动：consist of A → be made up of A' },
    ],
  },
  {
    lemma: 'make',
    sense: '使得',
    items: [
      { phrase: 'render', cn: '使成为' },
      { phrase: 'cause', cn: '导致' },
      { phrase: 'lead to', cn: '导致' },
    ],
  },
  {
    lemma: 'study',
    sense: '研究',
    items: [
      { phrase: 'research', cn: '研究' },
      { phrase: 'investigate', cn: '调查' },
      { phrase: 'examine', cn: '考察' },
    ],
  },
  {
    lemma: 'grow',
    sense: '增长',
    items: [
      { phrase: 'expand', cn: '扩大' },
      { phrase: 'increase', cn: '增加' },
      { phrase: 'surge', cn: '激增' },
    ],
  },
  {
    lemma: 'need',
    items: [
      { phrase: 'require', cn: '需要' },
      { phrase: 'call for', cn: '要求', needRewrite: true, note: '后接名词' },
      { phrase: 'demand', cn: '需要' },
    ],
  },
  {
    lemma: 'do',
    sense: '做',
    items: [
      { phrase: 'conduct', cn: '开展', note: '多接 research / survey' },
      { phrase: 'perform', cn: '执行' },
      { phrase: 'carry out', cn: '实施', needRewrite: true, note: '动词短语，宾语放后面' },
    ],
  },
];

const BY_WORD = new Map(IELTS_REWRITES.map((entry) => [entry.lemma, entry]));

/**
 * 取该义项可用的改写。
 * 义项片段对不上就不给——`decline` 的「下降」改写不能贴到「婉拒」义项上。
 */
export function rewritesFor(lemma: string, senseCn: string): IeltsRewriteItem[] {
  const entry = BY_WORD.get(lemma.trim().toLowerCase());
  if (!entry) return [];
  if (entry.sense && !senseCn.includes(entry.sense)) return [];
  return entry.items;
}
