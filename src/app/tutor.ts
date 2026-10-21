import type { Settings } from '../domain/types';

/** AI 私教（P1，PRD 8.3 方案 A：用户自带 Key 直连 OpenAI 兼容接口）。
 * 明确不提供「无 Key 的模拟回答」：未配置就引导配置，请求失败就如实报错。 */

export type TutorMode = 'MNEMONIC' | 'SENTENCE_PARSE' | 'CONFUSABLE_COMPARE' | 'FREE_QUESTION';

export type TutorConfig = Pick<Settings, 'aiBaseUrl' | 'aiApiKey' | 'aiModel'>;

export interface TutorWordContext {
  lemma: string;
  pos: string;
  cn: string;
  enDef?: string;
  sentence?: string;
  confusables: string[];
}

export const TUTOR_MODES: Array<{ mode: TutorMode; label: string }> = [
  { mode: 'MNEMONIC', label: '助记' },
  { mode: 'SENTENCE_PARSE', label: '例句拆解' },
  { mode: 'CONFUSABLE_COMPARE', label: '形近词对比' },
];

const SYSTEM_PROMPT =
  '你是中国考研/雅思备考的英语私教。用简体中文回答，简洁、可直接背诵，控制在 200 字以内。' +
  '不要编造考试出处、年份或题号；不确定时就说明不确定。不要使用 Markdown 表格。';

export function isTutorConfigured(config: TutorConfig): boolean {
  // 防御历史版本的设置行：AI 字段是后加的，可能是 undefined
  return Boolean(config.aiBaseUrl?.trim() && config.aiApiKey?.trim() && config.aiModel?.trim());
}

export function buildTutorMessages(
  ctx: TutorWordContext,
  mode: TutorMode,
  question = '',
): Array<{ role: 'system' | 'user'; content: string }> {
  const context = [
    `单词：${ctx.lemma}`,
    `词性：${ctx.pos || '（未标注）'}`,
    `释义：${ctx.cn}`,
    ctx.enDef ? `英文释义：${ctx.enDef}` : '',
    ctx.sentence ? `例句：${ctx.sentence}` : '',
    ctx.confusables.length > 0 ? `形近词：${ctx.confusables.join('、')}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const ask: Record<TutorMode, string> = {
    MNEMONIC: '请给一个助记方法（词根拆解或联想），再给一句考试风格的例句和中文翻译。',
    SENTENCE_PARSE: '请拆解例句主干（主语/谓语/宾语）与修饰成分，说明该词在句中的成分，再给中文翻译。',
    CONFUSABLE_COMPARE: '请对比它与这些形近词的含义与用法差异，最后给一句串记口诀。',
    FREE_QUESTION: `请回答：${question.trim() || '这个词怎么用？'}`,
  };

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `${context}\n\n${ask[mode]}` },
  ];
}

/** 请求超时（PRD 8.3 共同要求：20 秒） */
export const TUTOR_TIMEOUT_MS = 20_000;

export interface TutorRequestInput {
  config: TutorConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  /** 切换卡片时取消进行中的请求，避免把上一个词的结果存到当前词 */
  signal?: AbortSignal;
}

export async function requestTutor(input: TutorRequestInput): Promise<string> {
  const base = (input.config.aiBaseUrl ?? '').trim().replace(/\/+$/, '');
  const apiKey = (input.config.aiApiKey ?? '').trim();
  const model = (input.config.aiModel ?? '').trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TUTOR_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  input.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: input.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`接口返回 ${response.status}${detail ? `：${detail.slice(0, 120)}` : ''}`);
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error('接口没有返回内容');
    return content;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new Error(input.signal?.aborted ? '请求已取消' : '请求超时（20 秒），请检查网络或接口地址');
    }
    if (err instanceof TypeError) {
      throw new Error('无法连接接口：请检查 Base URL，并确认该服务允许浏览器跨域调用');
    }
    throw err instanceof Error ? err : new Error(String(err));
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', onAbort);
  }
}
