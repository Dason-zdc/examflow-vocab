import { useEffect, useState } from 'react';
import { fullDictionary, type DictEntry, type FullDictionary } from '../content/dict';

export type DictLookupState =
  | { status: 'idle'; entry: null }
  | { status: 'loading'; entry: null }
  | { status: 'done'; entry: DictEntry | null };

/**
 * 弹窗内的异步查词。数据包已经命中时传 enabled=false，不发多余请求。
 * 词典层失败（离线且无缓存）按「查不到」处理，不阻塞弹窗其它内容。
 */
export function useDictEntry(surface: string | null, enabled: boolean, dict: FullDictionary = fullDictionary): DictLookupState {
  const [state, setState] = useState<DictLookupState>({ status: 'idle', entry: null });

  useEffect(() => {
    if (!surface || !enabled) {
      setState({ status: 'idle', entry: null });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', entry: null });
    dict
      .lookup(surface)
      .then((entry) => {
        if (!cancelled) setState({ status: 'done', entry });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'done', entry: null });
      });
    return () => {
      cancelled = true;
    };
  }, [surface, enabled, dict]);

  return state;
}
