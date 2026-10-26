import { describe, expect, it } from 'vitest';
import { analyzeMorphology, composeLiteral, familyKey } from './morphology';
import { AFFIX_LEXICON, applyAiOverride, lexiconStats, resetAiOverrides, type MorphKind } from './affixLexicon';

function forms(lemma: string): string {
  const hit = analyzeMorphology(lemma);
  return hit ? hit.parts.map((p) => p.form).join('+') : 'null';
}

describe('词根词缀词表', () => {
  it('三类词表都有足够条目，且版本可追溯', () => {
    const stats = lexiconStats();
    expect(stats.prefixes).toBeGreaterThanOrEqual(100);
    expect(stats.roots).toBeGreaterThanOrEqual(200);
    expect(stats.suffixes).toBeGreaterThanOrEqual(50);
    expect(stats.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe('四步法·第一步 拆解', () => {
  it('unpredictable = un + pre + dict + able（用户给的基准例）', () => {
    const hit = analyzeMorphology('unpredictable');
    expect(hit).not.toBeNull();
    expect(hit!.parts.map((p) => [p.kind, p.form])).toEqual([
      ['PREFIX', 'un'],
      ['PREFIX', 'pre'],
      ['ROOT', 'dict'],
      ['SUFFIX', 'able'],
    ]);
    expect(hit!.confidence).toBe('CURATED');
    expect(hit!.root.cn).toContain('说');
  });

  it('同根词网：contradict / benediction / malediction 都归到 dict', () => {
    for (const word of ['contradict', 'benediction', 'malediction', 'dictionary', 'verdict']) {
      const hit = analyzeMorphology(word);
      expect(hit, word).not.toBeNull();
      expect(familyKey(hit), word).toBe('dict');
    }
    expect(forms('contradict')).toBe('contra+dict');
    expect(forms('benediction')).toBe('bene+dict+ion');
    expect(forms('malediction')).toBe('male+dict+ion');
  });

  it('多后缀链只按词素边界展开：transportation / communication', () => {
    expect(forms('transportation')).toBe('trans+port+ation');
    expect(forms('communication')).toBe('com+mun+ic+ation');
  });

  it('允许词尾不发音的 e：microscope / telephone', () => {
    const scope = analyzeMorphology('microscope');
    expect(scope?.parts.map((p) => p.form)).toEqual(['micro', 'scop']);
    expect(scope?.silentE).toBe(true);
    expect(analyzeMorphology('telephone')?.parts.map((p) => p.form)).toEqual(['tele', 'phon']);
  });

  it('变体归一到主条目：predict 里的 dict 不拆成 dic', () => {
    expect(forms('predict')).toBe('pre+dict');
    expect(analyzeMorphology('predict')?.root.key).toBe('dict');
  });
});

describe('四步法·第三步 重组推演', () => {
  it('否定前缀整体包在最外层：invisible → 不能被看见的', () => {
    expect(analyzeMorphology('invisible')?.literal).toBe('不能被看见的');
  });

  it('机械直译按成分顺序拼接，不做词典释义替换', () => {
    const hit = analyzeMorphology('deformation');
    expect(hit?.confidence).toBe('AUTO');
    expect(composeLiteral(hit!.parts)).toBe(hit!.literal);
  });
});

describe('精度优先：没有可靠词根就不拆', () => {
  it('短词与无词根词不硬拆', () => {
    expect(analyzeMorphology('cat')).toBeNull();
    expect(analyzeMorphology('idea')).toBeNull();
    expect(analyzeMorphology('beautiful')).toBeNull();
  });

  it('cit 不能把 city 拉进「唤起」词族', () => {
    // city 已按真实词源上链（civ 公民 → cité → city，见下方红线测试）；
    // 历史上担心的 cit=唤起 词根从不存在，cite 家族已整体拉黑防同形污染。
    expect(familyKey(analyzeMorphology('city'))).toBe('civ');
  });

  it('present 拆 pre + sent，但 sent 必须释「在」（esse 词干），不是「感觉」（sentire）', () => {
    const hit = analyzeMorphology('present');
    expect(hit).not.toBeNull();
    expect(hit!.parts.map((p) => p.form)).toEqual(['pre', 'sent']);
    expect(hit!.parts[1]!.gloss).toBe('在');
    expect(hit!.showOnCard).toBe(true);
    expect(hit!.literal).toBe('就在眼前的');
  });

  it('自动拆分如实标注「未复核」，且不上学习卡', () => {
    expect(analyzeMorphology('deformation')?.confidence).toBe('AUTO');
    expect(analyzeMorphology('deformation')?.note).toContain('未逐词人工复核');
    expect(analyzeMorphology('deformation')?.showOnCard).toBe(false);
    expect(analyzeMorphology('unpredictable')?.note).toContain('人工校订');
    expect(analyzeMorphology('unpredictable')?.showOnCard).toBe(true);
  });
});

describe('记忆链口径（一行 + 不叠「的」）', () => {
  it('组合后缀当一个整体：identification 不再拆成 -ific + -ation', () => {
    const hit = analyzeMorphology('identification');
    expect(hit).not.toBeNull();
    expect(hit!.parts.map((p) => p.form)).toEqual(['ident', 'ification']);
  });

  it('记忆链用短义拼接，不把教学义里的「的」带进句子', () => {
    const hit = analyzeMorphology('significant');
    expect(hit!.literal).toBe('做出标记的');
    expect(hit!.literal).not.toContain('的的');
    // 自动拼接（没有人工 literal）也不该出现叠字
    const derived = analyzeMorphology('unpredictable');
    expect(derived!.literal).not.toMatch(/的的/);
  });

  it('人工 atoms 覆盖通用短义：con 记「一起」而不是「共同」', () => {
    const hit = analyzeMorphology('consist');
    expect(hit!.parts.map((p) => p.gloss)).toEqual(['一起', '站']);
    expect(hit!.bridge).toBe('站到一起');
  });

  it('记忆链标注来源：AI 起草不冒充人工', () => {
    expect(analyzeMorphology('consist')?.authoredBy).toBe('AI_DRAFTED');
    expect(analyzeMorphology('unpredictable')?.authoredBy).toBe('HUMAN');
  });

  it('corporate 出 blocked 上卡：corpor(团体) + ate(使)，同根归 corp', () => {
    const hit = analyzeMorphology('corporate');
    expect(hit).not.toBeNull();
    expect(hit!.parts.map((p) => [p.kind, p.form])).toEqual([
      ['ROOT', 'corpor'],
      ['SUFFIX', 'ate'],
    ]);
    expect(hit!.confidence).toBe('CURATED');
    expect(hit!.showOnCard).toBe(true);
    expect(hit!.authoredBy).toBe('AI_DRAFTED');
    expect(hit!.bridge).toBe('结成团体的');
    expect(familyKey(hit)).toBe('corp');
  });

  it('emergency 改挂 merg（沉），不再误用 erg（功）', () => {
    const hit = analyzeMorphology('emergency');
    expect(hit).not.toBeNull();
    expect(hit!.parts.map((p) => [p.kind, p.form])).toEqual([
      ['PREFIX', 'e'],
      ['ROOT', 'merg'],
      ['SUFFIX', 'ency'],
    ]);
    expect(hit!.root.cn).toContain('沉');
    expect(hit!.literal).toBe('从沉没里冒出来的状态');
  });

  it('全量词根词缀审核新增的链全部上卡（CURATED + AI_DRAFTED）', () => {
    const words = [
      'accurate', 'apparent', 'coincide', 'conversation', 'portion', 'emerge',
      'emotion', 'energy', 'question', 'contain', 'support',
      'provide', 'confess', 'transmit', 'surface', 'innocent', 'transparent',
      'present', 'presentation', 'represent', 'representative',
      'illegal', 'incidence', 'decade',
    ];
    for (const word of words) {
      const hit = analyzeMorphology(word);
      expect(hit, word).not.toBeNull();
      expect(hit!.confidence, word).toBe('CURATED');
      expect(hit!.showOnCard, word).toBe(true);
      expect(hit!.authoredBy, word).toBe('AI_DRAFTED');
    }
  });

  it('事实级误拆的自动结果不入卡（审核后扩充 blocked）', () => {
    for (const word of [
      'coverage', 'undermine', 'decorate', 'experienced', 'decent', 'tactic',
      'adapt', 'condition', 'experiment', 'encounter',
    ]) {
      expect(analyzeMorphology(word), word).toBeNull();
    }
  });

  it('curated 无死数据：每条人工链都能完整解析并上卡', () => {
    for (const [word] of AFFIX_LEXICON.curated) {
      if (word.length < 4 || word.length > 24) continue;
      const hit = analyzeMorphology(word);
      expect(hit, word).not.toBeNull();
      expect(hit!.confidence, word).toBe('CURATED');
      expect(hit!.showOnCard, word).toBe(true);
    }
  });

  it('红线两度调整（MIN_WORD 6→5→4）：city 上卡，假同源 4 字母仍拒绝', () => {
    const city = analyzeMorphology('city');
    expect(city).not.toBeNull();
    expect(city!.parts.map((p) => [p.kind, p.form])).toEqual([
      ['ROOT', 'cit'],
      ['SUFFIX', 'y'],
    ]);
    expect(city!.root.key).toBe('civ');
    expect(city!.showOnCard).toBe(true);
    expect(analyzeMorphology('dice')).toBeNull();
    expect(analyzeMorphology('mine')).toBeNull();
    expect(analyzeMorphology('sale')).toBeNull();
  });

  it('词义演变链：corporate 从身体到公司逐级推演', () => {
    const hit = analyzeMorphology('corporate');
    expect(hit!.story).toBeDefined();
    expect(hit!.story!.length).toBeGreaterThanOrEqual(3);
    expect(hit!.story![0]).toContain('corpus');
    expect(hit!.story![hit!.story!.length - 1]).toContain('公司');
  });

  it('story 全量守卫：每条 story 都是 2 步以上的非空字符串', () => {
    for (const [, curated] of AFFIX_LEXICON.curated) {
      if (!curated.story) continue;
      expect(curated.story.length, curated.literal).toBeGreaterThanOrEqual(2);
      for (const step of curated.story) {
        expect(step.trim().length, step).toBeGreaterThan(0);
      }
    }
  });

  it('AI 覆盖层即时生效（小写 kind 归一化）并可复位', () => {
    const before = analyzeMorphology('consist');
    applyAiOverride('consist', {
      // 服务端 JSON 里 kind 是小写：模拟原始数据，覆盖层必须归一化
      parts: [['prefix', 'con'], ['root', 'sist']] as unknown as Array<[MorphKind, string]>,
      literal: 'AI 核对后的直译',
      authoredBy: 'AI_DRAFTED',
      story: ['sistere 站立', 'con- 站到一起', '→ 测试覆盖'],
    });
    const after = analyzeMorphology('consist');
    expect(after?.confidence).toBe('CURATED');
    expect(after?.literal).toBe('AI 核对后的直译');
    expect(after?.story).toEqual(['sistere 站立', 'con- 站到一起', '→ 测试覆盖']);
    expect(after?.authoredBy).toBe('AI_DRAFTED');
    resetAiOverrides();
    expect(analyzeMorphology('consist')?.literal).toBe(before?.literal);
  });

  it('decade 拆 dec(十) + ade(组)，不再被 cad(落) 拉走', () => {
    const hit = analyzeMorphology('decade');
    expect(hit!.parts.map((p) => [p.kind, p.form])).toEqual([
      ['ROOT', 'dec'],
      ['SUFFIX', 'ade'],
    ]);
    expect(hit!.literal).toBe('十个一组');
  });
});
