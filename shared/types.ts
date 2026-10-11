// SHARED TYPES — the contract between all layers.
//
// Who imports this file:
//   backend/   → shapes of the JSON it sends
//   electron/  → shapes it validates and forwards over IPC
//   src/       → shapes the React UI renders
//
// Only `type`/`interface` declarations live here. They disappear at build time,
// so importing them never drags Node or browser code into the wrong process.

// ---------------------------------------------------------------------------
// Backend HTTP payloads (Stage 2)
// ---------------------------------------------------------------------------

/** GET /api/health */
export interface HealthResponse {
  status: 'ok';
}

/** GET /api/system */
export interface SystemInfo {
  platform: string; // 'linux' | 'win32' | 'darwin' … (Node's `process.platform`)
  architecture: string; // 'x64' | 'arm64' …
  cpuModel: string;
  cpuCores: number;
  cpuUsage: number; // 0–100, measured over a short sample window
  totalMemory: number; // bytes
  freeMemory: number; // bytes
  uptime: number; // seconds since the OS booted
}

/** One row of GET /api/processes */
export interface ProcessInfo {
  pid: number;
  name: string;
  user: string;
  cpu: number; // % of one CPU core, can exceed 100 on multi-core machines
  memory: number; // % of total RAM
  memoryRss: number; // bytes actually held in RAM
}

/** GET /api/processes */
export interface ProcessList {
  total: number; // how many processes exist in total
  processes: ProcessInfo[]; // the heaviest ones, sorted by CPU
}

// ---------------------------------------------------------------------------
// Desktop-only state, owned by the Electron main process (Stage 3)
// ---------------------------------------------------------------------------

/**
 * Lifecycle of the backend child process, as tracked by `BackendManager`.
 *
 *   stopped ──start()──▶ starting ──healthy──▶ running
 *      ▲                    │                    │ crash / stops answering
 *      │                    ▼                    ▼
 *   stopping ◀──stop()── unavailable ◀──────────┘ (limited auto-restarts)
 */
export type BackendState = 'starting' | 'running' | 'unavailable' | 'stopping' | 'stopped';

export interface BackendStatus {
  state: BackendState;
  message: string; // human-readable explanation for the UI
}

export interface ActivityEntry {
  id: number;
  time: string; // ISO 8601 timestamp
  level: 'info' | 'warning' | 'error';
  message: string;
}

// ---------------------------------------------------------------------------
// The API the preload script exposes as `window.api`
// ---------------------------------------------------------------------------

/**
 * Why data is being fetched. A user clicking "Refresh" is worth an Activity
 * Log entry; the auto-refresh timer firing every few seconds is not.
 */
export type RefreshTrigger = 'manual' | 'auto';

/**
 * Everything the UI is allowed to ask the desktop side to do.
 * The renderer cannot do anything that is not listed here, which is the whole
 * point of the preload bridge.
 */
export interface DesktopApi {
  getSystemInfo(trigger: RefreshTrigger): Promise<SystemInfo>;
  getProcesses(trigger: RefreshTrigger): Promise<ProcessList>;
  getBackendStatus(): Promise<BackendStatus>;
  retryBackend(): Promise<void>;
  getActivity(): Promise<ActivityEntry[]>;
  // Subscriptions return an "unsubscribe" function, so React effects can
  // clean up after themselves and listeners never pile up.
  onBackendStatus(callback: (status: BackendStatus) => void): () => void;
  onActivity(callback: (entry: ActivityEntry) => void): () => void;
}
