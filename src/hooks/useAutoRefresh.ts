// useAutoRefresh — call `refresh` every `intervalMs` while `enabled` is true.
//
// Why a chain of setTimeouts instead of setInterval?
// setInterval fires on schedule even if the previous request hasn't finished.
// Listing processes can take seconds; with setInterval, slow requests would
// stack up. Here the next timer starts only AFTER the current refresh is done,
// so there is never more than one request in flight.
import { useEffect } from 'react';

export function useAutoRefresh(refresh: () => Promise<void>, intervalMs: number, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    let timer: number | undefined;
    let cancelled = false;

    async function tick() {
      // Window hidden in the tray: nobody is looking, so skip the work.
      // (Electron marks the page hidden when the window is hidden.)
      if (!document.hidden) await refresh();
      if (!cancelled) timer = window.setTimeout(tick, intervalMs);
    }

    timer = window.setTimeout(tick, intervalMs);

    // Runs when `enabled` turns false, the interval changes, or the page
    // unmounts: stop the chain so no timer outlives the component.
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refresh, intervalMs, enabled]);
}
