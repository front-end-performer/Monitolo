// IPC HANDLERS — the "routes" of the desktop API: what the renderer may ask main.
//
// Each handler:
//   1. checks WHO is asking (only our own UI, see `isAppUrl`);
//   2. checks WHAT it sent: arguments come from the untrusted renderer, so
//      they are parsed with zod before use, never trusted as typed;
//   3. does the work (here: call the backend over HTTP);
//   4. records it in the activity log ("monitoring operations").
import { ipcMain, type IpcMainInvokeEvent } from 'electron';
import { z } from 'zod';
import { IpcChannels } from '../shared/ipc-channels.ts';
import type { RefreshTrigger } from '../shared/types.ts';
import type { ActivityLog } from './activity-log.ts';
import type { BackendClient } from './backend-client.ts';
import type { BackendManager } from './backend-manager.ts';
import { isAppUrl } from './window.ts';

interface IpcDeps {
  backend: BackendManager;
  client: BackendClient;
  activity: ActivityLog;
}

// TypeScript says the renderer sends a RefreshTrigger, but types vanish at
// runtime and a compromised page could send anything. This checks for real.
const refreshTriggerSchema: z.ZodType<RefreshTrigger> = z.enum(['manual', 'auto']);

export function registerIpcHandlers({ backend, client, activity }: IpcDeps): void {
  /** Fetch from the backend, with a clear error when it isn't up. */
  async function fromBackend<T>(what: string, fetcher: () => Promise<T>, rawTrigger: unknown): Promise<T> {
    const trigger = refreshTriggerSchema.parse(rawTrigger); // throws on bad input
    if (backend.status.state !== 'running') {
      throw new Error('The backend is not available right now.');
    }
    try {
      const result = await fetcher();
      // Auto-refresh runs every few seconds: logging it would bury everything else.
      if (trigger === 'manual') activity.add(`Refreshed ${what}`);
      return result;
    } catch (err) {
      activity.add(`Could not refresh ${what}: ${err instanceof Error ? err.message : String(err)}`, 'error');
      throw err; // the renderer's promise rejects and it shows an error state
    }
  }

  handle(IpcChannels.getSystemInfo, (trigger) => fromBackend('system information', client.getSystemInfo, trigger));
  handle(IpcChannels.getProcesses, (trigger) => fromBackend('process list', client.getProcesses, trigger));
  handle(IpcChannels.getBackendStatus, () => backend.status);
  handle(IpcChannels.retryBackend, async () => {
    activity.add('Retry requested from the UI');
    await backend.retry();
  });
  handle(IpcChannels.getActivity, () => activity.list());
}

/** ipcMain.handle + sender check, so no handler can forget it. */
// Arguments are typed `unknown` on purpose: each handler must validate them.
function handle(channel: string, handler: (...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
    if (!isAppUrl(event.senderFrame?.url ?? '')) {
      throw new Error(`Blocked IPC "${channel}" from an untrusted page`);
    }
    return handler(...args);
  });
}
