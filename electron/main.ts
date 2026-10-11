// MAIN PROCESS ENTRY — the orchestrator. Read this file first.
//
// It wires everything together and owns the application lifecycle:
//
//   app starts ─▶ single-instance check ─▶ whenReady
//                                            ├─ register IPC handlers
//                                            ├─ create window + tray
//                                            └─ start the backend
//   window closed ─▶ hide to tray (app keeps running)
//   tray "Quit"   ─▶ before-quit ─▶ stop backend gracefully ─▶ exit
//
// Main must stay responsive: it handles every window's events. Heavy work
// (reading processes) happens in the backend process, never here.
import { app, BrowserWindow, Notification } from 'electron';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { IpcChannels } from '../shared/ipc-channels.ts';
import type { BackendStatus } from '../shared/types.ts';
import { ActivityLog } from './activity-log.ts';
import { createBackendClient } from './backend-client.ts';
import { BackendManager } from './backend-manager.ts';
import { registerIpcHandlers } from './ipc.ts';
import { createTray } from './tray.ts';
import { createMainWindow } from './window.ts';

const BACKEND_PORT = 4317;

// Only one copy of the app may run: a second one would fight over port 4317
// and add a second tray icon. A second launch just shows the first window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  bootstrap();
}

function bootstrap(): void {
  const iconPath = join(app.getAppPath(), 'resources/icon.png');

  // A fresh secret per launch. Only main and the backend it starts know it,
  // so other programs on this machine can't read data from the backend.
  const token = randomBytes(32).toString('hex');
  const client = createBackendClient({ port: BACKEND_PORT, token });

  let mainWindow: BrowserWindow | null = null;
  let tray: ReturnType<typeof createTray> | null = null; // long-lived reference keeps the Tray alive
  let isQuitting = false;
  let backendWasUp = false; // for notifications: only announce real up/down changes

  /** Main → renderer push to every open window. */
  function broadcast(channel: string, payload: unknown): void {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send(channel, payload);
  }

  const activity = new ActivityLog((entry) => broadcast(IpcChannels.activityAdded, entry));

  const backend = new BackendManager({
    entry: join(import.meta.dirname, 'backend.js'), // built next to this file
    env: { MONITOR_PORT: String(BACKEND_PORT), MONITOR_TOKEN: token },
    client,
    onStatus: handleBackendStatus,
  });

  /** Every backend state change flows through here and fans out to all layers. */
  function handleBackendStatus(status: BackendStatus, previous: BackendStatus): void {
    broadcast(IpcChannels.backendStatusChanged, status); // UI banner
    tray?.setStatus(status); // tray menu
    if (status.state !== previous.state) {
      activity.add(status.message, status.state === 'unavailable' ? 'warning' : 'info');
    }

    // Stage 3B, notifications: tell the user when the backend comes up or goes
    // down. Not on every retry, and not while the app itself is quitting.
    if (status.state === 'running' && !backendWasUp) {
      backendWasUp = true;
      notify('Backend started', 'System monitoring is active.');
    } else if ((status.state === 'stopped' || status.state === 'unavailable') && backendWasUp) {
      backendWasUp = false;
      if (!isQuitting) notify('Backend stopped', status.message);
    }
  }

  function notify(title: string, body: string): void {
    if (Notification.isSupported()) new Notification({ title, body, icon: iconPath }).show();
  }

  function showWindow(): void {
    if (!mainWindow || mainWindow.isDestroyed()) {
      mainWindow = createMainWindow({
        iconPath,
        isQuitting: () => isQuitting,
        onHidden: () => activity.add('Window closed; still running in the system tray'),
      });
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }

  // --- Lifecycle -----------------------------------------------------------

  // Most Electron APIs (windows, tray, notifications) only work after "ready".
  void app.whenReady().then(() => {
    activity.add('Application started');
    registerIpcHandlers({ backend, client, activity });
    showWindow();

    tray = createTray(iconPath, {
      showWindow,
      stopBackend: () => void backend.stop('The backend was stopped from the tray menu.'),
      retryBackend: () => void backend.retry(),
      quit: () => app.quit(),
    });
    tray.setStatus(backend.status);

    // Stage 3C: main starts the backend it owns. The window doesn't wait for
    // it; the UI shows "Starting…" until the status changes.
    backend.start().catch((err: unknown) => {
      activity.add(`Could not start the backend: ${err instanceof Error ? err.message : String(err)}`, 'error');
    });
  });

  app.on('second-instance', showWindow); // someone launched the app again
  app.on('activate', showWindow); // macOS: dock icon clicked

  // Default Electron behaviour quits when the last window closes. We hide the
  // window instead of closing it, and the tray keeps the app alive, so there
  // is nothing to do here; the listener just documents the decision.
  app.on('window-all-closed', () => {});

  // Quitting: stop the backend first, then let the quit continue.
  // `before-quit` can't be awaited, so: cancel this quit, clean up, quit again.
  let backendStopped = false;
  app.on('before-quit', (event) => {
    isQuitting = true; // lets the window's close handler actually close
    if (backendStopped) return;
    event.preventDefault();
    void backend.stop('The application is quitting.').finally(() => {
      backendStopped = true;
      app.quit();
    });
  });
}
