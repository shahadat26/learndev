import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">404</p>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-600">
        The page or product you asked for does not exist, or is no longer available.
      </p>
      <div className="flex justify-center gap-3 pt-2">
        <Link href="/products" className="btn-primary">
          Browse products
        </Link>
        <Link href="/" className="btn-secondary">
          Go home
        </Link>
      </div>
    </div>
  );
}
