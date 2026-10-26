import { useEffect, useState } from 'react';
import { rootFamilies, type RootFamily } from '../content/rootFamilies';

/** 按词根加载「织网」数据：组件卸载后不再 setState，失败按空家族处理。 */
export function useRootFamily(root: string | null): { loading: boolean; family: RootFamily | null } {
  const [state, setState] = useState<{ loading: boolean; family: RootFamily | null }>({ loading: false, family: null });

  useEffect(() => {
    if (!root) {
      setState({ loading: false, family: null });
      return;
    }
    let alive = true;
    setState({ loading: true, family: null });
    void rootFamilies.family(root).then((family) => {
      if (alive) setState({ loading: false, family });
    });
    return () => {
      alive = false;
    };
  }, [root]);

  return state;
}
