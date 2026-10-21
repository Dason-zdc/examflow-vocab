import { useEffect, useState } from 'react';
import type { ExamCode } from '../domain/types';
import { EXAM_CODES } from '../domain/types';

/**
 * 可用词书探测：只有真的发布了数据包的考试才出现在切换器里，
 * 避免切过去才报「数据包缺失」。探测失败（离线/静态部署）时只保留当前考试。
 */
export function useAvailableExams(current: ExamCode): ExamCode[] {
  const [available, setAvailable] = useState<ExamCode[]>([current]);

  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;

    void Promise.all(
      EXAM_CODES.map(async (code) => {
        try {
          const res = await fetch(`${base}packs/${code}/manifest.json`);
          if (!res.ok) return null;
          // 静态托管的 SPA 回退会把缺失路径返回 index.html（200），必须校验内容
          const manifest = (await res.json().catch(() => null)) as { exam?: string } | null;
          return manifest?.exam === code ? code : null;
        } catch {
          return null;
        }
      }),
    ).then((list) => {
      if (cancelled) return;
      const codes = list.filter((code): code is ExamCode => code !== null);
      setAvailable(codes.length > 0 ? codes : [current]);
    });

    return () => {
      cancelled = true;
    };
  }, [current]);

  return available.includes(current) ? available : [current, ...available];
}
