// "Backend connection lost. [Retry Connection]" (Stage 3D).
// Shown whenever the backend isn't running, with the reason from main.
import { useState } from 'react';
import type { BackendStatus } from '../../shared/types.ts';
import { retryBackend } from '../services/system-api.ts';

export function BackendBanner({ status }: { status: BackendStatus | null }) {
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  if (!status || status.state === 'running') return null;

  if (status.state === 'starting' || status.state === 'stopping') {
    return (
      <div className="banner banner-info" role="status">
        {status.message}
      </div>
    );
  }

  async function handleRetry() {
    setRetrying(true);
    setRetryError(null);
    try {
      await retryBackend(); // resolves once the backend is healthy again
    } catch (err) {
      setRetryError(err instanceof Error ? err.message : String(err));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <div className="banner banner-danger" role="alert">
      <div>
        <strong>Backend connection lost.</strong>
        <p>{retryError ?? status.message}</p>
      </div>
      <button className="button" onClick={handleRetry} disabled={retrying} aria-busy={retrying}>
        {retrying ? 'Retrying…' : 'Retry Connection'}
      </button>
    </div>
  );
}
