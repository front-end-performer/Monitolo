// ACTIVITY LOG — an in-memory list of what happened, owned by the main process.
//
// "Main owns the state, renderers subscribe": the log lives here, not in React.
// That way it survives page switches and window reloads, and it also records
// things that happen while the window is hidden in the tray. The UI asks for
// the full list once, then receives each new entry as a push event.
import type { ActivityEntry } from '../shared/types.ts';

const MAX_ENTRIES = 200; // keep memory bounded in an app that runs for days

export class ActivityLog {
  #entries: ActivityEntry[] = [];
  #nextId = 1;
  readonly #onAdd: (entry: ActivityEntry) => void;

  constructor(onAdd: (entry: ActivityEntry) => void) {
    this.#onAdd = onAdd;
  }

  add(message: string, level: ActivityEntry['level'] = 'info'): void {
    const entry: ActivityEntry = {
      id: this.#nextId++,
      time: new Date().toISOString(),
      level,
      message,
    };
    this.#entries.push(entry);
    if (this.#entries.length > MAX_ENTRIES) this.#entries.shift();

    console.log(`[activity] ${level}: ${message}`);
    this.#onAdd(entry);
  }

  list(): ActivityEntry[] {
    return [...this.#entries]; // a copy: callers can't mutate our state
  }
}
