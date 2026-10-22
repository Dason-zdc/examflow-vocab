import type { ExamCode } from '../domain/types';
import type { ExamFlowDB } from '../storage/db';
import { loadPack, type LoadPackOptions, type LoadedPack } from './packLoader';
import { PackFormatError } from './packVerifier';

export type { LoadedPack };

/**
 * 数据包自愈（PRD §4 数据完整性 + §9 可恢复性）：
 *   加载期撞上 PackFormatError / sha256 不匹配时，本地缓存几乎必然是「上一代残留」，
 *   而 IndexedDB 里的 chunk 读出来不再重复校验（putCachedChunk 只存已校验 payload），
 *   且 invalidateStaleChunks 按 exam+version 保留——版本恰好相同的中毒行删不掉。
 *   于是用户会永久卡在同一个报错上。这里的策略是：清理本地缓存 + 只重载一次，
 *   让下一次加载重新走一遍网络校验；再失败就把真实错误交给 UI，绝不无限刷新。
 */

/** 自愈已排程：UI 用它给出「正在修复」提示，随后页面会重载一次 */
export class PackRecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PackRecoveryError';
  }
}

/** 一次性标记的存储抽象（生产用 sessionStorage，测试用内存实现） */
export interface PackRecoveryFlags {
  has: (exam: string) => boolean;
  set: (exam: string) => void;
  remove: (exam: string) => void;
}

const FLAG_PREFIX = 'examflow:pack-recovery:';

/** 进程内兜底：非浏览器环境（测试/SSR）没有 sessionStorage */
export function createMemoryFlagStore(): PackRecoveryFlags {
  const marks = new Set<string>();
  return {
    has: (exam) => marks.has(exam),
    set: (exam) => void marks.add(exam),
    remove: (exam) => void marks.delete(exam),
  };
}

const MEMORY_FLAGS: PackRecoveryFlags = createMemoryFlagStore();

export function sessionFlagStore(): PackRecoveryFlags {
  if (typeof sessionStorage === 'undefined') return MEMORY_FLAGS;
  return {
    has: (exam) => sessionStorage.getItem(FLAG_PREFIX + exam) !== null,
    set: (exam) => sessionStorage.setItem(FLAG_PREFIX + exam, String(Date.now())),
    remove: (exam) => sessionStorage.removeItem(FLAG_PREFIX + exam),
  };
}

export interface PackPurgeReport {
  exam: string;
  /** 删除的 IndexedDB 分块行数（不限版本——同版本中毒行也要清掉） */
  dbRows: number;
  /** 被删除的 workbox Cache Storage 键 */
  caches: string[];
  /** 被注销的 Service Worker 数量 */
  serviceWorkers: number;
}

/** 浏览器运行时缓存入口；缺省从全局读取，便于测试注入 */
export interface PackRuntimeEnv {
  caches?: CacheStorage;
  serviceWorker?: ServiceWorkerContainer;
}

export function currentRuntimeEnv(): PackRuntimeEnv {
  const env: PackRuntimeEnv = {};
  if (typeof caches !== 'undefined') env.caches = caches;
  const sw = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
  if (sw) env.serviceWorker = sw;
  return env;
}

async function purgeWorkboxCaches(cacheStorage: CacheStorage | undefined): Promise<string[]> {
  if (!cacheStorage) return [];
  const keys = await cacheStorage.keys();
  const targets = keys.filter((k) => k.startsWith('workbox-'));
  await Promise.all(targets.map((k) => cacheStorage.delete(k)));
  return targets;
}

async function unregisterServiceWorkers(container: ServiceWorkerContainer | undefined): Promise<number> {
  if (!container) return 0;
  const registrations = await container.getRegistrations();
  await Promise.all(registrations.map((r) => r.unregister()));
  return registrations.length;
}

/** 清理该考试的所有本地数据包痕迹：IndexedDB 分块 + workbox 缓存 + 旧 SW */
export async function purgePackRuntime(
  db: ExamFlowDB,
  exam: ExamCode,
  env: PackRuntimeEnv = currentRuntimeEnv(),
): Promise<PackPurgeReport> {
  const dbRows = await db.packChunks.where('exam').equals(exam).delete();
  const caches = await purgeWorkboxCaches(env.caches);
  // 只有确实清掉了 SW 持有的缓存才注销它：否则保留 SW 继续提供正常的离线能力
  const serviceWorkers = caches.length > 0 ? await unregisterServiceWorkers(env.serviceWorker) : 0;
  return { exam, dbRows, caches, serviceWorkers };
}

export interface PackRecoveryHooks {
  purge: (db: ExamFlowDB, exam: ExamCode) => Promise<PackPurgeReport>;
  reload: () => void;
  flags: PackRecoveryFlags;
}

/** 先渲染一帧「正在修复」提示再重载，避免用户只看到白屏闪烁 */
const RELOAD_DELAY_MS = 400;

function defaultHooks(): PackRecoveryHooks {
  return {
    purge: purgePackRuntime,
    reload: () => {
      if (typeof window === 'undefined') return;
      window.setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
    },
    flags: sessionFlagStore(),
  };
}

/** 仅「缓存中毒」型错误才自愈；网络失败等原样上抛，交给离线兜底与 UI 提示 */
export function isRecoverablePackError(err: unknown): boolean {
  if (err instanceof PackFormatError) return true;
  if (!(err instanceof Error)) return false;
  return /数据包校验失败|sha256 不匹配/.test(err.message);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 带自愈的数据包加载：成功即解除一次性标记；可自愈的错误先清理 + 重载一次，
 * 之后仍失败则把原始错误抛给 UI（ExamFlowApp 的 packError 会渲染出来）。
 */
export async function loadPackWithRecovery(
  options: LoadPackOptions & { recovery?: Partial<PackRecoveryHooks> },
): Promise<LoadedPack> {
  const { exam, db, recovery } = options;
  const hooks: PackRecoveryHooks = { ...defaultHooks(), ...recovery };
  try {
    const pack = await loadPack(options);
    hooks.flags.remove(exam);
    return pack;
  } catch (err) {
    if (!isRecoverablePackError(err)) throw err;
    if (hooks.flags.has(exam)) throw err; // 已自愈过一次，不再刷新

    let report: PackPurgeReport;
    try {
      report = await hooks.purge(db, exam);
    } catch (purgeErr) {
      // 清理失败就不刷新（否则只会把用户拖进同样的报错循环），直接让用户看见原因
      throw new PackRecoveryError(`词书缓存异常（${messageOf(err)}），自动清理失败：${messageOf(purgeErr)}`);
    }
    hooks.flags.set(exam);
    hooks.reload();
    throw new PackRecoveryError(
      `词书缓存异常（${messageOf(err)}），已清理本地缓存并重新加载：` +
        `分块 ${report.dbRows} 条、缓存 ${report.caches.length} 个、Service Worker ${report.serviceWorkers} 个。`,
    );
  }
}
