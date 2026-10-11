// BACKEND MANAGER — starts, watches, restarts and stops the backend process.
// (Stage 3, parts C and D.) This is the most "systems" part of the app.
//
// Responsibilities:
//   1. start():  spawn the backend, wait until /api/health answers.
//   2. watch:    ask /api/health every few seconds while it runs.
//   3. recover:  if it crashes or hangs, restart it, but only a few times,
//                with growing delays (1s, 2s, 4s). Then give up and let the
//                user press "Retry Connection". Unlimited restarts would turn
//                a broken backend into a CPU-burning crash loop.
//   4. stop():   ask it to exit gracefully, force-kill it if it doesn't.
//
// Race conditions this class guards against:
//   • start() called twice           → both callers share one start.
//   • start() while stop() is running → the start waits for the stop to finish.
//   • stop() while start() waits for health → start notices and bails out.
//   • a late "exit" event from an OLD process → ignored (we compare objects).
import { utilityProcess, type UtilityProcess } from 'electron';
import { setTimeout as sleep } from 'node:timers/promises';
import type { BackendState, BackendStatus } from '../shared/types.ts';
import type { BackendClient } from './backend-client.ts';

const STARTUP_TIMEOUT_MS = 10_000;
const HEALTH_CHECK_INTERVAL_MS = 5_000;
const MAX_FAILED_CHECKS = 3; // consecutive misses before we call it hung
const MAX_RESTARTS = 3;
const STABLE_AFTER_MS = 30_000; // ran this long → a new crash is not a crash loop
const STOP_TIMEOUT_MS = 5_000;

interface BackendManagerOptions {
  entry: string; // path to the built backend file (out/main/backend.js)
  env: Record<string, string>; // extra environment for the child (port, token)
  client: BackendClient;
  onStatus: (status: BackendStatus, previous: BackendStatus) => void;
}

export class BackendManager {
  // `#name` = a real JavaScript private field; nothing outside the class can
  // touch it, which keeps the state machine consistent.
  readonly #options: BackendManagerOptions;
  #status: BackendStatus = { state: 'stopped', message: 'The backend has not started yet.' };

  #child: UtilityProcess | null = null; // the process we currently own
  #exited: Promise<void> = Promise.resolve(); // resolves when #child exits

  #starting: Promise<void> | null = null; // in-flight start, shared by callers
  #stopping: Promise<void> | null = null; // in-flight stop, shared by callers

  #restarts = 0;
  #startedAt = 0; // when the current process became healthy (0 = never)
  #failedChecks = 0;
  #healthTimer: NodeJS.Timeout | undefined;
  #restartTimer: NodeJS.Timeout | undefined;

  constructor(options: BackendManagerOptions) {
    this.#options = options;
  }

  get status(): BackendStatus {
    return this.#status;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Start the backend. Safe to call repeatedly: concurrent calls share one start. */
  start(): Promise<void> {
    this.#starting ??= this.#doStart().finally(() => {
      this.#starting = null;
    });
    return this.#starting;
  }

  /** Stop the backend we own. Concurrent calls share one stop. */
  stop(message = 'The backend was stopped.'): Promise<void> {
    this.#stopping ??= this.#doStop(message).finally(() => {
      this.#stopping = null;
    });
    return this.#stopping;
  }

  /** "Retry Connection" button: fresh restart budget, then a clean start. */
  async retry(): Promise<void> {
    this.#restarts = 0;
    clearTimeout(this.#restartTimer);
    if (this.#child) await this.stop('Restarting the backend…'); // e.g. it is hung
    await this.start();
  }

  // -------------------------------------------------------------------------
  // Starting
  // -------------------------------------------------------------------------

  async #doStart(): Promise<void> {
    if (this.#stopping) await this.#stopping; // never overlap a stop and a start
    if (this.#child) return; // already running
    clearTimeout(this.#restartTimer);

    this.#setStatus('starting', 'Starting the backend…');

    // utilityProcess = Electron's way to run a Node.js script as a separate OS
    // process (like child_process.fork, but managed by Electron and allowed to
    // run inside a packaged app). If it crashes, the UI keeps working.
    const child = utilityProcess.fork(this.#options.entry, [], {
      serviceName: 'Monitolo Backend',
      env: { ...process.env, ...this.#options.env },
      stdio: 'pipe',
    });
    this.#child = child;
    this.#startedAt = 0;
    this.#exited = new Promise((resolve) => {
      child.once('exit', (code) => {
        this.#handleExit(child, code);
        resolve();
      });
    });

    // Show the backend's console output in the terminal running Electron.
    child.stdout?.on('data', (chunk: Buffer) => process.stdout.write(chunk));
    child.stderr?.on('data', (chunk: Buffer) => process.stderr.write(chunk));

    const healthy = await this.#waitUntilHealthy(child);

    // While we waited, the process may have crashed or stop() may have run.
    // The exit handler already reported that, so there is nothing left to do.
    if (this.#child !== child) return;

    if (!healthy) {
      // Alive but never answered: kill it. The exit handler treats this like
      // a crash and applies the restart limits.
      child.kill();
      return;
    }

    this.#startedAt = Date.now();
    this.#failedChecks = 0;
    this.#setStatus('running', `The backend is running (pid ${child.pid}).`);
    this.#healthTimer = setInterval(() => void this.#checkHealth(), HEALTH_CHECK_INTERVAL_MS);
  }

  /** Poll /api/health until it answers, the process dies, or we time out. */
  async #waitUntilHealthy(child: UtilityProcess): Promise<boolean> {
    const deadline = Date.now() + STARTUP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (this.#child !== child) return false; // exited while starting
      try {
        await this.#options.client.health();
        return true;
      } catch {
        // Expected while the server is still booting: try again shortly.
        await sleep(250);
      }
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Watching and recovering (Stage 3D)
  // -------------------------------------------------------------------------

  async #checkHealth(): Promise<void> {
    const child = this.#child;
    if (!child) return;

    try {
      await this.#options.client.health();
      if (this.#child !== child) return;
      this.#failedChecks = 0;
      if (this.#status.state === 'unavailable') {
        this.#setStatus('running', 'The backend is responding again.');
      }
    } catch {
      if (this.#child !== child) return;
      this.#failedChecks++;
      if (this.#failedChecks < MAX_FAILED_CHECKS) {
        this.#setStatus(
          'unavailable',
          `The backend is not responding (${this.#failedChecks}/${MAX_FAILED_CHECKS} failed checks).`,
        );
        return;
      }
      // The process exists but is stuck. Kill it; the exit handler restarts it.
      child.kill();
    }
  }

  #handleExit(child: UtilityProcess, code: number): void {
    // An exit from a process we already replaced: not our concern anymore.
    if (child !== this.#child) return;

    this.#child = null;
    clearInterval(this.#healthTimer);

    // We asked it to exit: stop() reports the outcome.
    if (this.#stopping) return;

    // It ran fine for a while, so this is a fresh failure, not a crash loop:
    // give it a full restart budget again.
    if (this.#startedAt && Date.now() - this.#startedAt > STABLE_AFTER_MS) {
      this.#restarts = 0;
    }
    this.#scheduleRestart(`The backend exited unexpectedly (code ${code}).`);
  }

  #scheduleRestart(reason: string): void {
    if (this.#restarts >= MAX_RESTARTS) {
      this.#setStatus('unavailable', `${reason} Gave up after ${MAX_RESTARTS} restart attempts.`);
      return;
    }

    this.#restarts++;
    const delayMs = 1000 * 2 ** (this.#restarts - 1); // 1s, 2s, 4s: exponential backoff
    this.#setStatus(
      'unavailable',
      `${reason} Restarting in ${delayMs / 1000}s (attempt ${this.#restarts}/${MAX_RESTARTS}).`,
    );

    this.#restartTimer = setTimeout(() => {
      this.start().catch((err: unknown) => {
        this.#setStatus('unavailable', `Could not start the backend: ${errorMessage(err)}`);
      });
    }, delayMs);
  }

  // -------------------------------------------------------------------------
  // Stopping (Stage 3C)
  // -------------------------------------------------------------------------

  async #doStop(message: string): Promise<void> {
    clearTimeout(this.#restartTimer); // a pending auto-restart must not resurrect it
    clearInterval(this.#healthTimer);

    const child = this.#child;
    if (child) {
      this.#setStatus('stopping', 'Stopping the backend…');
      child.kill(); // SIGTERM on Linux/macOS: the backend closes its server and exits

      const timedOut = await Promise.race([
        this.#exited.then(() => false),
        sleep(STOP_TIMEOUT_MS).then(() => true),
      ]);
      if (timedOut && child.pid) {
        // It ignored the polite request. SIGKILL cannot be ignored.
        process.kill(child.pid, 'SIGKILL');
        await this.#exited;
      }
    }

    this.#setStatus('stopped', message);
  }

  // -------------------------------------------------------------------------

  #setStatus(state: BackendState, message: string): void {
    const previous = this.#status;
    this.#status = { state, message };
    this.#options.onStatus(this.#status, previous);
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
