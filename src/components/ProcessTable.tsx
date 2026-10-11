import type { ProcessInfo } from '../../shared/types.ts';
import { formatBytes, formatPercent } from '../utils/format.ts';

export function ProcessTable({ processes }: { processes: ProcessInfo[] }) {
  if (processes.length === 0) {
    return <p className="muted">No processes match.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th className="numeric">PID</th>
            <th>User</th>
            <th className="numeric">CPU</th>
            <th className="numeric">Memory</th>
            <th className="numeric">RAM used</th>
          </tr>
        </thead>
        <tbody>
          {processes.map((p) => (
            // `key` must be stable and unique: the PID is, an array index isn't
            // (rows move when the list re-sorts).
            <tr key={p.pid}>
              <td className="name">{p.name}</td>
              <td className="numeric">{p.pid}</td>
              <td>{p.user}</td>
              <td className="numeric">{formatPercent(p.cpu)}</td>
              <td className="numeric">{formatPercent(p.memory)}</td>
              <td className="numeric">{formatBytes(p.memoryRss)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
