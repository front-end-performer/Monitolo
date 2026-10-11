// PRELOAD — the bridge between the web page and the Electron main process.
//
// It runs in the renderer process before the page loads, in a separate
// "isolated world": the page can't see its variables or `ipcRenderer`.
// `contextBridge.exposeInMainWorld` copies ONE object into the page, as
// `window.api`. That object is the complete list of what the UI may do.
//
// Rules:
//   • expose named functions only, never `ipcRenderer` itself (that would let
//     the page send ANY message to ANY channel);
//   • strip the Electron `event` object before calling page callbacks;
//   • every subscription returns an unsubscribe function.
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '../shared/ipc-channels.ts';
import type { ActivityEntry, BackendStatus, DesktopApi } from '../shared/types.ts';

function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// Typed as `DesktopApi`, so this object and the UI's expectations can't drift.
const api: DesktopApi = {
  getSystemInfo: (trigger) => ipcRenderer.invoke(IpcChannels.getSystemInfo, trigger),
  getProcesses: (trigger) => ipcRenderer.invoke(IpcChannels.getProcesses, trigger),
  getBackendStatus: () => ipcRenderer.invoke(IpcChannels.getBackendStatus),
  retryBackend: () => ipcRenderer.invoke(IpcChannels.retryBackend),
  getActivity: () => ipcRenderer.invoke(IpcChannels.getActivity),
  onBackendStatus: (callback) => subscribe<BackendStatus>(IpcChannels.backendStatusChanged, callback),
  onActivity: (callback) => subscribe<ActivityEntry>(IpcChannels.activityAdded, callback),
};

contextBridge.exposeInMainWorld('api', api);
