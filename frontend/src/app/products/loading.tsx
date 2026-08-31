export default function ProductsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading products…</span>
      <div className="h-8 w-40 animate-pulse rounded-md bg-slate-200" />
      <div className="h-10 w-full animate-pulse rounded-md bg-slate-200" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="card overflow-hidden">
            <div className="aspect-4/3 w-full animate-pulse bg-slate-200" />
            <div className="space-y-2 p-4">
              <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
