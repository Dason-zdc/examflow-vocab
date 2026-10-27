// 词源「问 AI 核对」：调 OpenRouter 兼容模型，按 docs/词根词缀法.md 规范产出结构化词素拆解，
// 服务端校验后写入 src/content/affix-lexicon.json（curated 库）并同步运行时覆盖层文件。
// Key 走环境变量 OPENROUTER_API_KEY（兼容 AI_API_KEY），不落仓库。
import fs from 'node:fs';
import path from 'node:path';
import { ApiError } from './routes.js';
import { db } from './db.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const LEXICON_PATH = path.join(ROOT, 'src', 'content', 'affix-lexicon.json');
const SPEC_PATH = path.join(ROOT, 'docs', '词根词缀法.md');
// 启动时读取 server/.env.local（gitignored）：KEY=VALUE 行，只补缺不覆盖已有环境变量。
// 免掉「PowerShell 设了变量、另一个终端起 serve 拿不到」的经典坑。
// 注意：必须在下方 AI_ENDPOINT 等常量初始化之前执行，否则 .env.local 不生效。
function loadEnvLocal() {
  const envPath = path.join(ROOT, 'server', '.env.local');
  try {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const key = m[1];
      let value = m[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* 没有 .env.local：只用真实环境变量 */
  }
}
loadEnvLocal();

const OVERRIDES_PATH = process.env.MORPH_OVERRIDES
  ?? path.join(ROOT, 'server', 'data', 'morph-overrides.json');
const AI_ENDPOINT = process.env.AI_ENDPOINT ?? 'https://openrouter.ai/api/v1/chat/completions';
const AI_MODEL = process.env.AI_MODEL ?? 'openai/gpt-4o';
// 免费池上游抖动频繁（429/403/404），主模型失败后自动按序降级重试。
// 注意：免费账户（未充值）调付费模型一律 402，候选只能从 :free 池里选。
const AI_FALLBACKS = (process.env.AI_FALLBACK_MODELS
  ?? 'poolside/laguna-xs-2.1:free,google/gemma-4-26b-a4b-it:free,google/gemma-4-31b-it:free,'
    + 'xingchen-agi/xing4.0-29b-a4b:free,nvidia/nemotron-3.5-lightning:free,'
    + 'dots-studio/dots-3-note-preview:free,recursive/flint-v1.0:free')
  .split(',').map((s) => s.trim()).filter(Boolean);
const WORD_RE = /^[a-z]{4,24}$/;
const KINDS = new Set(['prefix', 'root', 'suffix']);

function apiKey() {
  return process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY || '';
}

// ---------- 审计日志：每次核对的完整输入/输出落 SQLite（morph_ai_log） ----------
const LOG_KEEP = 5000;

function logAttempt(word, model, status, latencyMs, prompt, rawResponse, errorCode, errorMessage, entry) {
  try {
    db.prepare(`
      INSERT INTO morph_ai_log(ts, word, model, status, error_code, error_message, latency_ms, prompt, raw_response, entry)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(Date.now(), word, model, status, errorCode ?? null, errorMessage ?? null,
      latencyMs, prompt, rawResponse ?? null, entry ? JSON.stringify(entry) : null);
    db.exec(`DELETE FROM morph_ai_log WHERE id NOT IN (SELECT id FROM morph_ai_log ORDER BY id DESC LIMIT ${LOG_KEEP});`);
  } catch (err) {
    console.error('morph_ai_log 写入失败:', err?.message ?? err);
  }
}

export function morphLogHandler(query, headers) {
  const word = String(query.word ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(Number(query.limit ?? 20) || 20, 1), 100);
  const rows = word
    ? db.prepare('SELECT * FROM morph_ai_log WHERE word = ? ORDER BY id DESC LIMIT ?').all(word, limit)
    : db.prepare('SELECT * FROM morph_ai_log ORDER BY id DESC LIMIT ?').all(limit);
  const log = rows.map((r) => ({
    id: r.id,
    ts: r.ts,
    word: r.word,
    model: r.model,
    status: r.status,
    errorCode: r.error_code,
    errorMessage: r.error_message,
    latencyMs: r.latency_ms,
    prompt: safeJson(r.prompt),
    rawResponse: r.raw_response,
    entry: safeJson(r.entry),
  }));
  // 内容协商：浏览器直接访问渲染成可读页面；?format=json 或程序调用（Accept 无 text/html）仍返回 JSON
  if (String(query.format ?? '') !== 'json' && String(headers?.accept ?? '').includes('text/html')) {
    return { status: 200, html: renderLogPage(log, { word, limit }) };
  }
  return { status: 200, body: { log } };
}

function safeJson(text) {
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------- 日志页渲染：把审计记录排版成可读 HTML（自适应深浅色） ----------
function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (ch) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
  ));
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtLatency(ms) {
  if (typeof ms !== 'number' || Number.isNaN(ms)) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function renderEntryBlock(entry) {
  if (!entry || typeof entry !== 'object') return '';
  const chips = (entry.parts ?? []).map(([kind, form]) =>
    `<span class="chip">${esc(form)}<i>${esc(kind)}</i></span>`).join('<span class="plus">+</span>');
  const atoms = entry.atoms && typeof entry.atoms === 'object' && Object.keys(entry.atoms).length > 0
    ? `<div class="entry-row"><span class="entry-label">成分释义</span><div class="atoms">${
      Object.entries(entry.atoms).map(([k, v]) => `<span class="atom"><b>${esc(k)}</b>${esc(v)}</span>`).join('')
    }</div></div>`
    : '';
  const story = Array.isArray(entry.story) && entry.story.length > 0
    ? `<div class="entry-row"><span class="entry-label">词义演变</span><ol class="story">${
      entry.story.map((s) => `<li>${esc(s)}</li>`).join('')
    }</ol></div>`
    : '';
  return `<div class="entry">
    <div class="entry-row"><span class="entry-label">构词链</span><div class="chips">${chips}</div></div>
    <div class="entry-row"><span class="entry-label">直译</span><div>${esc(entry.literal)}</div></div>
    ${atoms}${story}
  </div>`;
}

function renderRawBlock(title, text) {
  return `<details class="raw"><summary>${esc(title)}</summary><pre>${esc(text)}</pre></details>`;
}

function renderPromptBlocks(prompt) {
  if (prompt == null) return '';
  if (typeof prompt === 'object') {
    return renderRawBlock('系统提示词', prompt.system ?? '')
      + renderRawBlock('用户提示词', prompt.user ?? '');
  }
  return renderRawBlock('提示词', prompt);
}

function renderLogPage(log, { word, limit }) {
  const okCount = log.filter((r) => r.status === 'ok').length;
  const errCount = log.length - okCount;
  const okRows = log.filter((r) => r.status === 'ok' && typeof r.latencyMs === 'number');
  const avgLatency = okRows.length > 0
    ? Math.round(okRows.reduce((s, r) => s + r.latencyMs, 0) / okRows.length)
    : null;
  const limitOptions = [20, 50, 100].map((n) =>
    `<option value="${n}"${n === limit ? ' selected' : ''}>最近 ${n} 条</option>`).join('');

  const rows = log.map((r) => {
    const ok = r.status === 'ok';
    const model = r.model && r.model !== '-' ? r.model : '—';
    return `<article class="row ${ok ? 'row-ok' : 'row-err'}">
      <header class="row-head">
        <span class="badge ${ok ? 'badge-ok' : 'badge-err'}">${ok ? '成功' : '失败'}</span>
        <a class="word" href="?word=${esc(r.word)}&amp;limit=${limit}">${esc(r.word)}</a>
        <span class="meta">${esc(model)}</span>
        <span class="meta">${fmtLatency(r.latencyMs)}</span>
        <span class="meta time">${fmtTime(r.ts)}</span>
        <span class="meta">#${r.id}</span>
      </header>
      ${ok ? '' : `<div class="err"><b>${esc(r.errorCode ?? 'unknown')}</b>${esc(r.errorMessage ?? '')}</div>`}
      ${ok ? renderEntryBlock(r.entry) : ''}
      <div class="raws">
        ${renderPromptBlocks(r.prompt)}
        ${r.rawResponse ? renderRawBlock('模型原始返回', r.rawResponse) : ''}
      </div>
    </article>`;
  }).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AI 核对审计日志 · ExamFlow Vocab</title>
<style>
:root { color-scheme: light dark; --bg:#f3f5f9; --card:#ffffff; --text:#1d2433; --muted:#667085;
  --line:#e4e8ef; --ok:#0f9d58; --ok-bg:#e6f6ee; --err:#d92d20; --err-bg:#fdeceb; --accent:#3556e0; }
@media (prefers-color-scheme: dark) {
  :root { --bg:#12151c; --card:#1b2029; --text:#e6e9f0; --muted:#98a1b2; --line:#2a3140;
    --ok-bg:#12291d; --err-bg:#331917; --accent:#8ba0ff; }
}
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--text);
  font: 14px/1.6 system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; }
.wrap { max-width: 920px; margin:0 auto; padding:28px 16px 56px; }
h1 { font-size:20px; margin:0 0 4px; }
.sub { color:var(--muted); font-size:12.5px; margin:0 0 20px; }
.sub a { color:var(--accent); }
.stats { display:flex; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
.stat { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:10px 18px; min-width:110px; }
.stat b { display:block; font-size:20px; }
.stat span { color:var(--muted); font-size:12px; }
.stat-ok b { color:var(--ok); }
.stat-err b { color:var(--err); }
.filters { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; align-items:center; }
.filters input, .filters select { background:var(--card); border:1px solid var(--line); color:var(--text);
  border-radius:8px; padding:7px 10px; font-size:13px; }
.filters input { width:220px; }
.filters button { background:var(--accent); border:0; color:#fff; border-radius:8px; padding:7px 16px;
  font-size:13px; cursor:pointer; }
.filters .clear { color:var(--muted); font-size:12.5px; }
.row { background:var(--card); border:1px solid var(--line); border-left:3px solid var(--line);
  border-radius:10px; padding:12px 16px; margin-bottom:12px; }
.row-ok { border-left-color:var(--ok); }
.row-err { border-left-color:var(--err); }
.row-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.badge { font-size:11.5px; font-weight:600; border-radius:999px; padding:2px 10px; }
.badge-ok { color:var(--ok); background:var(--ok-bg); }
.badge-err { color:var(--err); background:var(--err-bg); }
.word { font-weight:700; font-size:15px; color:var(--accent); text-decoration:none; }
.word:hover { text-decoration:underline; }
.meta { color:var(--muted); font-size:12.5px; }
.meta.time { margin-left:auto; }
.err { margin-top:8px; background:var(--err-bg); color:var(--err); border-radius:8px; padding:8px 12px; font-size:13px; }
.err b { margin-right:8px; }
.entry { margin-top:10px; padding-top:10px; border-top:1px dashed var(--line); display:grid; gap:6px; }
.entry-row { display:flex; gap:10px; align-items:baseline; }
.entry-label { color:var(--muted); font-size:12px; flex:0 0 60px; text-align:right; }
.chips { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
.chip { border:1px solid var(--line); border-radius:6px; padding:1px 8px; font-weight:600; font-size:13px; background:var(--bg); }
.chip i { font-style:normal; color:var(--muted); font-size:11px; margin-left:5px; font-weight:400; }
.plus { color:var(--muted); }
.atoms { display:flex; gap:6px; flex-wrap:wrap; }
.atom { background:var(--bg); border:1px solid var(--line); border-radius:6px; padding:1px 8px; font-size:12.5px; }
.atom b { margin-right:6px; }
.story { margin:0; padding-left:18px; }
.raws { margin-top:10px; display:grid; gap:6px; }
.raw summary { cursor:pointer; color:var(--muted); font-size:12.5px; user-select:none; }
.raw pre { margin:6px 0 0; background:var(--bg); border:1px solid var(--line); border-radius:8px;
  padding:10px 12px; max-height:280px; overflow:auto; font-size:12px; line-height:1.5;
  white-space:pre-wrap; word-break:break-all; }
.empty { background:var(--card); border:1px dashed var(--line); border-radius:10px; padding:32px;
  text-align:center; color:var(--muted); }
</style>
</head>
<body>
<div class="wrap">
  <h1>AI 核对审计日志</h1>
  <p class="sub">每次「问 AI 核对」的完整输入/输出审计（保留最近 5000 条）· 点击单词可按词过滤 ·
    <a href="?word=${esc(word)}&amp;limit=${limit}&amp;format=json">查看 JSON</a></p>
  <div class="stats">
    <div class="stat"><b>${log.length}</b><span>显示条数${word ? `（${esc(word)}）` : ''}</span></div>
    <div class="stat stat-ok"><b>${okCount}</b><span>成功</span></div>
    <div class="stat stat-err"><b>${errCount}</b><span>失败</span></div>
    <div class="stat"><b>${esc(fmtLatency(avgLatency))}</b><span>平均耗时（成功）</span></div>
  </div>
  <form class="filters" method="get" action="/api/v1/morph/log">
    <input name="word" value="${esc(word)}" placeholder="按单词过滤，如 consist">
    <select name="limit">${limitOptions}</select>
    <button type="submit">筛选</button>
    ${word ? `<a class="clear" href="/api/v1/morph/log?limit=${limit}">清除过滤</a>` : ''}
  </form>
  ${log.length > 0 ? rows : '<div class="empty">暂无日志：还没有触发过「问 AI 核对」。</div>'}
</div>
</body>
</html>`;
}

function loadLexicon() {
  return JSON.parse(fs.readFileSync(LEXICON_PATH, 'utf8'));
}

function loadSpec() {
  try {
    return fs.readFileSync(SPEC_PATH, 'utf8').slice(0, 6000);
  } catch {
    return '（规范文档缺失：请按拉丁词源惯例拆分，成分必须来自词表）';
  }
}

function indexLexicon(lex) {
  const prefixes = new Set();
  const suffixes = new Set();
  const roots = new Set();
  const rootAliases = new Map();
  for (const row of lex.prefixes ?? []) prefixes.add(String(row[0]).toLowerCase());
  for (const row of lex.suffixes ?? []) suffixes.add(String(row[0]).toLowerCase());
  for (const row of lex.roots ?? []) {
    const form = String(row[0]).toLowerCase();
    roots.add(form);
    for (const v of (row[5] ?? [])) if (!roots.has(String(v).toLowerCase())) rootAliases.set(String(v).toLowerCase(), form);
  }
  return { prefixes, suffixes, roots, rootAliases };
}

function resolvable(parts, idx) {
  const bad = [];
  for (const [kind, form] of parts) {
    const f = String(form).toLowerCase();
    if (kind === 'prefix' && !idx.prefixes.has(f)) bad.push(f);
    if (kind === 'suffix' && !idx.suffixes.has(f)) bad.push(f);
    if (kind === 'root' && !idx.roots.has(f) && !idx.rootAliases.has(f)) bad.push(f);
  }
  return bad;
}

/** 词表里能用于该词的成分（原样出现在单词中的前缀/词根/后缀），注入提示词让模型只从这里选 */
function candidateComponents(word, idx) {
  const found = { prefix: [], root: [], suffix: [] };
  const push = (kind, f) => {
    if (f.length >= 2 && f.length < word.length && word.includes(f) && found[kind].length < 24) found[kind].push(f);
  };
  for (const f of idx.prefixes) push('prefix', f);
  for (const f of idx.roots) push('root', f);
  for (const f of idx.rootAliases.keys()) push('root', f);
  for (const f of idx.suffixes) push('suffix', f);
  return found;
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new ApiError(502, 'ai_bad_shape', '模型没有返回 JSON');
  return JSON.parse(raw.slice(start, end + 1));
}

function validate(word, ai, current) {
  if (String(ai.word ?? '').toLowerCase() !== word) {
    throw new ApiError(422, 'morph_word_mismatch', `模型返回的单词与请求不符：${ai.word}`);
  }
  if (!Array.isArray(ai.parts) || ai.parts.length === 0) {
    throw new ApiError(422, 'morph_no_parts', '模型未返回 parts');
  }
  const parts = [];
  for (const p of ai.parts) {
    const [kind, form] = Array.isArray(p) ? p : [p?.kind, p?.form];
    const k = String(kind ?? '').toLowerCase();
    // 词缀常被模型按惯例写成 ad- / -ion（带连字符）。成分必须首尾相接拼出纯字母整词，
    // 连字符只可能是书写符号：剥掉首尾连字符后再校验；内部连字符仍会被正则拒绝。
    const f = String(form ?? '').toLowerCase().replace(/^-+|-+$/g, '');
    if (!KINDS.has(k) || !/^[a-z]{1,15}$/.test(f)) {
      throw new ApiError(422, 'morph_bad_part', `成分不合法：${kind}/${form}`);
    }
    parts.push([k, f]);
  }
  const covered = parts.map(([, f]) => f).join('');
  // 与运行时契约（morphology.ts fromCurated）对齐：词尾不发音的 e 可以留在整词里不拆，
  // 如 advice = ad + vic、cause = caus——否则正确拆分也会被 morph_not_covered 拒掉。
  const silentE = word.endsWith('e') && covered === word.slice(0, -1);
  if (covered !== word && !silentE) {
    throw new ApiError(422, 'morph_not_covered', `成分拼接「${covered}」未覆盖整词「${word}」`);
  }
  const idx = indexLexicon(loadLexicon());
  const bad = resolvable(parts, idx);
  if (bad.length > 0) {
    throw new ApiError(422, 'morph_unknown_form',
      `成分不在词表，无法入库：${bad.join('、')}（请先扩词表或换拆分）`);
  }
  const literal = String(ai.literal ?? '').trim();
  if (!literal) throw new ApiError(422, 'morph_no_literal', '模型未返回 literal');
  let story = Array.isArray(ai.story) ? ai.story.map((s) => String(s).trim()).filter(Boolean) : [];
  // 防降级合并：库内已有 atoms / story 时，AI 没有显式给出更好的就保留现值，
  // 避免把人工调优过的记忆链（如 consist 的 con=一起）悄悄回退成词表默认义
  const atoms = (ai.atoms && typeof ai.atoms === 'object' && !Array.isArray(ai.atoms) && Object.keys(ai.atoms).length > 0)
    ? ai.atoms
    : current?.atoms;
  if (story.length < 2 && Array.isArray(current?.story) && current.story.length >= 2) {
    story = current.story;
  }
  const entry = { parts, literal, authoredBy: 'AI_DRAFTED' };
  if (atoms && Object.keys(atoms).length > 0) entry.atoms = atoms;
  if (story.length >= 2) entry.story = story;
  entry.aiCheckedAt = new Date().toISOString();
  return entry;
}

async function callModel(model, system, user) {
  const ctrl = new AbortController();
  // 60s：免费池模型首 token 慢，40s 不足以覆盖 kimi 这类长输出模型
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(AI_ENDPOINT, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        'HTTP-Referer': 'https://examflow.local',
        'X-Title': 'ExamFlow Vocab',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new ApiError(502, 'ai_upstream', `模型服务返回 ${res.status}：${text.slice(0, 200)}`);
    }
    const body = await res.json();
    return body?.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(502, 'ai_unreachable', `模型服务不可达：${err?.message ?? err}`);
  } finally {
    clearTimeout(timer);
  }
}

function saveOverride(word, entry) {
  let overrides = {};
  try {
    overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch {
    /* 首次写入 */
  }
  overrides[word] = entry;
  fs.mkdirSync(path.dirname(OVERRIDES_PATH), { recursive: true });
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(overrides, null, 1) + '\n', 'utf8');
  return overrides;
}

export async function morphAskHandler(body) {
  const word = String(body?.word ?? '').trim().toLowerCase();
  if (!WORD_RE.test(word)) {
    logAttempt(word, '-', 'error', 0, '', null, 'bad_word', '单词需为 4-24 位小写字母', null);
    throw new ApiError(400, 'bad_word', '单词需为 4-24 位小写字母');
  }
  const lex = loadLexicon();
  if ((lex.blocked ?? []).map((w) => String(w).toLowerCase()).includes(word)) {
    logAttempt(word, '-', 'error', 0, '', null, 'morph_blocked', '误拆黑名单，不允许 AI 覆盖', null);
    throw new ApiError(422, 'morph_blocked', `「${word}」已在误拆黑名单（自动拆分不成立），不允许 AI 覆盖`);
  }
  if (!apiKey()) {
    logAttempt(word, '-', 'error', 0, '', null, 'ai_not_configured', '未配置 OPENROUTER_API_KEY', null);
    throw new ApiError(503, 'ai_not_configured',
      '未配置 OPENROUTER_API_KEY（服务端环境变量），无法调用模型');
  }
  const current = lex.curated?.[word] ?? null;
  const currentText = current
    ? JSON.stringify({ parts: current.parts, literal: current.literal, story: current.story ?? [] })
    : '（库内暂无该词）';
  const candidates = candidateComponents(word, indexLexicon(lex));

  const system = [
    '你是英语词源学与构词法审核助手。你的唯一输出是一个 JSON 对象，不要任何多余文字。',
    '拆解必须遵守以下规范（来自项目文档）：',
    loadSpec(),
    '输出格式：{"word":"小写单词","parts":[["prefix|root|suffix","字母片段"],...],"literal":"成分直译连成的一句中文","story":["演变第一步","第二步","...至少两步"]}',
    '硬性规则：parts 首尾相接必须恰好拼出整词（词尾不发音的 e 可以留在整词里不拆）；每个成分字母片段必须原样出现在单词中；',
    '成分只写纯字母，不要带连字符（写 ad 不是 ad-，写 ion 不是 -ion）；',
    '前缀同化按单词里的实际拼写写：ad 在 c/f/g/p/s/t 前写成 ac/af/ag/ap/as/at，',
    '如 assess = as + sess（不是 ad + sess）、accept = ac + cept；',
    '优先只用用户消息里给出的「词表可用成分」组合拆分——使用词表外的成分会被拒绝；',
    'literal 不叠「的」；story 从词根本义推演到当前词义，不编造不存在的词源。',
  ].join('\n');
  const user = [
    `请核对单词「${word}」的词根词缀拆解。`,
    '库内当前数据（若为空请给出新拆解；若有误请修正）：',
    currentText,
    '词表可用成分（能原样出现在该词中的，优先从这里选）：',
    `前缀：${candidates.prefix.join('、') || '（无）'}`,
    `词根：${candidates.root.join('、') || '（无）'}`,
    `后缀：${candidates.suffix.join('、') || '（无）'}`,
    '只输出 JSON。',
  ].join('\n');

  const models = [AI_MODEL, ...AI_FALLBACKS.filter((m) => m !== AI_MODEL)];
  let lastError = null;
  // 两轮轮询：免费池 429 是时段性拥堵，隔几秒换模型再试往往就通
  for (let round = 0; round < 2; round += 1) {
    if (round > 0) await new Promise((r) => setTimeout(r, 4000));
    for (const model of models) {
      const t0 = Date.now();
      let raw = null;
      try {
        raw = await callModel(model, system, user);
        const ai = extractJson(raw);
        const entry = validate(word, ai, current);
        const latencyMs = Date.now() - t0;
        logAttempt(word, model, 'ok', latencyMs,
          JSON.stringify({ system, user }), raw, null, null, entry);
        lex.curated[word] = entry;
        fs.writeFileSync(LEXICON_PATH, JSON.stringify(lex, null, 1) + '\n', 'utf8');
        const overrides = saveOverride(word, entry);
        return { status: 200, body: { ok: true, word, entry, model, latencyMs, overrideCount: Object.keys(overrides).length } };
      } catch (err) {
        lastError = err;
        logAttempt(word, model, 'error', Date.now() - t0,
          JSON.stringify({ system, user }), raw, err?.code ?? 'unknown', err?.message ?? String(err), null);
        if (err instanceof ApiError && (err.code === 'bad_word' || err.code === 'ai_not_configured')) throw err;
        // 其余（上游不可用/模型输出不合规）换下一个模型重试
      }
    }
  }
  throw lastError ?? new ApiError(502, 'ai_upstream', '所有候选模型均失败');
}

export function morphOverridesHandler() {
  let overrides = {};
  try {
    overrides = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'));
  } catch {
    /* 尚无覆盖层 */
  }
  return { status: 200, body: { overrides } };
}
