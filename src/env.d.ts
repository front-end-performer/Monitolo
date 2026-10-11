// Tells TypeScript that `window.api` exists in the renderer. The preload script
// creates it at runtime; this declaration gives it the same `DesktopApi` type.
import type { DesktopApi } from '../shared/types.ts';

declare global {
  interface Window {
    api: DesktopApi;
  }
}
