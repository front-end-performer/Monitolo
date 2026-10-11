# Monitolo

**See what your computer is doing: live CPU, memory and process monitoring from your desktop tray.**

Monitolo is a lightweight desktop system monitor. It shows live CPU and memory usage, uptime and machine details, lists the processes using the most resources, and keeps a log of everything that happens. Close the window and it keeps running in the system tray, with a notification if monitoring stops or starts again. All data stays on your machine: nothing is sent anywhere.

Built with Electron + React + TypeScript, with a local Node.js/Express backend that the app starts, watches and stops itself.

## Requirements

- **Node.js 24+** (see `.nvmrc`; with nvm: `nvm use`). The backend runs `.ts` files directly, which needs a recent Node.
- **pnpm 11+**. If you don't have it: `npm install -g pnpm@11`, or `corepack enable pnpm`.
- Linux, macOS or Windows. Developed and tested on Ubuntu.

## Setup

```bash
git clone git@github.com:front-end-performer/Monitolo.git
cd Monitolo
pnpm install
pnpm dev        # the first run downloads the Electron binary (~100 MB)
```

**Linux: if the app crashes with `The SUID sandbox helper binary was found, but is not configured correctly`**, Ubuntu (23.10+) blocks Chromium's default sandbox. Give the sandbox helper the permissions it needs (once, and again after reinstalling `node_modules`):

```bash
sudo chown root node_modules/electron/dist/chrome-sandbox
sudo chmod 4755 node_modules/electron/dist/chrome-sandbox
```

Or, for a quick local try only: `pnpm dev -- --no-sandbox`.

The backend uses port **4317** on `127.0.0.1`. If another program uses it, the app shows "Backend connection lost".

## Run it

```bash
pnpm dev        # development: hot reload for the UI, auto-restart for main/preload
pnpm start      # build, then run the built app
pnpm backend    # the backend alone (prints a token to try it with curl)
pnpm typecheck  # TypeScript, both Node and browser sides
```

Closing the window hides it to the system tray. Quit from the tray menu.

## Architecture

```
React UI (src/)                      renderer process: sandboxed, no Node
   │  window.api.getSystemInfo()
   ▼
Preload (electron/preload.ts)        exposes window.api, nothing else
   │  IPC "system:get-info"
   ▼
Main (electron/)                     windows, tray, notifications, lifecycle
   │  HTTP + secret token            validates every response with zod
   ▼
Backend (backend/)                   separate process, Express on 127.0.0.1:4317
   │  node:os, systeminformation
   ▼
Operating system
```

**One deliberate change from the original plan:** React does not `fetch()` the backend directly. It goes through IPC to main, and main calls the backend. Main holds the backend's secret token, so the web page never sees it, needs no network permissions, and can't be used to reach the service.

## Folder structure

```
electron/                 MAIN PROCESS + PRELOAD (Node / Electron)
  main.ts                 ★ start here: wiring + app lifecycle
  window.ts               BrowserWindow, security settings, hide-on-close
  tray.ts                 system tray icon + menu
  ipc.ts                  IPC handlers: the desktop API's "routes"
  backend-manager.ts      ★ start/watch/restart/stop the backend process
  backend-client.ts       HTTP calls to the backend + runtime validation
  activity-log.ts         in-memory event log, pushed to the UI
  preload.ts              builds window.api
backend/                  LOCAL SERVICE (plain Node, no Electron)
  server.ts               Express app, auth token, graceful shutdown
  routes/                 thin HTTP handlers
  services/               the code that actually reads the OS
shared/                   used by all layers: types only + channel names
  types.ts                ★ the contract: SystemInfo, BackendStatus, DesktopApi…
  ipc-channels.ts
src/                      RENDERER (React, browser only)
  services/system-api.ts  the only file that touches window.api
  hooks/                  useRequest (loading/error/data), useBackendStatus
  components/ pages/      UI
resources/icon.png        window + tray icon
```

## Where each stage lives

| Stage | Feature | Files |
|---|---|---|
| 1 | Window, React dashboard, sidebar, refresh button | `electron/window.ts`, `src/App.tsx`, `src/components/Sidebar.tsx`, `src/pages/Dashboard.tsx` |
| 2 | Express backend: `/api/health`, `/api/system`, `/api/processes` | `backend/` |
| 2 | Typed API, loading and error states | `shared/types.ts`, `electron/backend-client.ts`, `src/hooks/useRequest.ts` |
| 3A | System tray | `electron/tray.ts`, `close` handler in `electron/window.ts` |
| 3B | Notifications | `handleBackendStatus` in `electron/main.ts` |
| 3C | Backend lifecycle (start on launch, stop on quit) | `electron/backend-manager.ts`, `before-quit` in `electron/main.ts` |
| 3D | Health checks, limited restarts, "Retry Connection" | `electron/backend-manager.ts`, `src/components/BackendBanner.tsx` |

## Suggested reading order

1. `shared/types.ts`: what data moves between layers.
2. `electron/main.ts`: how the pieces are wired together.
3. Follow one click: `src/pages/Dashboard.tsx` → `src/services/system-api.ts` → `electron/preload.ts` → `electron/ipc.ts` → `electron/backend-client.ts` → `backend/routes/system.ts` → `backend/services/system-service.ts`.
4. `electron/backend-manager.ts`: process management and race conditions.

## Experiments

- **Crash recovery:** `kill -9 $(ss -ltnpH 'sport = :4317' | grep -oP 'pid=\K[0-9]+')`. Watch the banner and the Activity Log. Do it 4 times quickly to see it give up.
- **Intentional stop:** tray menu → Stop Backend, then press "Retry Connection".
- **Security:** `curl http://127.0.0.1:4317/api/system` → 401. `/api/health` works without the token.
- **Port conflict:** run `pnpm backend` first, then the app. What does the UI show?
- **Hide to tray:** close the window, check that the app keeps running, reopen it from the tray.

## Packaging

Not set up yet. The plan for Linux installers (.deb + AppImage) and publishing to Ubuntu App Center (Snap Store) is in [docs/packaging.md](docs/packaging.md).
