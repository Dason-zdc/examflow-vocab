import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { PORT, staticDir, packsDir } from './config.js';
import { db } from './db.js';
import { ApiError, authenticate, getPack, listPacks, login, me, register, syncPull, syncPush } from './routes.js';
import { morphAskHandler, morphLogHandler, morphOverridesHandler } from './morph-ai.js';

const MAX_BODY = 8 * 1024 * 1024; // 8MB：首轮整库推送 + 数据包元数据

// ---------- 启动期播种：把已发布数据包的元数据写入 packs 表 ----------
function seedPacksIntoDb() {
  const dir = packsDir();
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue;
    const manifestPath = path.join(dir, e.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      db.prepare(`
        INSERT INTO packs(pack_id, version, title, word_count, sense_count, created_at)
        VALUES (?, ?, ?, ?, 0, ?)
        ON CONFLICT(pack_id) DO UPDATE SET version=excluded.version, word_count=excluded.word_count;
      `).run(e.name, String(manifest.version ?? ''), e.name, Number(manifest.wordCount ?? 0), Date.now());
    } catch {
      /* 忽略无法解析的清单 */
    }
  }
}

// ---------- 路由表 ----------
const ROUTES = [
  { method: 'POST', re: /^\/api\/v1\/auth\/register$/, handler: (r, b) => register(b), auth: false },
  { method: 'POST', re: /^\/api\/v1\/auth\/login$/, handler: (r, b) => login(b), auth: false },
  { method: 'GET', re: /^\/api\/v1\/me$/, handler: (r, b, c) => me(c.userId), auth: true },
  { method: 'GET', re: /^\/api\/v1\/health$/, handler: () => ({ status: 200, body: { ok: true, time: Date.now() } }), auth: false },
  { method: 'GET', re: /^\/api\/v1\/packs$/, handler: () => listPacks(), auth: false },
  { method: 'GET', re: /^\/api\/v1\/packs\/([A-Za-z0-9_-]+)$/, handler: (r, b, c, m) => getPack(m[1]), auth: false },
  { method: 'POST', re: /^\/api\/v1\/sync$/, handler: (r, b, c) => syncPush(c.userId, b), auth: true },
  { method: 'GET', re: /^\/api\/v1\/sync$/, handler: (r, b, c) => syncPull(c.userId, c.query.cursor), auth: true },
  // 问 AI 核对：免登录（自建单人实例 + 全局 IP 限流兜底）；模型 Key 在服务端，泄露面 = 部署者自己的额度
  { method: 'POST', re: /^\/api\/v1\/morph\/ask$/, handler: (r, b) => morphAskHandler(b), auth: false },
  { method: 'GET', re: /^\/api\/v1\/morph\/overrides$/, handler: () => morphOverridesHandler(), auth: false },
  { method: 'GET', re: /^\/api\/v1\/morph\/log$/, handler: (r, b, c) => morphLogHandler(c.query, c.headers), auth: false },
];

// ---------- 静态资源 ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

/** 数据包文件（/packs/<考试>/…）：chunk-N.json 不带版本号，是版本串代的源头 */
function isPackFile(filePath) {
  return filePath.split(path.sep).includes('packs');
}

/**
 * 缓存策略：
 *  - 数据包：文件名不带版本号，可缓存的旧 chunk 会与新一代 manifest 串代
 *    （sha256 也是上一代的，校验反而通过），加载期直接撞 PackFormatError，故 no-store；
 *  - HTML：应用外壳，需回源校验；
 *  - 其余静态资源（带哈希或不会变）：保持长缓存。
 */
function cacheControlFor(filePath, ext) {
  if (isPackFile(filePath)) return 'no-store';
  if (ext === '.html') return 'no-cache';
  return 'public, max-age=3600';
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const type = MIME[ext] ?? 'application/octet-stream';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': cacheControlFor(filePath, ext),
    });
    res.end(data);
  });
}

function sendStatic(res, urlPath) {
  const root = staticDir();
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(root, rel));
  // 目录穿越防护：必须落在静态根内（比较时带上分隔符，避免 dist-evil 这类前缀误判）
  if (filePath !== root && !filePath.startsWith(root + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  fs.stat(filePath, (err, stat) => {
    if (!err && stat.isFile()) {
      serveFile(res, filePath);
      return;
    }
    // SPA 回退：非文件且非 /api 的请求交给 index.html
    if (urlPath.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: '资源不存在' } }));
      return;
    }
    const fallback = path.join(root, 'index.html');
    if (fs.existsSync(fallback)) serveFile(res, fallback);
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('未构建前端（请先 npm run build）');
    }
  });
}

// ---------- 限流（单进程内存版，够用开发/小团队） ----------
const RATE = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const rec = RATE.get(ip);
  if (!rec || now - rec.ts > 60_000) {
    RATE.set(ip, { ts: now, count: 1 });
    return false;
  }
  rec.count += 1;
  return rec.count > 200;
}

// ---------- 入口 ----------
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'payload_too_large', '请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8');
      if (!text) return resolve(undefined);
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new ApiError(400, 'bad_json', '请求体不是合法 JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const pathname = url.pathname;

  if (rateLimited(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { code: 'rate_limited', message: '请求过于频繁，请稍后再试' } }));
    return;
  }

  try {
    if (!pathname.startsWith('/api/')) {
      sendStatic(res, pathname);
      return;
    }

    const route = ROUTES.find((r) => r.method === req.method && r.re.test(pathname));
    if (!route) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: 'not_found', message: '接口不存在' } }));
      return;
    }

    const ctx = { userId: null, query: Object.fromEntries(url.searchParams), headers: req.headers };
    if (route.auth) ctx.userId = authenticate(req.headers);

    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await readBody(req);
    const match = route.re.exec(pathname);
    const result = await route.handler(req, body, ctx, match);

    if (!res.headersSent) {
      if (typeof result.html === 'string') {
        res.writeHead(result.status ?? 200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(result.html);
        return;
      }
      res.writeHead(result.status ?? 200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(result.body ?? { ok: true }));
    }
  } catch (err) {
    if (res.headersSent) return;
    if (err instanceof ApiError) {
      res.writeHead(err.status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: { code: err.code, message: err.message } }));
      return;
    }
    console.error('未处理异常:', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: { code: 'internal', message: '服务器内部错误' } }));
  }
});

seedPacksIntoDb();
server.listen(PORT, () => {
  console.log(`ExamFlow 后端已启动：http://localhost:${PORT}`);
  console.log(`  前端静态目录：${staticDir()}`);
  console.log(`  数据包目录：${packsDir()}`);
});
