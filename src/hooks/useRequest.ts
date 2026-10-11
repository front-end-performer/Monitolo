// useRequest — loading / error / data state for one async request.
//
// Every screen that fetches data needs the same three states:
//   loading  → show a spinner or "Refreshing…"
//   error    → show what went wrong, with a way to try again
//   data     → show the result (and KEEP showing old data while refreshing)
import { useCallback, useRef, useState } from 'react';
import type { RefreshTrigger } from '../../shared/types.ts';

interface RequestState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * @param fetcher must be stable (a module-level function like `getSystemInfo`),
 *                otherwise `reload` changes on every render.
 */
export function useRequest<T>(fetcher: (trigger: RefreshTrigger) => Promise<T>) {
  const [state, setState] = useState<RequestState<T>>({ data: null, error: null, loading: false });

  // Clicking "Refresh" twice starts two requests. If the first one answers
  // last, its older data would overwrite the newer. Each request gets a
  // number; only the latest one is allowed to update the state.
  const latestRequest = useRef(0);

  // Never rejects: failures end up in `state.error`. Callers can simply await it.
  const reload = useCallback(
    async (trigger: RefreshTrigger = 'manual') => {
      const requestId = ++latestRequest.current;
      // Auto-refresh updates quietly: no "Refreshing…" flicker every few seconds.
      if (trigger === 'manual') setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await fetcher(trigger);
        if (requestId === latestRequest.current) setState({ data, error: null, loading: false });
      } catch (err) {
        if (requestId === latestRequest.current) {
          const error = err instanceof Error ? err.message : String(err);
          setState((s) => ({ ...s, error, loading: false })); // keep the last good data
        }
      }
    },
    [fetcher],
  );

  return { ...state, reload };
}
