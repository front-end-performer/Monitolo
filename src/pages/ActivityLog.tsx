// ACTIVITY LOG — what happened since the app started, newest first.
// The log itself lives in the main process (electron/activity-log.ts);
// this page shows a live copy of it.
import { useEffect, useState } from 'react';
import type { ActivityEntry } from '../../shared/types.ts';
import { getActivity, onActivity } from '../services/system-api.ts';
import { formatTime } from '../utils/format.ts';

export function ActivityLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);

  useEffect(() => {
    let active = true;
    // Same pattern as useBackendStatus: subscribe first, then load the history.
    const unsubscribe = onActivity((entry) => setEntries((prev) => [...prev, entry]));

    getActivity()
      .then((history) => {
        if (!active) return;
        // Entries pushed while the history was loading may also be in it.
        // Merge by id so nothing shows twice.
        setEntries((pushed) => {
          const known = new Set(history.map((e) => e.id));
          return [...history, ...pushed.filter((e) => !known.has(e.id))];
        });
      })
      .catch((err: unknown) => console.error('Could not load the activity log', err));

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <>
      <header className="page-header">
        <h1>Activity Log</h1>
      </header>
      <section className="card">
        {entries.length === 0 ? (
          <p className="muted">Nothing yet.</p>
        ) : (
          <ol className="log">
            {[...entries].reverse().map((entry) => (
              <li key={entry.id} className={`log-entry log-${entry.level}`}>
                <time dateTime={entry.time}>{formatTime(entry.time)}</time>
                <span>{entry.message}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
