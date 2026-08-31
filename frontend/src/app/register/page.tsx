import type { Metadata } from 'next';
import Link from 'next/link';

import { RegisterForm } from '@/components/register-form';
import { firstParam, safeRedirectPath, type SearchParams } from '@/lib/url';

export const metadata: Metadata = {
  title: 'Create account',
};

interface RegisterPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const next = safeRedirectPath(firstParam(params.next), '/profile');

  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
        <p className="text-sm text-slate-600">
          Already registered?{' '}
          <Link href="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </header>

      <div className="card p-6">
        <RegisterForm next={next} />
      </div>

      <p className="text-center text-xs text-slate-500">
        Passwords are hashed with bcrypt by account-service. This storefront only ever holds the
        resulting tokens, in cookies your browser cannot read.
      </p>
    </div>
  );
}
