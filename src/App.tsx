// APP SHELL — sidebar + the current page, and the backend banner on top.
//
// Navigation is plain state, no router: three pages don't need URLs, and a
// desktop window has no address bar anyway.
import { useState } from 'react';
import { BackendBanner } from './components/BackendBanner.tsx';
import { Sidebar, type Page } from './components/Sidebar.tsx';
import { useBackendStatus } from './hooks/useBackendStatus.ts';
import { ActivityLog } from './pages/ActivityLog.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Processes } from './pages/Processes.tsx';

export function App() {
  const [page, setPage] = useState<Page>('dashboard');
  const backendStatus = useBackendStatus();
  // Pages load their data when this turns true, and again after a reconnect.
  const backendRunning = backendStatus?.state === 'running';

  return (
    <div className="layout">
      <Sidebar current={page} onNavigate={setPage} backendState={backendStatus?.state} />
      <main className="content">
        <BackendBanner status={backendStatus} />
        {page === 'dashboard' && <Dashboard backendRunning={backendRunning} />}
        {page === 'processes' && <Processes backendRunning={backendRunning} />}
        {page === 'activity' && <ActivityLog />}
      </main>
    </div>
  );
}
