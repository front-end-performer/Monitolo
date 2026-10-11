# Packaging plan: Linux installers (.deb + AppImage) and Ubuntu App Center (snap)

Status: **planned, not started.** Nothing below has been done yet.
Goal: `pnpm dist` produces installable Linux packages in `dist/`, and the installed app works: window, tray, notifications, and the backend starting from inside the package. Then (optional, last section) publish it to Ubuntu App Center as a snap.

## How packaging works

```
source (src/, electron/, backend/)
   │  electron-vite build         compile TS/React → out/
   ▼
out/
   │  electron-builder
   │   1. copies out/ + package.json + production node_modules (dependencies only)
   │   2. packs them into resources/app.asar (one archive file)
   │   3. puts it next to a copy of the Electron binary, renamed to the app
   │   4. adds icons and metadata (name, version, app ID)
   │   5. signs it (Windows/macOS only)
   │   6. wraps it in an installer format
   ▼
dist/
   ├── monitolo_<version>_amd64.deb
   └── Monitolo-<version>.AppImage
```

`dist/` is already in `.gitignore`.

## Steps

### 1. Install the tool
```bash
pnpm add -D electron-builder
```
Check that its peer/engine requirements fit Electron 44 and pnpm 11 before installing (`pnpm view electron-builder version engines`).

### 2. Clean up dependencies (decides what gets shipped)
`dependencies` are copied into the app; `devDependencies` are not.
- **Keep in `dependencies`:** `express`, `systeminformation`, `zod`. Main and the backend load them at runtime (electron-vite externalizes them, it does not bundle them).
- **Move to `devDependencies`:** `react`, `react-dom`. They are already bundled into `out/renderer/assets/*.js`; shipping them again only adds size.

### 3. Make a 512×512 icon
`resources/icon.png` is 32×32, too small for installers and app menus.
- Create `build/icon.png` at 512×512 (electron-builder's default icon location). It can generate `.ico`/`.icns` from it later.
- Keep `resources/icon.png` (32×32) for the tray. Bigger tray icons look blurry or get clipped.
- The generator script used for the current icon draws an indigo rounded square with three white bars; redraw the same design at 512 px.

### 4. Add `electron-builder.yml`
```yaml
appId: io.github.front-end-performer.monitolo
productName: Monitolo
directories:
  output: dist
  buildResources: build
files:
  - out/**
  - resources/**
  - package.json
linux:
  target: [deb, AppImage]
  category: System
  maintainer: Your Name <you@example.com>   # placeholder: set a real contact before packaging
  synopsis: Live CPU, memory and process monitoring
```
The maintainer email is required by the `.deb` format and is visible to anyone who inspects the package. Use an address you are happy to publish (for example a project or GitHub noreply address), not a private one.

### 5. Add a script to `package.json`
```json
"dist": "electron-vite build && electron-builder --linux"
```

### 6. Build
```bash
pnpm dist
ls dist/
```

### 7. Verify the package (don't skip)
Install the `.deb` and test the real installed app, not `pnpm start`:
```bash
sudo apt install ./dist/monitolo_*_amd64.deb
monitolo          # or launch from the app menu
```
Checklist:
- [ ] Window opens, dashboard shows data → backend started from inside `app.asar`
- [ ] `curl http://127.0.0.1:4317/api/health` → `{"status":"ok"}`
- [ ] Tray icon appears; closing the window hides it; tray → Quit exits
- [ ] After quitting, port 4317 is free (backend stopped)
- [ ] Notifications appear for backend start/stop
- [ ] Icon shows in the app menu
- [ ] No sandbox crash (the `.deb` installs `chrome-sandbox` correctly as root)
- [ ] AppImage: try it, and expect the sandbox issue below on Ubuntu 24+

Uninstall afterwards: `sudo apt remove monitolo`.

## Known risks (check these first if something breaks)

| Risk | Symptom | Fix |
|---|---|---|
| Backend can't start from inside `app.asar` | Banner "Backend connection lost" right after launch | Add `asarUnpack: ["out/main/backend.js"]` to the config, or check how `utilityProcess.fork` resolves the path in packaged apps |
| pnpm's linked `node_modules` | Packaged app crashes with `Cannot find module 'express'` (or zod, systeminformation) | Add `node-linker=hoisted` to `.npmrc`, reinstall, rebuild |
| systeminformation runs OS commands | Process list empty in the package | Check the error in the Activity Log; run the binary from a terminal to see backend logs |
| Linux sandbox in AppImage | `FATAL: The SUID sandbox helper binary was found, but is not configured correctly` | AppImages can't set SUID permissions; prefer `.deb` on Ubuntu. For local dev runs, make `node_modules/electron/dist/chrome-sandbox` root-owned with mode 4755 |
| Icon paths | Missing tray/window icon | Ensure `resources/**` is in `files`; paths use `app.getAppPath()`, which points into `app.asar` |

Already handled in the code: the dev-server URL is ignored when `app.isPackaged` (see `electron/window.ts`).

## Extra: publish to Ubuntu App Center (Snap Store)

Status: **planned, not started.** Do the `.deb` steps above first: a working package is the baseline.

Ubuntu's App Center lists **snaps from the Snap Store** (snapcraft.io). A `.deb` can be opened with App Center as a local file, but it never shows up in search. Getting listed means building a snap and publishing it.

### How a snap differs: confinement
Snaps run **strictly confined**: by default the app can't see other processes, open ports or read system files. Each permission is a named **interface** ("plug") that the snap declares. Our app needs more than a typical app because it monitors the system:

| Need | Interface | Notes |
|---|---|---|
| Window, tray, notifications | `desktop`, `desktop-legacy`, `wayland`, `x11`, `unity7` | Tray icons (StatusNotifier) go through these |
| Chromium sandbox | `browser-support` | Electron needs it; it replaces the `chrome-sandbox` SUID setup |
| Backend listens on 127.0.0.1:4317 | `network-bind` | Even localhost listening needs it |
| Main calls the backend over HTTP | `network` | |
| Read other processes (`ps`, `/proc`), CPU and memory info | `system-observe` | **Not auto-connected.** Needs Snap Store approval (see step 6) |
| Graphics | `opengl` | |

electron-builder adds most of the desktop plugs by default. **Verify its current default list** and add `network-bind` and `system-observe` explicitly.

### Steps
1. **Create a Snapcraft account** at https://snapcraft.io (Ubuntu One login). Install the CLI: `sudo snap install snapcraft --classic`.
2. **Log in and reserve the name.** Names are global and first-come:
   ```bash
   snapcraft login
   snapcraft register monitolo   # pick another name if taken
   ```
   The snap name must match the `name` field in `package.json` (or set `snap.name` in the config).
3. **Add the snap target** to `electron-builder.yml`:
   ```yaml
   linux:
     target: [deb, AppImage, snap]
   snap:
     confinement: strict
     grade: stable              # "devel" while testing; only stable can go to the stable channel
     summary: Live CPU, memory and process monitoring
     plugs:
       - default                # electron-builder's desktop plugs
       - network
       - network-bind
       - system-observe
   ```
   Check the exact syntax against the electron-builder version installed.
4. **Build:** `pnpm dist` → `dist/monitolo_<version>_amd64.snap`.
5. **Test locally, under real confinement:**
   ```bash
   sudo snap install --dangerous ./dist/monitolo_*_amd64.snap
   sudo snap connect monitolo:system-observe   # manual until the store auto-connects it
   snap connections monitolo                    # which plugs are connected
   monitolo
   ```
   Run the same checklist as for the `.deb` (step 7), plus:
   - [ ] Process list is filled. If it's empty, `system-observe` isn't connected.
   - [ ] Backend starts, so `network-bind` works.
   - [ ] `snappy-debug` (`sudo snap install snappy-debug`, then run `snappy-debug` while the app runs) shows no denials.

   Remove it with `sudo snap remove monitolo`.
6. **Request auto-connection for `system-observe`.** Without it, users would have to run `snap connect` themselves. Post on https://forum.snapcraft.io in the "store-requests" category:
   - explain why the app needs it (a system monitor that lists processes);
   - link the snap.

   Reviewers decide. Plan for this taking days. Until it's approved, the app must handle the missing permission gracefully (the Processes page shows an error, not a crash).
7. **Upload to a test channel first:**
   ```bash
   snapcraft upload --release=edge dist/monitolo_*_amd64.snap
   ```
   Channels go from least to most stable: `edge` → `beta` → `candidate` → `stable`. Install from a channel with `sudo snap install monitolo --edge`.
8. **Fill in the store listing** at https://snapcraft.io/monitolo/listing. This is what App Center shows:
   - title, summary, description (ready-to-paste text below);
   - icon (the 512×512 one);
   - screenshots (dashboard, processes, activity log);
   - license, website or source link, contact;
   - category (System or Utilities).

   Listing text (the summary is also `description` in `package.json`; keep them in sync):
   > **Title:** Monitolo
   >
   > **Summary:** See what your computer is doing: live CPU, memory and process monitoring from your desktop tray.
   >
   > **Description:**
   > Monitolo is a lightweight desktop system monitor.
   >
   > • Live CPU and memory usage, uptime and machine details, refreshed automatically
   > • The processes using the most CPU and memory, with search
   > • An activity log of everything that happens
   > • Runs in the system tray when you close the window
   > • Notifies you if monitoring stops or starts again
   >
   > All data stays on your machine: nothing is sent anywhere.
9. **Release to stable:** `snapcraft release monitolo <revision> stable` (or use the "Releases" tab on the dashboard). The listing must be **public**, under Settings → visibility.
10. **Check App Center:** search "Monitolo" in Ubuntu App Center. New listings can take a while to appear.

### Updating later
Bump `version` in `package.json` → `pnpm dist` → upload to `edge` → test → promote to `stable`. Installed snaps update automatically, so this replaces `electron-updater` for snap users.

For CI: `snapcraft export-login creds.txt` gives a token to store as a secret (e.g. `SNAPCRAFT_STORE_CREDENTIALS`) so GitHub Actions can upload. Never commit it.

### Snap-specific risks
| Risk | Symptom | Fix |
|---|---|---|
| `system-observe` not connected | Process list empty or errors; CPU/memory may still work | `snap connect …:system-observe`; get store auto-connect (step 6) |
| `systeminformation` uses commands not in the snap | Errors in the Activity Log about missing commands | Add them as `stage-packages` in the snap config, or read `/proc` directly |
| Tray icon missing | No icon next to the clock | Check `desktop-legacy`/`unity7` plugs; test on the stock Ubuntu desktop |
| Name already taken | `snapcraft register` fails | Choose another name; update `package.json` `name` and the `appId` to match |
| Store review rejects a plug | Upload held for manual review | Answer on the forum; explain why each plug is needed |

## Later (not part of this plan)
- **Windows `.exe` (NSIS):** build on Windows; needs code signing, or SmartScreen warns about an "unknown publisher".
- **macOS `.dmg`:** build on macOS only; needs an Apple Developer account ($99/year) and notarization.
- **CI:** GitHub Actions matrix (ubuntu, windows, macos) → publish to GitHub Releases.
- **Auto-update:** `electron-updater` reading GitHub Releases.
- **Electron fuses:** disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, `EnableNodeCliInspectArguments` at package time.
- **Versioning:** bump `version` in `package.json` for every release.
