// IPC CHANNEL NAMES — one place, used by both electron/main and electron/preload.
//
// Think of channels as the "routes" of the desktop API. Keeping them in one
// constant means a typo is a compile error instead of a silent no-op
// (IPC on an unknown channel just never gets an answer).
//
// Naming convention: "<area>:<action>".

export const IpcChannels = {
  // Renderer → main, request/response (ipcRenderer.invoke ↔ ipcMain.handle)
  getSystemInfo: 'system:get-info',
  getProcesses: 'processes:list',
  getBackendStatus: 'backend:get-status',
  retryBackend: 'backend:retry',
  getActivity: 'activity:list',

  // Main → renderer, push events (webContents.send ↔ ipcRenderer.on)
  backendStatusChanged: 'backend:status-changed',
  activityAdded: 'activity:added',
} as const;
