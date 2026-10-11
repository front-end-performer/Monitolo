// BACKEND CLIENT — how the Electron main process talks HTTP to the backend.
//
// Why main, and not React, calls the backend:
//   • the auth token never reaches the web page (pages are the least trusted part);
//   • the page needs no network permissions (its CSP can stay `'self'` only);
//   • one place to validate responses before anything else uses them.
//
// Why validate with zod when we already have TypeScript interfaces?
// Types only exist at compile time. The backend is a separate program: it could
// be an older version, crash halfway through a response, or be a different
// service sitting on the port. `schema.parse()` checks the real data at runtime
// and throws a clear error instead of letting `undefined` leak into the UI.
import { z } from 'zod';
import type { HealthResponse, ProcessList, SystemInfo } from '../shared/types.ts';

// `z.ZodType<SystemInfo>` makes TypeScript check that each schema matches its
// interface. Change one without the other and the build fails.
const healthSchema: z.ZodType<HealthResponse> = z.object({ status: z.literal('ok') });

const systemInfoSchema: z.ZodType<SystemInfo> = z.object({
  platform: z.string(),
  architecture: z.string(),
  cpuModel: z.string(),
  cpuCores: z.number().int().nonnegative(),
  cpuUsage: z.number().min(0).max(100),
  totalMemory: z.number().nonnegative(),
  freeMemory: z.number().nonnegative(),
  uptime: z.number().nonnegative(),
});

const processListSchema: z.ZodType<ProcessList> = z.object({
  total: z.number().int().nonnegative(),
  processes: z.array(
    z.object({
      pid: z.number().int(),
      name: z.string(),
      user: z.string(),
      cpu: z.number(),
      memory: z.number(),
      memoryRss: z.number(),
    }),
  ),
});

export type BackendClient = ReturnType<typeof createBackendClient>;

export function createBackendClient({ port, token }: { port: number; token: string }) {
  const baseUrl = `http://127.0.0.1:${port}`;

  async function request<T>(path: string, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { authorization: `Bearer ${token}` },
      // Never wait forever: a hung backend must turn into an error we can show.
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Backend answered ${response.status} for ${path}`);
    }
    return schema.parse(await response.json());
  }

  return {
    health: () => request('/api/health', healthSchema, 2_000),
    getSystemInfo: () => request('/api/system', systemInfoSchema, 5_000),
    // Listing processes runs an OS command; it can take a second or two.
    getProcesses: () => request('/api/processes', processListSchema, 15_000),
  };
}
