import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Runs an async loader with abort + retry. `deps` re-run the loader.
 * Returns { data, error, loading, reload }.
 */
export function useAsync(loader, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, error: null, loading: immediate });
  const ctrlRef = useRef(null);

  const run = useCallback(async () => {
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await loader(ctrl.signal);
      if (!ctrl.signal.aborted) setState({ data, error: null, loading: false });
    } catch (error) {
      if (error?.name === 'AbortError' || ctrl.signal.aborted) return;
      setState((s) => ({ ...s, error, loading: false }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) run();
    return () => ctrlRef.current?.abort();
  }, [run, immediate]);

  return { ...state, reload: run };
}
