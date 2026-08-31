import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ProfileForm } from '@/components/profile-form';
import { loadSession } from '@/lib/auth/session';
import { formatDate, fullName } from '@/lib/format';

export const metadata: Metadata = {
  title: 'Your profile',
};

export default async function ProfilePage() {
  // The middleware already blocks anonymous requests to /profile. This second check
  // is defence in depth: a page that renders private data should never rely on a
  // single guard, and the middleware only inspects cookies while this call actually
  // validates the token against account-service.
  const session = await loadSession();

  // Only a *genuine* auth failure may bounce to /login. If account-service is simply
  // down or slow the cookies are still valid, so the middleware would send the user
  // straight back here - an infinite redirect loop that ends in ERR_TOO_MANY_REDIRECTS.
  // Showing the error boundary tells the truth instead: the session is fine, the
  // service is not.
  if (session.status === 'unavailable') {
    throw session.error;
  }
  if (session.status === 'anonymous') {
    redirect('/login?next=/profile');
  }

  const { user } = session;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your profile</h1>
        <p className="text-sm text-slate-600">Signed in as {fullName(user)}.</p>
      </header>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Account details</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-slate-500">Email</dt>
            <dd className="font-medium text-slate-900">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Role</dt>
            <dd className="font-medium text-slate-900">{user.role}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Member since</dt>
            <dd className="font-medium text-slate-900">{formatDate(user.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-sm text-slate-500">Last updated</dt>
            <dd className="font-medium text-slate-900">{formatDate(user.updatedAt)}</dd>
          </div>
        </dl>
      </section>

      <section className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900">Edit your details</h2>
        <p className="mt-1 mb-4 text-sm text-slate-600">
          Your email and role are managed by account-service and cannot be changed here.
        </p>
        <ProfileForm firstName={user.firstName ?? ''} lastName={user.lastName ?? ''} />
      </section>
    </div>
  );
}
