// BUILD CONFIG — electron-vite builds three separate bundles, one per process.
//
//   main      → out/main/index.js     (Node, Electron main process)
//               out/main/backend.js   (Node, the Express service it spawns)
//   preload   → out/preload/index.cjs (bridge, runs before the page)
//   renderer  → out/renderer/…        (browser: React app)
//
// `pnpm dev` runs a Vite dev server for the renderer (hot reload) and rebuilds
// main/preload on change, restarting Electron for you.
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Absolute paths on purpose: a bare "electron/main.ts" looks like a file
// inside the `electron` npm package, and the bundler refuses to build it.
const fromRoot = (path: string) => resolve(import.meta.dirname, path);

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // Two entry points in the Node bundle: the Electron app and the backend
        // service. The backend is a separate entry so main can start it as its
        // own process (see electron/backend-manager.ts).
        input: {
          index: fromRoot('electron/main.ts'),
          backend: fromRoot('backend/server.ts'),
        },
      },
    },
  },

  preload: {
    build: {
      rollupOptions: {
        input: { index: fromRoot('electron/preload.ts') },
        // Sandboxed preload scripts must be CommonJS. Our package.json says
        // "type": "module", so force the format and the .cjs extension.
        output: { format: 'cjs', entryFileNames: '[name].cjs' },
      },
    },
  },

  renderer: {
    root: 'src',
    build: {
      rollupOptions: { input: fromRoot('src/index.html') },
    },
    plugins: [react()],
  },
});
