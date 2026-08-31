'use client';

import Link from 'next/link';
import { useEffect } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Error boundary for everything under the root layout.
 *
 * Next.js deliberately strips the message of a server-side error before it reaches
 * the browser and replaces it with a `digest` hash: stack traces and upstream error
 * text stay in the server logs, where they belong. Show the digest so a user can
 * quote it in a bug report.
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error('[app] render failed', error);
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="text-sm text-slate-600">
        The page could not be rendered. One of the backend services may be starting up or
        unreachable.
      </p>
      {error.digest ? (
        <p className="text-xs text-slate-500">
          Error reference: <code className="font-mono">{error.digest}</code>
        </p>
      ) : null}
      <div className="flex justify-center gap-3 pt-2">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
