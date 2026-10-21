import { describe, expect, it } from 'vitest';
import { evaluateSpelling, nextHint } from './spelling';

describe('拼写比对（S-01）', () => {
  it('逐字母标记正确 / 错误 / 未输入', () => {
    const result = evaluateSpelling('address', 'adres');
    expect(result.slots.map((s) => s.state)).toEqual(['ok', 'ok', 'bad', 'bad', 'bad', 'empty', 'empty']);
    expect(result.correct).toBe(false);
  });

  it('大小写与首尾空格不参与判定', () => {
    expect(evaluateSpelling('Address', '  ADDRESS ').correct).toBe(true);
  });

  it('多输入的字母计入 extra', () => {
    const result = evaluateSpelling('cat', 'cats');
    expect(result.correct).toBe(false);
    expect(result.extra).toBe(1);
  });

  it('提示保留正确前缀并多给一个字母，错误尾巴被截掉', () => {
    expect(nextHint('address', '')).toBe('a');
    expect(nextHint('address', 'add')).toBe('addr');
    expect(nextHint('address', 'adx')).toBe('add');
    expect(nextHint('cat', 'cat')).toBe('cat');
  });
});
