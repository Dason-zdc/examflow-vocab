/**
 * 词缀自动拆分（兜底）：数据包只有约三分之一的词带人工词根，
 * 其余词按常见前缀 / 后缀 / 词根做保守拆分，并在 UI 上明确标注「自动拆分」。
 *
 * 只做 2 个以上成分且能落到已知词根/前后缀的组合，避免给任意单词硬凑词源。
 */

interface Affix {
  text: string;
  meaning: string;
}

const PREFIXES: Affix[] = [
  { text: 'counter', meaning: '反对、相反' },
  { text: 'inter', meaning: '在…之间' },
  { text: 'trans', meaning: '跨越、转变' },
  { text: 'circum', meaning: '环绕' },
  { text: 'contra', meaning: '相反' },
  { text: 'super', meaning: '在上、超过' },
  { text: 'under', meaning: '在下、不足' },
  { text: 'micro', meaning: '微小' },
  { text: 'macro', meaning: '宏大' },
  { text: 'multi', meaning: '多' },
  { text: 'semi', meaning: '半' },
  { text: 'anti', meaning: '反对' },
  { text: 'fore', meaning: '在前' },
  { text: 'over', meaning: '过度' },
  { text: 'post', meaning: '在后' },
  { text: 'pre', meaning: '在前' },
  { text: 'pro', meaning: '向前' },
  { text: 'sub', meaning: '在下' },
  { text: 'sup', meaning: '在下' },
  { text: 'sur', meaning: '在上、超过' },
  { text: 'ultra', meaning: '超出' },
  { text: 'auto', meaning: '自己' },
  { text: 'extra', meaning: '额外' },
  { text: 'hyper', meaning: '过度' },
  { text: 'hypo', meaning: '不足、下' },
  { text: 'intra', meaning: '内部' },
  { text: 'mono', meaning: '单一' },
  { text: 'poly', meaning: '多' },
  { text: 'tele', meaning: '远' },
  { text: 'bio', meaning: '生命' },
  { text: 'geo', meaning: '地' },
  { text: 'co', meaning: '共同' },
  { text: 'col', meaning: '共同' },
  { text: 'com', meaning: '共同' },
  { text: 'con', meaning: '共同、加强' },
  { text: 'cor', meaning: '共同' },
  { text: 'de', meaning: '向下、去除' },
  { text: 'dis', meaning: '分开、否定' },
  { text: 'di', meaning: '分开' },
  { text: 'ex', meaning: '向外' },
  { text: 'e', meaning: '向外' },
  { text: 'im', meaning: '进入、否定' },
  { text: 'in', meaning: '进入、否定' },
  { text: 'il', meaning: '否定' },
  { text: 'ir', meaning: '否定' },
  { text: 'mis', meaning: '错误' },
  { text: 'non', meaning: '非' },
  { text: 'ob', meaning: '反对、朝向' },
  { text: 'per', meaning: '贯穿' },
  { text: 're', meaning: '回、再' },
  { text: 'un', meaning: '否定' },
  { text: 'up', meaning: '向上' },
  { text: 'out', meaning: '超出、向外' },
  { text: 'en', meaning: '使…' },
  { text: 'em', meaning: '使…' },
  { text: 'ad', meaning: '朝向' },
  { text: 'ac', meaning: '朝向' },
  { text: 'af', meaning: '朝向' },
  { text: 'ag', meaning: '朝向' },
  { text: 'al', meaning: '朝向' },
  { text: 'ap', meaning: '朝向' },
  { text: 'ar', meaning: '朝向' },
  { text: 'as', meaning: '朝向' },
  { text: 'at', meaning: '朝向' },
];

const SUFFIXES: Affix[] = [
  { text: 'ability', meaning: '能力、性质' },
  { text: 'ation', meaning: '名词后缀：行为/结果' },
  { text: 'ition', meaning: '名词后缀：行为/结果' },
  { text: 'ology', meaning: '学科' },
  { text: 'ment', meaning: '名词后缀：行为/结果' },
  { text: 'ness', meaning: '名词后缀：性质' },
  { text: 'ance', meaning: '名词后缀：状态' },
  { text: 'ence', meaning: '名词后缀：状态' },
  { text: 'ship', meaning: '名词后缀：关系/身份' },
  { text: 'tion', meaning: '名词后缀：行为/结果' },
  { text: 'sion', meaning: '名词后缀：行为/结果' },
  { text: 'able', meaning: '可…的' },
  { text: 'ible', meaning: '可…的' },
  { text: 'ful', meaning: '充满…的' },
  { text: 'less', meaning: '无…的' },
  { text: 'ous', meaning: '多…的' },
  { text: 'ive', meaning: '…的' },
  { text: 'ity', meaning: '名词后缀：性质' },
  { text: 'ure', meaning: '名词后缀：行为/结果' },
  { text: 'ant', meaning: '…的/…者' },
  { text: 'ent', meaning: '…的/…者' },
  { text: 'ary', meaning: '…的/场所' },
  { text: 'ory', meaning: '…的/场所' },
  { text: 'ism', meaning: '主义、现象' },
  { text: 'ist', meaning: '…者' },
  { text: 'ize', meaning: '使…化' },
  { text: 'ise', meaning: '使…化' },
  { text: 'ify', meaning: '使…' },
  { text: 'fy', meaning: '使…' },
  { text: 'ate', meaning: '动词/形容词后缀' },
  { text: 'al', meaning: '…的' },
  { text: 'ic', meaning: '…的' },
  { text: 'ical', meaning: '…的' },
  { text: 'ly', meaning: '副词/形容词后缀' },
  { text: 'er', meaning: '人/物' },
  { text: 'or', meaning: '人/物' },
  { text: 'ing', meaning: '动名词/进行' },
  { text: 'ed', meaning: '过去/被动' },
];

const ROOTS: Affix[] = [
  { text: 'spect', meaning: '看' },
  { text: 'spic', meaning: '看' },
  { text: 'vis', meaning: '看' },
  { text: 'vid', meaning: '看' },
  { text: 'port', meaning: '携带' },
  { text: 'dict', meaning: '说' },
  { text: 'duc', meaning: '引导' },
  { text: 'duct', meaning: '引导' },
  { text: 'ject', meaning: '投掷' },
  { text: 'scrib', meaning: '写' },
  { text: 'script', meaning: '写' },
  { text: 'cred', meaning: '相信' },
  { text: 'fer', meaning: '带来、承受' },
  { text: 'mit', meaning: '送' },
  { text: 'miss', meaning: '送' },
  { text: 'pos', meaning: '放置' },
  { text: 'pon', meaning: '放置' },
  { text: 'tract', meaning: '拉' },
  { text: 'vert', meaning: '转' },
  { text: 'vers', meaning: '转' },
  { text: 'voc', meaning: '声音、召唤' },
  { text: 'vok', meaning: '声音、召唤' },
  { text: 'chron', meaning: '时间' },
  { text: 'graph', meaning: '写、记录' },
  { text: 'log', meaning: '言说、学科' },
  { text: 'man', meaning: '手' },
  { text: 'ped', meaning: '脚' },
  { text: 'pod', meaning: '脚' },
  { text: 'phon', meaning: '声音' },
  { text: 'photo', meaning: '光' },
  { text: 'sens', meaning: '感觉' },
  { text: 'sent', meaning: '感觉' },
  { text: 'struct', meaning: '建造' },
  { text: 'therm', meaning: '热' },
  { text: 'aqua', meaning: '水' },
  { text: 'aud', meaning: '听' },
  { text: 'bene', meaning: '好' },
  { text: 'mal', meaning: '坏' },
  { text: 'mort', meaning: '死' },
  { text: 'nat', meaning: '出生' },
  { text: 'path', meaning: '感情、疾病' },
  { text: 'phil', meaning: '爱' },
  { text: 'phob', meaning: '恐惧' },
  { text: 'poli', meaning: '城市' },
  { text: 'rupt', meaning: '破裂' },
  { text: 'sect', meaning: '切' },
  { text: 'serv', meaning: '服务、保存' },
  { text: 'sol', meaning: '太阳' },
  { text: 'son', meaning: '声音' },
  { text: 'spir', meaning: '呼吸' },
  { text: 'temp', meaning: '时间' },
  { text: 'ten', meaning: '握住' },
  { text: 'tain', meaning: '握住' },
  { text: 'terr', meaning: '土地' },
  { text: 'val', meaning: '价值' },
  { text: 'ven', meaning: '来' },
  { text: 'vent', meaning: '来' },
  { text: 'ver', meaning: '真实' },
  { text: 'viv', meaning: '活' },
  { text: 'vit', meaning: '生命' },
  { text: 'form', meaning: '形状' },
  { text: 'fac', meaning: '做' },
  { text: 'fact', meaning: '做' },
  { text: 'fect', meaning: '做' },
  { text: 'fid', meaning: '信任' },
  { text: 'gen', meaning: '产生、种类' },
  { text: 'grad', meaning: '步、等级' },
  { text: 'gress', meaning: '走' },
  { text: 'lab', meaning: '劳动' },
  { text: 'lect', meaning: '选择、读' },
  { text: 'leg', meaning: '读、法' },
  { text: 'loc', meaning: '地方' },
  { text: 'lum', meaning: '光' },
  { text: 'mar', meaning: '海' },
  { text: 'mem', meaning: '记忆' },
  { text: 'meter', meaning: '测量' },
  { text: 'min', meaning: '小' },
  { text: 'mov', meaning: '移动' },
  { text: 'mot', meaning: '移动' },
  { text: 'nom', meaning: '名字、法则' },
  { text: 'norm', meaning: '标准' },
  { text: 'opt', meaning: '看、选择' },
  { text: 'ord', meaning: '顺序' },
  { text: 'part', meaning: '部分' },
  { text: 'pass', meaning: '通过、感情' },
  { text: 'pend', meaning: '悬挂、称量' },
  { text: 'pens', meaning: '称量、思考' },
  { text: 'plic', meaning: '折叠' },
  { text: 'ply', meaning: '折叠' },
  { text: 'pop', meaning: '人民' },
  { text: 'press', meaning: '压' },
  { text: 'prim', meaning: '第一' },
  { text: 'quir', meaning: '寻求' },
  { text: 'quis', meaning: '寻求' },
  { text: 'reg', meaning: '统治、规则' },
  { text: 'rupt', meaning: '断裂' },
  { text: 'sci', meaning: '知道' },
  { text: 'sequ', meaning: '跟随' },
  { text: 'sign', meaning: '标记' },
  { text: 'simil', meaning: '相似' },
  { text: 'soci', meaning: '同伴' },
  { text: 'stat', meaning: '站立、状态' },
  { text: 'tend', meaning: '伸展' },
  { text: 'tens', meaning: '伸展' },
  { text: 'tract', meaning: '拉' },
  { text: 'uni', meaning: '一' },
  { text: 'urb', meaning: '城市' },
  { text: 'verb', meaning: '词、话' },
  { text: 'via', meaning: '路' },
  { text: 'vinc', meaning: '征服' },
  { text: 'volv', meaning: '卷、转' },
];

export interface MorphologySplit {
  formula: string;
  origin: string;
  /** 恒为自动拆分：UI 必须如实标注，不能冒充人工词根 */
  auto: true;
}

function longestMatch(word: string, table: Affix[], mode: 'prefix' | 'suffix'): Affix | null {
  const sorted = [...table].sort((a, b) => b.text.length - a.text.length);
  for (const item of sorted) {
    if (mode === 'prefix' && word.startsWith(item.text) && word.length - item.text.length >= 3) return item;
    if (mode === 'suffix' && word.endsWith(item.text) && word.length - item.text.length >= 3) return item;
  }
  return null;
}

function findRoot(stem: string): Affix | null {
  const sorted = [...ROOTS].sort((a, b) => b.text.length - a.text.length);
  return sorted.find((root) => stem.includes(root.text) && root.text.length >= 3) ?? null;
}

export function splitMorphology(lemma: string): MorphologySplit | null {
  const word = lemma.toLowerCase().replace(/[^a-z]/g, '');
  if (word.length < 6) return null;

  const prefix = longestMatch(word, PREFIXES, 'prefix');
  const rest = word.slice(prefix?.text.length ?? 0);
  const suffix = longestMatch(rest, SUFFIXES, 'suffix');
  const stem = rest.slice(0, rest.length - (suffix?.text.length ?? 0));
  if (stem.length < 3) return null;

  const root = findRoot(stem);
  // 至少要有「词根」或「前缀 + 后缀」两类证据，避免把任意单词硬拆
  if (!root && !(prefix && suffix)) return null;

  const parts: string[] = [];
  if (prefix) parts.push(`${prefix.text}-（${prefix.meaning}）`);
  parts.push(root ? `${root.text}（${root.meaning}）` : stem);
  if (suffix) parts.push(`-${suffix.text}（${suffix.meaning}）`);

  return {
    formula: parts.join(' + '),
    origin: root
      ? `按常见词根词缀自动拆分：${root.text} 表示「${root.meaning}」。未收录人工词根，仅供记忆参考。`
      : '按常见词缀自动拆分，未能确定词根，仅供记忆参考。',
    auto: true,
  };
}
