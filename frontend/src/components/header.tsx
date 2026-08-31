import Link from 'next/link';

import { logoutAction } from '@/app/actions/auth';
import { SubmitButton } from '@/components/submit-button';
import { getCurrentUser } from '@/lib/auth/session';
import { fullName } from '@/lib/format';

/**
 * Server component: it reads the session cookie on the server and renders the
 * signed-in state into the HTML. The browser is never told what the token is - only
 * whether somebody is signed in.
 */
export async function SiteHeader() {
  const user = await getCurrentUser();

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="container-page flex flex-wrap items-center gap-x-6 gap-y-3 py-3">
        <Link href="/" className="text-lg font-bold tracking-tight text-brand-700">
          learndev<span className="text-slate-900">shop</span>
        </Link>

        <nav aria-label="Main" className="flex items-center gap-4 text-sm font-medium">
          <Link href="/products" className="text-slate-700 hover:text-brand-700">
            Products
          </Link>
          {user ? (
            <Link href="/profile" className="text-slate-700 hover:text-brand-700">
              Profile
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {user ? (
            <>
              <span className="hidden text-slate-600 sm:inline">
                Signed in as{' '}
                <strong className="font-semibold text-slate-900">{fullName(user)}</strong>
              </span>
              {user.role === 'ADMIN' ? (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">
                  ADMIN
                </span>
              ) : null}
              {/* A POST, not a link: signing out changes state, so it must not be
                  reachable by a GET that a prefetcher could fire. */}
              <form action={logoutAction}>
                <SubmitButton className="btn-secondary" pendingLabel="Signing out…">
                  Sign out
                </SubmitButton>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost">
                Sign in
              </Link>
              <Link href="/register" className="btn-primary">
                Create account
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
