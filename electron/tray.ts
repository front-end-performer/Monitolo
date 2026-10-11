// SYSTEM TRAY (Stage 3A) — the icon next to the clock that keeps the app
// reachable while its window is hidden.
//
// Linux note: most desktops show tray icons through "AppIndicator". There,
// clicking the icon opens the menu and the `click` event never fires, so every
// action must also be in the menu. GNOME needs the AppIndicator extension
// (Ubuntu ships it enabled).
import { Menu, Tray } from 'electron';
import type { BackendStatus } from '../shared/types.ts';

interface TrayActions {
  showWindow: () => void;
  stopBackend: () => void;
  retryBackend: () => void;
  quit: () => void;
}

export function createTray(iconPath: string, actions: TrayActions) {
  const tray = new Tray(iconPath);
  tray.setToolTip('Monitolo');
  tray.on('click', actions.showWindow); // Windows/macOS

  // The menu shows the backend state, so it is rebuilt on every status change.
  function setStatus(status: BackendStatus) {
    const running = status.state === 'running';
    tray.setToolTip(`Monitolo: backend ${status.state}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Show Monitolo', click: actions.showWindow },
        { type: 'separator' },
        { label: `Backend: ${status.state}`, enabled: false },
        // Handy for learning: stop it and watch the UI show "connection lost".
        { label: 'Stop Backend', enabled: running, click: actions.stopBackend },
        { label: 'Restart Backend', click: actions.retryBackend },
        { type: 'separator' },
        { label: 'Quit', click: actions.quit },
      ]),
    );
  }

  // Return the Tray too: the caller must keep a reference to it. A Tray that
  // only lives in a local variable can be garbage-collected and vanish.
  return { tray, setStatus };
}
