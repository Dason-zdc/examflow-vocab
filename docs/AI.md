# 词源「问 AI 核对」接口调用示例（服务端已实现于 server/morph-ai.js）

> 安全提示：Key 只放 `server/.env.local`（已 gitignore），不要写进任何会入库的文件。
> 参考 server/.env.example 配置 OPENROUTER_API_KEY 与 AI_MODEL。

fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: {
    Authorization: 'Bearer <你的 OPENROUTER_API_KEY，见 server/.env.local>',
    'HTTP-Referer': '<YOUR_SITE_URL>',
    'X-Title': '<YOUR_SITE_NAME>',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    model: 'openai/gpt-4o',
    messages: [
      {
        role: 'user',
        content: 'What is the meaning of life?',
      },
    ],
  }),
});
