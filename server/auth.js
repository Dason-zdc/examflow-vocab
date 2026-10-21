import crypto from 'node:crypto';
import { db } from './db.js';
import { SECRET } from './config.js';

/**
 * 轻量认证：scrypt 口令哈希 + 自签名无状态 token（HMAC）。
 * 仅单设备/小团队使用，生产应换成更强的密钥管理与刷新令牌机制。
 */

const USER_RE = /^[a-zA-Z0-9_]{3,32}$/;

export function validateCredentials(username, password) {
  if (!USER_RE.test(username)) return '用户名需为 3-32 位字母、数字或下划线';
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) return '密码长度需为 8-128 位';
  return null;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return { salt: salt.toString('hex'), hash: derived.toString('hex') };
}

export function verifyPassword(password, saltHex, hashHex) {
  const derived = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, 'hex');
  return (
    derived.length === expected.length &&
    crypto.timingSafeEqual(derived, expected)
  );
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function hmac(body) {
  return crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
}

export function signToken(userId) {
  const payload = { sub: userId, iat: Date.now(), exp: Date.now() + 1000 * 60 * 60 * 24 * 30 };
  const body = base64url(JSON.stringify(payload));
  return `${body}.${hmac(body)}`;
}

export function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot < 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(body);
  if (expected.length !== sig.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (typeof payload.sub !== 'string' || typeof payload.exp !== 'number') return null;
  if (payload.exp < Date.now()) return null;
  return payload;
}

const getUserByUsername = db.prepare('SELECT * FROM users WHERE username = ?');
const insertUser = db.prepare(
  'INSERT INTO users(id, username, pass_hash, pass_salt, created_at) VALUES (?, ?, ?, ?, ?)',
);

export function findUserByUsername(username) {
  return getUserByUsername.get(username);
}

export function createUser(username, password) {
  const id = crypto.randomUUID();
  const { salt, hash } = hashPassword(password);
  insertUser.run(id, username, hash, salt, Date.now());
  return id;
}
