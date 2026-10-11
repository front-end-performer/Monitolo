// MAIN WINDOW — creation, security settings and "close hides to tray".
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// In `pnpm dev`, electron-vite serves the React app from a Vite dev server (hot
// reload) and passes its URL here. Built apps load the HTML file from disk.
// `!app.isPackaged`: a shipped app must never be redirected by an env variable.
const devServerUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;
const rendererFile = join(import.meta.dirname, '../renderer/index.html');

/** True only for our own UI. Used to reject IPC and navigation from anywhere else. */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (devServerUrl) return parsed.origin === new URL(devServerUrl).origin;
    parsed.hash = '';
    return parsed.href === pathToFileURL(rendererFile).href;
  } catch {
    return false; // not even a valid URL
  }
}

interface MainWindowOptions {
  iconPath: string;
  isQuitting: () => boolean;
  onHidden: () => void;
}

export function createMainWindow({ iconPath, isQuitting, onHidden }: MainWindowOptions): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 760,
    minHeight: 480,
    title: 'Monitolo',
    icon: iconPath,
    autoHideMenuBar: true,
    show: false, // show once the first paint is ready: no white flash
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/index.cjs'),
      // The three security switches. These are the defaults; spelled out so
      // nobody "temporarily" flips one off.
      sandbox: true, // renderer runs in Chromium's OS-level sandbox
      contextIsolation: true, // page JS can't reach preload/Electron internals
      nodeIntegration: false, // page has no require(), no fs, no process
    },
  });

  win.once('ready-to-show', () => win.show());

  // Stage 3A, tray: closing the window hides it; the app keeps running.
  // Only a real quit (tray menu → Quit, or the OS shutting down) closes it.
  win.on('close', (event) => {
    if (isQuitting()) return;
    event.preventDefault();
    win.hide();
    onHidden();
  });

  // The window may only ever show our UI. Links that try to open new windows
  // go to the system browser instead (https only); anything else is refused.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) event.preventDefault();
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(rendererFile);
  }

  return win;
}
