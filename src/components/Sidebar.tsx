import type { BackendState } from '../../shared/types.ts';

export type Page = 'dashboard' | 'processes' | 'activity';

const PAGES: { id: Page; label: string }[] = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'processes', label: 'Processes' },
  { id: 'activity', label: 'Activity Log' },
];

interface SidebarProps {
  current: Page;
  onNavigate: (page: Page) => void;
  backendState: BackendState | undefined;
}

export function Sidebar({ current, onNavigate, backendState }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Main">
      <div className="brand">Monitolo</div>
      <ul>
        {PAGES.map(({ id, label }) => (
          <li key={id}>
            <button
              className="nav-item"
              // aria-current tells screen readers which page is open; the CSS
              // styles the active item from the same attribute.
              aria-current={id === current ? 'page' : undefined}
              onClick={() => onNavigate(id)}
            >
              {label}
            </button>
          </li>
        ))}
      </ul>
      <div className="sidebar-status">
        <span className={`dot dot-${backendState ?? 'starting'}`} aria-hidden />
        Backend: {backendState ?? 'connecting…'}
      </div>
    </nav>
  );
}
