/**
 * 易混词高危清单（人工撰写）。
 *
 * 为什么不用数据包里 ETL 生成的 confusables 当主力：
 * 编辑距离只能告诉你「拼写差一个字母」，说不出 `affect / effect` 的 v./n. 差别。
 * 旧实现给 consist 推的是 consult / contest / convict——都不是考生真的会混的词。
 *
 * 口径：
 * - 每对只给一条区分线索（能背下来的一句）+ 一组对比例句；
 * - 只覆盖真正高错的词对，不对全库铺开；
 * - 卡片上最多显示 2 对，没有就不显示这一块。
 *
 * 内容为本项目自撰（AUTHORED），不复制词典或教辅正文。
 */

export interface ConfusableExample {
  en: string;
  zh: string;
}

export interface ConfusablePair {
  /** 词 A（线索里先讲的那个） */
  a: string;
  /** 词 B */
  b: string;
  /** 一条区分线索：能一句话说清的那种 */
  cue: string;
  /** 对比例句，各一句，合起来看差别 */
  examples: ConfusableExample[];
}

export const CONFUSABLE_PAIRS: readonly ConfusablePair[] = [
  {
    a: 'affect',
    b: 'effect',
    cue: 'affect 是 v.（Action，去影响）；effect 是 n.（End result，结果）',
    examples: [
      { en: 'The delay affected the whole schedule.', zh: '这次延误影响了整个进度。' },
      { en: 'The delay had a serious effect on the schedule.', zh: '这次延误对进度造成了严重影响。' },
    ],
  },
  {
    a: 'adapt',
    b: 'adopt',
    cue: 'adapt 是改自己（adapt to 适应）；adopt 是拿过来用（adopt a plan 采纳方案）',
    examples: [
      { en: 'Children adapt quickly to a new school.', zh: '孩子很快就能适应新学校。' },
      { en: 'The committee adopted the new plan.', zh: '委员会采纳了新方案。' },
    ],
  },
  {
    a: 'principal',
    b: 'principle',
    cue: 'principal 是校长 / 主要的（pal 像个人）；principle 是原理、原则（ple 像 rule）',
    examples: [
      { en: 'The principal reason is cost.', zh: '主要原因是成本。' },
      { en: 'It is a matter of principle.', zh: '这是原则问题。' },
    ],
  },
  {
    a: 'complement',
    b: 'compliment',
    cue: 'complement 是补足（complete 补全）；compliment 是恭维（i 像「我爱听」）',
    examples: [
      { en: 'The wine complements the meal.', zh: '这款酒为这顿饭增色。' },
      { en: 'She paid him a compliment on his speech.', zh: '她夸了他的演讲。' },
    ],
  },
  {
    a: 'economic',
    b: 'economical',
    cue: 'economic 与国家/经济有关；economical 是省钱（-al 落到个人钱包）',
    examples: [
      { en: 'The country faces an economic crisis.', zh: '这个国家面临经济危机。' },
      { en: 'A small car is more economical to run.', zh: '小车用起来更省钱。' },
    ],
  },
  {
    a: 'sensitive',
    b: 'sensible',
    cue: 'sensitive 是敏感（容易被影响）；sensible 是明智（有 sense）',
    examples: [
      { en: 'She is sensitive to criticism.', zh: '她对批评很敏感。' },
      { en: 'It was a sensible decision.', zh: '那是个明智的决定。' },
    ],
  },
  {
    a: 'advise',
    b: 'advice',
    cue: 'advise 是 v.（-se，像 use）；advice 是 n.（-ce，像 ice 是名词）',
    examples: [
      { en: 'I advise you to wait.', zh: '我建议你等一等。' },
      { en: 'He gave me some good advice.', zh: '他给了我一些好建议。' },
    ],
  },
  {
    a: 'rise',
    b: 'raise',
    cue: 'rise 自己升（不及物，rise-rose-risen）；raise 把东西举起来（及物，raise-raised）',
    examples: [
      { en: 'Prices rose sharply last year.', zh: '去年物价大幅上涨。' },
      { en: 'The government raised taxes.', zh: '政府提高了税收。' },
    ],
  },
  {
    a: 'lie',
    b: 'lay',
    cue: 'lie 自己躺（lie-lay-lain）；lay 把东西放（lay-laid-laid）',
    examples: [
      { en: 'He lay on the sofa all afternoon.', zh: '他整个下午都躺在沙发上。' },
      { en: 'She laid the book on the table.', zh: '她把书放在桌上。' },
    ],
  },
  {
    a: 'assure',
    b: 'ensure',
    cue: 'assure 让人安心（对人）；ensure 确保（对事）；insure 投保（对钱）',
    examples: [
      { en: 'I assure you that it is safe.', zh: '我向你保证它是安全的。' },
      { en: 'Please ensure that the door is locked.', zh: '请确保门已锁好。' },
    ],
  },
  {
    a: 'beside',
    b: 'besides',
    cue: 'beside 是在旁边（方位）；besides 是而且、除此之外（递进）',
    examples: [
      { en: 'She sat beside the window.', zh: '她坐在窗边。' },
      { en: 'Besides, the price is too high.', zh: '况且，价格也太高了。' },
    ],
  },
  {
    a: 'borrow',
    b: 'lend',
    cue: 'borrow 借入（你拿别人的）；lend 借出（你把东西给人）',
    examples: [
      { en: 'Can I borrow your pen?', zh: '我能借你的笔吗？' },
      { en: 'Could you lend me your pen?', zh: '你能把笔借给我吗？' },
    ],
  },
  {
    a: 'spend',
    b: 'cost',
    cue: 'spend 是人花钱/时间（人作主语）；cost 是物花钱（物作主语）',
    examples: [
      { en: 'I spent two hours on the report.', zh: '我在这份报告上花了两个小时。' },
      { en: 'The report cost me two hours.', zh: '这份报告花了我两个小时。' },
    ],
  },
  {
    a: 'hear',
    b: 'listen',
    cue: 'hear 是听见（无意识，不接 to）；listen 是有意识听（接 to）',
    examples: [
      { en: 'I heard a strange noise outside.', zh: '我听见外面有奇怪的声音。' },
      { en: 'Listen to the recording twice.', zh: '把录音听两遍。' },
    ],
  },
  {
    a: 'historic',
    b: 'historical',
    cue: 'historic 是有历史意义的（值得纪念）；historical 是与历史有关的（史料）',
    examples: [
      { en: 'It was a historic moment for the country.', zh: '那是这个国家的历史性时刻。' },
      { en: 'She studies historical documents.', zh: '她研究历史文献。' },
    ],
  },
  {
    a: 'continual',
    b: 'continuous',
    cue: 'continual 反复发生（中间有断）；continuous 连续不断（中间不断）',
    examples: [
      { en: 'He is tired of her continual complaints.', zh: '她没完没了的抱怨让他很累。' },
      { en: 'The machine made a continuous noise.', zh: '机器发出持续不断的噪音。' },
    ],
  },
  {
    a: 'intelligent',
    b: 'intelligible',
    cue: 'intelligent 是聪明；intelligible 是可理解的（能被听懂）',
    examples: [
      { en: 'She is an intelligent student.', zh: '她是个聪明的学生。' },
      { en: 'His explanation was barely intelligible.', zh: '他的解释几乎听不懂。' },
    ],
  },
  {
    a: 'industrial',
    b: 'industrious',
    cue: 'industrial 是工业的（industry 产业）；industrious 是勤奋的（人）',
    examples: [
      { en: 'The city is an industrial centre.', zh: '这座城市是工业中心。' },
      { en: 'He is an industrious worker.', zh: '他是个勤劳的工人。' },
    ],
  },
  {
    a: 'imaginary',
    b: 'imaginative',
    cue: 'imaginary 是虚构的（不存在）；imaginative 是有想象力的（人/作品）',
    examples: [
      { en: 'The dragon is an imaginary creature.', zh: '龙是想象出来的生物。' },
      { en: 'She wrote an imaginative story.', zh: '她写了一个富有想象力的故事。' },
    ],
  },
  {
    a: 'respectful',
    b: 'respectable',
    cue: 'respectful 是尊敬他人（对别人有礼）；respectable 是值得尊敬的（受人尊重）',
    examples: [
      { en: 'Students should be respectful to teachers.', zh: '学生应当尊敬老师。' },
      { en: 'He comes from a respectable family.', zh: '他出身于体面人家。' },
    ],
  },
  {
    a: 'conserve',
    b: 'preserve',
    cue: 'conserve 是节约（少用）；preserve 是保存原样（不让坏）',
    examples: [
      { en: 'We should conserve water in summer.', zh: '夏天我们应该节约用水。' },
      { en: 'Salt was used to preserve meat.', zh: '盐曾被用来保存肉类。' },
    ],
  },
  {
    a: 'contribute',
    b: 'attribute',
    cue: 'contribute 是贡献（contribute to 促成）；attribute 是归因（attribute A to B）',
    examples: [
      { en: 'Exercise contributes to good health.', zh: '运动有助于健康。' },
      { en: 'She attributes her success to luck.', zh: '她把成功归因于运气。' },
    ],
  },
  {
    a: 'childlike',
    b: 'childish',
    cue: 'childlike 是天真（褒义）；childish 是幼稚（贬义）',
    examples: [
      { en: 'He has a childlike sense of wonder.', zh: '他有孩子般的好奇心。' },
      { en: 'Stop being so childish.', zh: '别这么幼稚了。' },
    ],
  },
  {
    a: 'effective',
    b: 'efficient',
    cue: 'effective 是有效果（能成事）；efficient 是效率高（少耗时）',
    examples: [
      { en: 'The medicine is highly effective.', zh: '这种药很有效。' },
      { en: 'The new system is more efficient.', zh: '新系统效率更高。' },
    ],
  },
];

const BY_WORD = (() => {
  const map = new Map<string, ConfusablePair[]>();
  for (const pair of CONFUSABLE_PAIRS) {
    for (const word of [pair.a, pair.b]) {
      const list = map.get(word) ?? [];
      list.push(pair);
      map.set(word, list);
    }
  }
  return map;
})();

export interface ResolvedConfusable {
  /** 当前词（展示时永远在前） */
  self: string;
  /** 对照词 */
  other: string;
  cue: string;
  examples: ConfusableExample[];
}

/**
 * 取当前词的易混对。
 * `lapses > 0` 表示这个词答错过，允许一次看 2 对；否则只看 1 对，避免背面变词表。
 */
export function confusablePairsFor(lemma: string, options: { lapses?: number } = {}): ResolvedConfusable[] {
  const word = lemma.trim().toLowerCase();
  const pairs = BY_WORD.get(word);
  if (!pairs || pairs.length === 0) return [];
  const limit = (options.lapses ?? 0) > 0 ? 2 : 1;
  return pairs.slice(0, limit).map((pair) => {
    const selfIsA = pair.a === word;
    const other = selfIsA ? pair.b : pair.a;
    // 线索是按 a/b 写的，当前词在 B 侧时把线索里的顺序调过来再展示
    const cue = selfIsA ? pair.cue : swapCue(pair.cue, pair.a, pair.b);
    const examples = selfIsA ? pair.examples : [...pair.examples].reverse();
    return { self: word, other, cue, examples };
  });
}

/** 线索形如「A 是…；B 是…」，当前词是 B 时把两半对调，保证先讲当前词 */
function swapCue(cue: string, a: string, b: string): string {
  const halves = cue.split(/[；;]/);
  if (halves.length !== 2) return cue;
  const [first, second] = halves;
  if (!first?.includes(a) || !second?.includes(b)) return cue;
  return `${second.trim()}；${first.trim()}`;
}
