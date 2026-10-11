// useBackendStatus — the live backend state, pushed from the main process.
//
// Pattern for any state main owns: subscribe to changes FIRST, then ask for the
// current value. In the other order, a change between "ask" and "subscribe"
// would be missed.
import { useEffect, useState } from 'react';
import type { BackendStatus } from '../../shared/types.ts';
import { getBackendStatus, onBackendStatus } from '../services/system-api.ts';

export function useBackendStatus(): BackendStatus | null {
  const [status, setStatus] = useState<BackendStatus | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = onBackendStatus(setStatus);

    getBackendStatus()
      // If a push already arrived, it is newer than this answer: keep it.
      .then((current) => active && setStatus((prev) => prev ?? current))
      .catch((err: unknown) => console.error('Could not read backend status', err));

    // Cleanup runs on unmount (and on StrictMode's test unmount).
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}
