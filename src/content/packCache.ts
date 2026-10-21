import type { ExamCode } from '../domain/types';
import type { ExamFlowDB, PackChunkRow } from '../storage/db';

/**
 * 数据包分块缓存（PWA 离线兜底）。
 * key = `${exam}:${version}:${n}`，版本升级后旧版本分块整体失效。
 * 缓存的是「已通过 sha256 与形状校验的 payload」，读缓存不再重复校验。
 */

export function chunkKey(exam: string, version: string, n: number): string {
  return `${exam}:${version}:${n}`;
}

export async function getCachedChunk(
  db: ExamFlowDB,
  exam: ExamCode,
  version: string,
  n: number,
): Promise<PackChunkRow | undefined> {
  return db.packChunks.get(chunkKey(exam, version, n));
}

export async function putCachedChunk(
  db: ExamFlowDB,
  input: { exam: ExamCode; version: string; n: number; payload: unknown },
): Promise<void> {
  const row: PackChunkRow = {
    key: chunkKey(input.exam, input.version, input.n),
    exam: input.exam,
    version: input.version,
    n: input.n,
    payload: input.payload,
    cachedAt: Date.now(),
  };
  await db.packChunks.put(row);
}

/** 版本切换后清掉其它版本/其它考试的残留分块，避免 IndexedDB 无限增长 */
export async function invalidateStaleChunks(
  db: ExamFlowDB,
  keep: { exam: ExamCode; version: string },
): Promise<number> {
  const stale = await db.packChunks
    .where('cachedAt')
    .aboveOrEqual(0)
    .filter((row) => row.exam !== keep.exam || row.version !== keep.version)
    .toArray();
  if (stale.length === 0) return 0;
  await db.packChunks.bulkDelete(stale.map((r) => r.key));
  return stale.length;
}
