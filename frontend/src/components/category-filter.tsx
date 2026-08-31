import Link from 'next/link';

import { buildUrl } from '@/lib/url';
import type { Category } from '@/lib/types';

interface CategoryFilterProps {
  categories: Category[];
  activeCategoryId?: string;
  /** Query parameters to keep when switching category (search, limit, ...). */
  params?: Record<string, string | number | undefined>;
}

export function CategoryFilter({ categories, activeCategoryId, params = {} }: CategoryFilterProps) {
  if (categories.length === 0) {
    return null;
  }

  // Changing the filter resets pagination: page 3 of the old filter rarely exists.
  const href = (categoryId?: string) =>
    buildUrl('/products', { ...params, categoryId, page: undefined });

  const chip = (active: boolean) =>
    `inline-flex items-center rounded-full px-3 py-1 text-sm font-medium transition-colors ${
      active
        ? 'bg-brand-600 text-white'
        : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
    }`;

  return (
    <nav aria-label="Filter by category" className="flex flex-wrap gap-2">
      <Link
        href={href(undefined)}
        aria-current={activeCategoryId ? undefined : 'true'}
        className={chip(!activeCategoryId)}
      >
        All
      </Link>
      {categories.map((category) => (
        <Link
          key={category.id}
          href={href(category.id)}
          aria-current={activeCategoryId === category.id ? 'true' : undefined}
          className={chip(activeCategoryId === category.id)}
        >
          {category.name}
        </Link>
      ))}
    </nav>
  );
}
