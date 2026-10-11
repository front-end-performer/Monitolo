// DASHBOARD — "System Overview": CPU, memory, uptime, machine info.
//
// Data path for one click on "Refresh":
//   button → useRequest.reload → getSystemInfo (services/system-api.ts)
//   → window.api (preload) → IPC → main (electron/ipc.ts)
//   → HTTP GET /api/system (backend) → node:os → back up the same chain.
import { useCallback, useEffect, useState } from 'react';
import { AutoRefreshToggle } from '../components/AutoRefreshToggle.tsx';
import { MetricCard } from '../components/MetricCard.tsx';
import { useAutoRefresh } from '../hooks/useAutoRefresh.ts';
import { useRequest } from '../hooks/useRequest.ts';
import { getSystemInfo } from '../services/system-api.ts';
import { formatBytes, formatPercent, formatPlatform, formatUptime } from '../utils/format.ts';

const AUTO_REFRESH_SECONDS = 3;

export function Dashboard({ backendRunning }: { backendRunning: boolean }) {
  const { data: info, error, loading, reload } = useRequest(getSystemInfo);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Load when the page opens, and again whenever the backend (re)connects.
  useEffect(() => {
    if (backendRunning) void reload('auto');
  }, [backendRunning, reload]);

  // useCallback keeps this function the same between renders; otherwise the
  // auto-refresh effect would restart its timer on every render.
  const refreshQuietly = useCallback(() => reload('auto'), [reload]);
  useAutoRefresh(refreshQuietly, AUTO_REFRESH_SECONDS * 1000, autoRefresh && backendRunning);

  const usedMemory = info ? info.totalMemory - info.freeMemory : 0;
  const memoryPercent = info ? (usedMemory / info.totalMemory) * 100 : 0;

  return (
    <>
      <header className="page-header">
        <h1>System Overview</h1>
        <div className="header-actions">
          <AutoRefreshToggle checked={autoRefresh} onChange={setAutoRefresh} seconds={AUTO_REFRESH_SECONDS} />
          {/* Arrow function: `onClick={reload}` would pass the click event as the trigger. */}
          <button
            className="button"
            onClick={() => reload('manual')}
            disabled={loading || !backendRunning}
            aria-busy={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh System Information'}
          </button>
        </div>
      </header>

      {error && <p className="error">Could not load system information: {error}</p>}
      {!info && !error && <p className="muted">{backendRunning ? 'Loading…' : 'Waiting for the backend…'}</p>}

      {info && (
        <>
          <div className="metrics">
            <MetricCard label="CPU Usage" value={formatPercent(info.cpuUsage)} percent={info.cpuUsage} />
            <MetricCard
              label="Memory Usage"
              value={formatPercent(memoryPercent)}
              percent={memoryPercent}
              detail={`${formatBytes(usedMemory)} of ${formatBytes(info.totalMemory)}`}
            />
            <MetricCard label="Uptime" value={formatUptime(info.uptime)} detail="since the system booted" />
          </div>

          <section className="card">
            <h2>System Information</h2>
            <dl className="info-list">
              <dt>Platform</dt>
              <dd>{formatPlatform(info.platform)}</dd>
              <dt>Architecture</dt>
              <dd>{info.architecture}</dd>
              <dt>Processor</dt>
              <dd>{info.cpuModel}</dd>
              <dt>Cores</dt>
              <dd>{info.cpuCores}</dd>
              <dt>Total memory</dt>
              <dd>{formatBytes(info.totalMemory)}</dd>
            </dl>
          </section>
        </>
      )}
    </>
  );
}
