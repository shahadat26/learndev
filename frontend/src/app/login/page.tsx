import type { Metadata } from 'next';
import Link from 'next/link';

import { LoginForm } from '@/components/login-form';
import { isProduction } from '@/lib/env';
import { firstParam, safeRedirectPath, type SearchParams } from '@/lib/url';

export const metadata: Metadata = {
  title: 'Sign in',
};

interface LoginPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Sanitised here so the hidden input can never carry an off-site redirect target.
  const next = safeRedirectPath(firstParam(params.next), '/profile');

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
        <p className="text-sm text-slate-600">
          New here?{' '}
          <Link href="/register" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </p>
      </header>

      <div className="card p-6">
        <LoginForm next={next} />
      </div>

      {/* Seed credentials are development conveniences and are hidden in production,
          exactly like the Swagger UI on the services. */}
      {!isProduction() ? (
        <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Seeded development accounts</p>
          <ul className="mt-2 space-y-1">
            <li>
              <code className="font-mono">admin@shop.local</code> /{' '}
              <code className="font-mono">Admin123!</code> (ADMIN)
            </li>
            <li>
              <code className="font-mono">user@shop.local</code> /{' '}
              <code className="font-mono">User123!</code> (USER)
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}
