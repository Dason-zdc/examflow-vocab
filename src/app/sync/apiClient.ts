export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

const BASE = '/api/v1';

export interface ApiOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
}

/**
 * 统一 API 客户端：同源 `${BASE}`（开发态由 Vite 代理到 8787，生产由后端同进程托管）。
 * 网络错误收敛成 ApiError(0)，HTTP 错误带上后端 error.code / message。
 */
export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(BASE + path, {
      method: options.method ?? 'GET',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (err) {
    throw new ApiError(0, 'network', err instanceof Error ? err.message : '网络不可用');
  }

  const json = (await response.json().catch(() => null)) as
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      json?.error?.code ?? 'http_error',
      json?.error?.message ?? `请求失败（${response.status}）`,
    );
  }
  return json as T;
}
