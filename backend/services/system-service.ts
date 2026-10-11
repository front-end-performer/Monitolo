// SYSTEM SERVICE — the only code that talks to the operating system.
//
// Routes stay thin (HTTP in, JSON out); the "how do we read the OS" logic lives
// here. That split means you could reuse these functions from a CLI or a test
// without Express.
import os from 'node:os';
import { setTimeout as sleep } from 'node:timers/promises';
import si from 'systeminformation';
import type { ProcessInfo, ProcessList, SystemInfo } from '../../shared/types.ts';

const CPU_SAMPLE_MS = 250;
const MAX_PROCESSES = 100;

/**
 * CPU usage needs two measurements: `os.cpus()` returns how many milliseconds
 * each core has spent in each mode (user, system, idle…) since boot. Usage is
 * the share of time that was NOT idle between two snapshots.
 */
async function measureCpuUsage(): Promise<number> {
  const totals = () =>
    os.cpus().reduce(
      (acc, cpu) => {
        const t = cpu.times;
        acc.idle += t.idle;
        acc.total += t.user + t.nice + t.sys + t.irq + t.idle;
        return acc;
      },
      { idle: 0, total: 0 },
    );

  const before = totals();
  await sleep(CPU_SAMPLE_MS);
  const after = totals();

  const total = after.total - before.total;
  const idle = after.idle - before.idle;
  return total === 0 ? 0 : Math.round((1 - idle / total) * 1000) / 10; // one decimal
}

/** Basic machine information, all from Node's built-in `node:os`. */
export async function getSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  return {
    platform: os.platform(),
    architecture: os.arch(),
    cpuModel: cpus[0]?.model.trim() ?? 'Unknown',
    cpuCores: cpus.length,
    cpuUsage: await measureCpuUsage(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    uptime: Math.floor(os.uptime()),
  };
}

/**
 * Node has no cross-platform "list processes" API, so we use the
 * `systeminformation` library. It runs the right command per OS (`ps` on
 * Linux/macOS, PowerShell/WMI on Windows) and parses the output.
 */
export async function listProcesses(): Promise<ProcessList> {
  const { list } = await si.processes();

  const processes: ProcessInfo[] = list
    .map((p) => ({
      pid: p.pid,
      name: p.name,
      user: p.user,
      cpu: Math.round(p.cpu * 10) / 10,
      memory: Math.round(p.mem * 10) / 10,
      memoryRss: p.memRss * 1024, // systeminformation reports kilobytes
    }))
    .sort((a, b) => b.cpu - a.cpu || b.memoryRss - a.memoryRss)
    // A desktop has hundreds of processes; the UI only needs the heavy ones.
    .slice(0, MAX_PROCESSES);

  return { total: list.length, processes };
}
