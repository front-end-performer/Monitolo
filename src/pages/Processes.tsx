// PROCESS MONITOR — the heaviest running processes, with a name filter.
import { useCallback, useEffect, useState } from 'react';
import { AutoRefreshToggle } from '../components/AutoRefreshToggle.tsx';
import { ProcessTable } from '../components/ProcessTable.tsx';
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts';
import { useRequest } from '../hooks/useRequest.ts';
import { getProcesses } from '../services/system-api.ts';

// Slower than the dashboard: listing processes runs an OS command each time.
const AUTO_REFRESH_SECONDS = 5;

export function Processes({ backendRunning }: { backendRunning: boolean }) {
  const { data, error, loading, reload } = useRequest(getProcesses);
  const [filter, setFilter] = useState('');
  // Off by default: rows re-sort on every update, which is hard to read.
  const [autoRefresh, setAutoRefresh] = useState(false);

  useEffect(() => {
    if (backendRunning) void reload('auto');
  }, [backendRunning, reload]);

  const refreshQuietly = useCallback(() => reload('auto'), [reload]);
  useAutoRefresh(refreshQuietly, AUTO_REFRESH_SECONDS * 1000, autoRefresh && backendRunning);

  // Filtering happens in the UI: the list is already here, no new request needed.
  const query = filter.trim().toLowerCase();
  const visible = data?.processes.filter((p) => p.name.toLowerCase().includes(query)) ?? [];

  return (
    <>
      <header className="page-header">
        <h1>Processes</h1>
        <div className="header-actions">
          <AutoRefreshToggle checked={autoRefresh} onChange={setAutoRefresh} seconds={AUTO_REFRESH_SECONDS} />
          <button
            className="button"
            onClick={() => reload('manual')}
            disabled={loading || !backendRunning}
            aria-busy={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </header>

      {error && <p className="error">Could not load processes: {error}</p>}
      {!data && !error && <p className="muted">{backendRunning ? 'Loading…' : 'Waiting for the backend…'}</p>}

      {data && (
        <section className="card">
          <div className="toolbar">
            <input
              className="input"
              type="search"
              placeholder="Filter by name…"
              aria-label="Filter processes by name"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <span className="muted">
              Top {data.processes.length} of {data.total} processes, by CPU
            </span>
          </div>
          <ProcessTable processes={visible} />
        </section>
      )}
    </>
  );
}
