// LOCAL BACKEND — a small, independent Express service (Stage 2).
//
// It knows nothing about Electron. It runs:
//   • inside the app: electron/backend-manager.ts starts it as a child process
//     and passes MONITOR_PORT and MONITOR_TOKEN as environment variables;
//   • on its own:     `pnpm backend` (Node 24 runs the .ts file directly).
//
// Security model (a localhost port is NOT private: any program on this machine,
// and any web page in your browser, can try to reach it):
//   1. Listen on 127.0.0.1 only, never 0.0.0.0, so other machines can't connect.
//   2. Require a secret token on every data endpoint. Main generates a fresh
//      random token per launch and is the only one who knows it. Local programs
//      and web pages can't guess it.
//   3. No CORS headers, so browsers refuse to hand responses to other websites.
import { randomBytes, timingSafeEqual } from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import { processesRouter } from './routes/processes.ts';
import { systemRouter } from './routes/system.ts';
import type { HealthResponse } from '../shared/types.ts';

const HOST = '127.0.0.1';
const PORT = Number(process.env.MONITOR_PORT ?? 4317);

// Started by Electron: the token comes from main. Started by hand: make one up
// and print it, so you can try the API with curl.
const TOKEN = process.env.MONITOR_TOKEN ?? randomBytes(32).toString('hex');
if (!process.env.MONITOR_TOKEN) {
  console.log(`No MONITOR_TOKEN given. Use this one:\n  curl -H "Authorization: Bearer ${TOKEN}" http://${HOST}:${PORT}/api/system`);
}

const app = express();
app.disable('x-powered-by'); // don't advertise the framework

// Health stays public: it reveals nothing and lets anyone (main, you with curl)
// check that the service is alive.
app.get('/api/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok' };
  res.json(body);
});

// Everything registered after this middleware requires the token.
app.use((req, res, next) => {
  const given = Buffer.from(req.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${TOKEN}`);
  // timingSafeEqual: comparison time doesn't leak how many characters matched.
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
});

app.use('/api', systemRouter);
app.use('/api', processesRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Express recognises an error handler by its 4 parameters, so `_next` must stay.
// Log the details here; send the client a generic message only.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[backend] request failed:', err);
  res.status(500).json({ error: 'Internal error' });
});

const server = app.listen(PORT, HOST, () => {
  console.log(`[backend] listening on http://${HOST}:${PORT} (pid ${process.pid})`);
});

// Most common startup failure: the port is taken (e.g. another copy is running).
// Exit with an error code; whoever started us sees the exit and reports it.
server.on('error', (err) => {
  console.error('[backend] could not start:', err.message);
  process.exit(1);
});

// Graceful shutdown. Electron's `child.kill()` and Ctrl+C send these signals.
// Stop accepting connections, let in-flight requests finish, then exit.
function shutdown(signal: string) {
  console.log(`[backend] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
