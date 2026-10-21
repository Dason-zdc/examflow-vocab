import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

export const PORT = Number(process.env.PORT ?? 8787);
export const DB_PATH = process.env.EXAMFLOW_DB ?? path.join(ROOT, 'server', 'data', 'examflow.db');
export const SECRET = process.env.EXAMFLOW_SECRET ?? 'dev-only-insecure-secret-change-me';
export const PUBLIC_DIR = path.join(ROOT, 'public');
export const DIST_DIR = path.join(ROOT, 'dist');

/** 数据包目录：优先 dist（生产构建产物），回退 public（开发态）。 */
export function packsDir() {
  const inDist = path.join(DIST_DIR, 'packs');
  if (fs.existsSync(inDist)) return inDist;
  return path.join(PUBLIC_DIR, 'packs');
}

/** 静态资源根：优先 dist（含预缓存与 packs），回退 public。 */
export function staticDir() {
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) return DIST_DIR;
  return PUBLIC_DIR;
}
