// SYSTEM API — the ONLY file in the UI that touches `window.api`.
//
// Components import these functions instead of reaching for `window.api`.
// Benefits:
//   • one place to clean up errors before the UI shows them;
//   • to run the UI in a normal browser (or tests), swap this file for a mock;
//   • the rest of the UI doesn't know or care that Electron exists.
import type { RefreshTrigger } from '../../shared/types.ts';

const api = window.api;

/**
 * Errors thrown in a main-process IPC handler arrive as
 *   "Error invoking remote method 'system:get-info': Error: <message>".
 * Users should only see <message>.
 */
function cleanError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  return new Error(message.replace(/^Error invoking remote method '[^']+': (?:\w*Error: )?/, ''));
}

async function call<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (err) {
    throw cleanError(err);
  }
}

export const getSystemInfo = (trigger: RefreshTrigger) => call(() => api.getSystemInfo(trigger));
export const getProcesses = (trigger: RefreshTrigger) => call(() => api.getProcesses(trigger));
export const getBackendStatus = () => call(() => api.getBackendStatus());
export const retryBackend = () => call(() => api.retryBackend());
export const getActivity = () => call(() => api.getActivity());

export const onBackendStatus = api.onBackendStatus;
export const onActivity = api.onActivity;
