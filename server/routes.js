import path from 'node:path';
import fs from 'node:fs';
import { db } from './db.js';
import { applyPull, applyPush } from './sync.js';
import {
  createUser,
  findUserByUsername,
  signToken,
  verifyPassword,
  validateCredentials,
  verifyToken,
} from './auth.js';
import { packsDir } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function authenticate(headers) {
  const header = headers['authorization'] || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) throw new ApiError(401, 'unauthorized', '缺少访问令牌');
  const payload = verifyToken(match[1].trim());
  if (!payload) throw new ApiError(401, 'unauthorized', '令牌无效或已过期');
  return payload.sub;
}

export function register(body) {
  const { username, password } = body ?? {};
  const err = validateCredentials(username, password);
  if (err) throw new ApiError(400, 'invalid_input', err);
  if (findUserByUsername(username)) throw new ApiError(409, 'conflict', '用户名已被占用');
  const userId = createUser(username, password);
  return { status: 201, body: { token: signToken(userId), userId, username } };
}

export function login(body) {
  const { username, password } = body ?? {};
  const err = validateCredentials(username, password);
  if (err) throw new ApiError(400, 'invalid_input', err);
  const user = findUserByUsername(username);
  if (!user || !verifyPassword(password, user.pass_salt, user.pass_hash)) {
    throw new ApiError(401, 'unauthorized', '用户名或密码错误');
  }
  return { status: 200, body: { token: signToken(user.id), userId: user.id, username: user.username } };
}

export function me(userId) {
  const row = db.prepare('SELECT username FROM users WHERE id = ?').get(userId);
  return { status: 200, body: { userId, username: row?.username ?? '' } };
}

export function syncPush(userId, body) {
  const { changes } = body ?? {};
  applyPush(userId, changes);
  const cursor = db.prepare('SELECT value FROM sync_seq_counter WHERE id = 1').get().value;
  return { status: 200, body: { ok: true, cursor } };
}

export function syncPull(userId, cursor) {
  const c = Number.isFinite(Number(cursor)) ? Number(cursor) : 0;
  const changes = applyPull(userId, c);
  const cur = db.prepare('SELECT value FROM sync_seq_counter WHERE id = 1').get().value;
  return { status: 200, body: { ok: true, cursor: cur, changes } };
}

export function listPacks() {
  const rows = db
    .prepare('SELECT pack_id, version, title, word_count, sense_count FROM packs')
    .all();
  return { status: 200, body: { packs: rows } };
}

export function getPack(id) {
  const dir = packsDir();
  const meta = db.prepare('SELECT pack_id, version FROM packs WHERE pack_id = ?').get(id);
  if (!meta) throw new ApiError(404, 'not_found', '未发布该数据包');
  const file = path.join(dir, id, 'manifest.json');
  if (!fs.existsSync(file)) throw new ApiError(404, 'not_found', '数据包清单文件缺失');
  return { status: 200, body: JSON.parse(fs.readFileSync(file, 'utf8')) };
}
