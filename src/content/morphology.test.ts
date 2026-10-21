import { describe, expect, it } from 'vitest';
import { splitMorphology } from './morphology';

describe('词缀自动拆分（词根兜底）', () => {
  it('能拆出前缀 + 词根 + 后缀', () => {
    const split = splitMorphology('information');
    expect(split).not.toBeNull();
    expect(split?.formula).toContain('in-');
    expect(split?.formula).toContain('form');
    expect(split?.formula).toContain('-ation');
    expect(split?.auto).toBe(true);
  });

  it('只有后缀、没有词根证据时不硬拆', () => {
    expect(splitMorphology('beautiful')).toBeNull();
  });

  it('短词不拆', () => {
    expect(splitMorphology('cat')).toBeNull();
    expect(splitMorphology('idea')).toBeNull();
  });

  it('自动拆分必须带「仅供参考」声明', () => {
    const split = splitMorphology('component');
    expect(split?.origin).toContain('参考');
  });
});
