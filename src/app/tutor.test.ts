import { describe, expect, it } from 'vitest';
import { buildTutorMessages, isTutorConfigured, type TutorWordContext } from './tutor';

const CTX: TutorWordContext = {
  lemma: 'address',
  pos: 'v.',
  cn: '处理，解决',
  enDef: 'deal with a problem',
  sentence: 'Governments must address the root causes.',
  confusables: ['assess', 'access'],
};

describe('AI 私教（S-03）', () => {
  it('三项配置齐全才视为已配置', () => {
    expect(isTutorConfigured({ aiBaseUrl: '', aiApiKey: '', aiModel: '' })).toBe(false);
    expect(isTutorConfigured({ aiBaseUrl: 'https://api.x.com/v1', aiApiKey: 'sk-1', aiModel: '' })).toBe(false);
    expect(isTutorConfigured({ aiBaseUrl: 'https://api.x.com/v1', aiApiKey: 'sk-1', aiModel: 'm' })).toBe(true);
  });

  it('助记模式带上词条上下文与形近词', () => {
    const messages = buildTutorMessages(CTX, 'MNEMONIC');
    expect(messages[0]?.role).toBe('system');
    const user = messages[1]?.content ?? '';
    expect(user).toContain('address');
    expect(user).toContain('处理，解决');
    expect(user).toContain('assess');
    expect(user).toContain('助记');
  });

  it('自由提问模式把问题拼进提示词', () => {
    const messages = buildTutorMessages(CTX, 'FREE_QUESTION', 'address 和 deal with 有什么区别？');
    expect(messages[1]?.content).toContain('address 和 deal with 有什么区别？');
  });

  it('系统提示禁止编造真题出处', () => {
    const messages = buildTutorMessages(CTX, 'SENTENCE_PARSE');
    expect(messages[0]?.content).toContain('不要编造');
  });
});
