import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * 后端集成冒烟（node:test，无第三方依赖）：
 * 起一个独立端口的服务 + 临时 SQLite 库，覆盖认证、鉴权、同步 LWW/墓碑、数据包接口。
 * 运行：npm run test:api
 */

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.SMOKE_PORT ?? 8799);
const BASE = `http://localhost:${PORT}/api/v1`;
const ORIGIN = `http://localhost:${PORT}`;
const DB_PATH = path.join(os.tmpdir(), `examflow-smoke-${Date.now()}.db`);
const MORPH_OVERRIDES = path.join(os.tmpdir(), `examflow-morph-overrides-${Date.now()}.json`);
const USERNAME = `smoke_${Date.now().toString(36)}`;
const PASSWORD = 'password123';

let child = null;
let token = '';

async function waitHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* 服务还没起来 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('后端在 15s 内没有就绪');
}

async function api(path, options = {}) {
  const res = await fetch(BASE + path, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

function cardChange(v, reps, deleted = false) {
  return {
    op: 'upsert',
    v,
    data: {
      id: 'IELTS:s_1',
      exam: 'IELTS',
      word_id: 'w_address',
      sense_id: 's_1',
      kind: 'PRIMARY',
      fsrs: JSON.stringify({ due: '2026-10-22T00:00:00.000Z', stability: 1, difficulty: 5, elapsed_days: 0, scheduled_days: 1, reps, lapses: 0, state: 2, last_review: '2026-10-21T00:00:00.000Z' }),
      suspended: 0,
      last_first_review_day: '2026-10-21',
      deleted,
    },
  };
}

before(async () => {
  child = spawn(process.execPath, ['--experimental-sqlite', 'server/server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), EXAMFLOW_DB: DB_PATH, MORPH_OVERRIDES: MORPH_OVERRIDES, OPENROUTER_API_KEY: '', AI_API_KEY: '' },
    stdio: 'ignore',
  });
  await waitHealth();
});

after(async () => {
  child?.kill();
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(DB_PATH + suffix);
    } catch {
      /* 忽略清理失败 */
    }
  }
  try {
    fs.unlinkSync(MORPH_OVERRIDES);
  } catch {
    /* 忽略清理失败 */
  }
});

test('健康检查', async () => {
  const { status, body } = await api('/health');
  assert.equal(status, 200);
  assert.equal(body.ok, true);
});

test('注册 → 登录 → me', async () => {
  const reg = await api('/auth/register', { method: 'POST', body: { username: USERNAME, password: PASSWORD } });
  assert.equal(reg.status, 201);
  assert.ok(reg.body.token);
  assert.equal(reg.body.username, USERNAME);

  const login = await api('/auth/login', { method: 'POST', body: { username: USERNAME, password: PASSWORD } });
  assert.equal(login.status, 200);
  token = login.body.token;

  const me = await api('/me', { token });
  assert.equal(me.status, 200);
  assert.equal(me.body.username, USERNAME);
});

test('重复注册 409 / 错误密码 401 / 弱口令 400', async () => {
  assert.equal((await api('/auth/register', { method: 'POST', body: { username: USERNAME, password: PASSWORD } })).status, 409);
  assert.equal((await api('/auth/login', { method: 'POST', body: { username: USERNAME, password: 'wrong-password' } })).status, 401);
  assert.equal((await api('/auth/register', { method: 'POST', body: { username: 'ab', password: 'short' } })).status, 400);
});

test('同步接口必须带令牌', async () => {
  assert.equal((await api('/sync')).status, 401);
  assert.equal((await api('/sync', { method: 'POST', body: { changes: {} } })).status, 401);
});

test('push 后 pull 能取回，且 LWW 忽略更旧版本', async () => {
  const now = Date.now();
  const push = await api('/sync', {
    method: 'POST',
    token,
    body: { changes: { cards: [cardChange(now, 1)], settings: [{ op: 'upsert', v: now, data: { exam: 'IELTS', exam_date: '2026-12-20', day_start_hour: 4, max_new_per_day: 50, max_review_per_day: 300, exclude_basic_words: 1, accent: 'uk', auto_play_audio: 0, data_pack_version: '1.1.0', last_backup_at: null, schema_version: 2 } }] } },
  });
  assert.equal(push.status, 200);
  assert.ok(push.body.cursor > 0);

  const pull = await api('/sync?cursor=0', { token });
  assert.equal(pull.status, 200);
  assert.equal(pull.body.changes.cards.length, 1);
  assert.equal(pull.body.changes.settings.length, 1);

  await api('/sync', { method: 'POST', token, body: { changes: { cards: [cardChange(now - 5000, 99)] } } });
  const after = await api('/sync?cursor=0', { token });
  assert.equal(JSON.parse(after.body.changes.cards[0].fsrs).reps, 1);
});

test('墓碑删除后 pull 可感知，增量拉取为空', async () => {
  const del = await api('/sync', {
    method: 'POST',
    token,
    body: { changes: { cards: [{ op: 'delete', v: Date.now(), data: { id: 'IELTS:s_1' } }] } },
  });
  assert.equal(del.status, 200);

  const all = await api('/sync?cursor=0', { token });
  assert.equal(all.body.changes.cards[0].deleted, true);

  const inc = await api(`/sync?cursor=${all.body.cursor}`, { token });
  const total = Object.values(inc.body.changes).reduce((n, list) => n + list.length, 0);
  assert.equal(total, 0);
});

test('数据包接口返回已发布的 IELTS 清单', async () => {
  const list = await api('/packs');
  assert.equal(list.status, 200);
  const ids = list.body.packs.map((p) => p.pack_id);
  assert.ok(ids.includes('IELTS'));

  const manifest = await api('/packs/IELTS');
  assert.equal(manifest.status, 200);
  assert.equal(manifest.body.exam, 'IELTS');
  assert.ok(manifest.body.wordCount > 0);
});

test('静态资源缓存策略：/packs/ 不缓存，其它资源保持长缓存', async () => {
  // 数据包文件名不带版本号（chunk-N.json），一旦被缓存就会与新一代 manifest 串代：
  // sha256 是上一代的、校验反而通过，加载期才炸 PackFormatError。服务端必须禁止留副本。
  for (const file of ['manifest.json', 'chunk-0.json']) {
    const res = await fetch(`${ORIGIN}/packs/IELTS/${file}`);
    assert.equal(res.status, 200, file);
    assert.match(res.headers.get('cache-control') ?? '', /no-store/, `${file} 必须 no-store`);
  }

  // 非数据包资源的策略不得被这次改动波及
  const icon = await fetch(`${ORIGIN}/favicon.svg`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('cache-control') ?? '', /max-age=3600/);
});

test('问 AI 核对：未配置 Key 时免登录也返回 503（不会 401）', async () => {
  const res = await api('/morph/ask', { method: 'POST', token, body: { word: 'corporate' } });
  assert.equal(res.status, 503);
  assert.equal(res.body.error.code, 'ai_not_configured');
});

test('问 AI 核对：误拆黑名单词直接 422 拒绝', async () => {
  const res = await api('/morph/ask', { method: 'POST', body: { word: 'dice' } });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'morph_blocked');
});

test('词源覆盖层接口返回空表', async () => {
  const res = await api('/morph/overrides');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.overrides, {});
});

test('AI 核对日志接口返回数组（含 503/422 的失败记录）', async () => {
  const res = await api('/morph/log');
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.log));
  assert.ok(res.body.log.length >= 2);
  const codes = res.body.log.map((r) => r.errorCode);
  assert.ok(codes.includes('ai_not_configured'));
  assert.ok(codes.includes('morph_blocked'));
});

