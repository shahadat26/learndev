import Link from 'next/link';

import { buildUrl } from '@/lib/url';

interface PaginationProps {
  page: number;
  totalPages: number;
  /** Query parameters to carry over (search, categoryId, ...). `page` is added here. */
  params: Record<string, string | number | undefined>;
  pathname?: string;
}

/** Page numbers around the current one, with the first and last always reachable. */
function pageWindow(page: number, totalPages: number): number[] {
  const span = 2;
  const pages = new Set<number>([1, totalPages]);
  for (let candidate = page - span; candidate <= page + span; candidate += 1) {
    if (candidate >= 1 && candidate <= totalPages) {
      pages.add(candidate);
    }
  }
  return [...pages].sort((a, b) => a - b);
}

export function Pagination({ page, totalPages, params, pathname = '/products' }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = pageWindow(page, totalPages);
  const href = (target: number) => buildUrl(pathname, { ...params, page: target });

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 pt-2">
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-secondary" rel="prev">
          Previous
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none opacity-50" aria-hidden="true">
          Previous
        </span>
      )}

      <ol className="flex flex-wrap items-center gap-1">
        {pages.map((target, index) => {
          const previous = pages[index - 1];
          const gap = previous !== undefined && target - previous > 1;
          return (
            <li key={target} className="flex items-center gap-1">
              {gap ? (
                <span className="px-1 text-slate-400" aria-hidden="true">
                  …
                </span>
              ) : null}
              {target === page ? (
                <span
                  aria-current="page"
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-md bg-brand-600 px-3 text-sm font-semibold text-white"
                >
                  {target}
                </span>
              ) : (
                <Link
                  href={href(target)}
                  aria-label={`Go to page ${target}`}
                  className="inline-flex h-9 min-w-9 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {target}
                </Link>
              )}
            </li>
          );
        })}
      </ol>

      {page < totalPages ? (
        <Link href={href(page + 1)} className="btn-secondary" rel="next">
          Next
        </Link>
      ) : (
        <span className="btn-secondary pointer-events-none opacity-50" aria-hidden="true">
          Next
        </span>
      )}
    </nav>
  );
}
