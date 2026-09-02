import Link from 'next/link';

import { Alert } from '@/components/alert';
import { CategoryFilter } from '@/components/category-filter';
import { ProductGrid } from '@/components/product-grid';
import { productApi } from '@/lib/api/products';
import type { Category, Product } from '@/lib/types';

const FEATURED_LIMIT = 4;

/**
 * The landing page must still render when the catalogue is down - a storefront that
 * returns a 500 because one upstream is unhealthy fails its own availability budget.
 * So the two calls degrade to an inline notice instead of throwing to error.tsx.
 */
async function loadFeatured(): Promise<{
  products: Product[];
  categories: Category[];
  failed: boolean;
}> {
  try {
    const [page, categories] = await Promise.all([
      productApi.listProducts({ limit: FEATURED_LIMIT }),
      productApi.listCategories(),
    ]);
    return { products: page.data ?? [], categories, failed: false };
  } catch (error) {
    console.error('[home] catalogue unavailable', error);
    return { products: [], categories: [], failed: true };
  }
}

export default async function HomePage() {
  const { products, categories, failed } = await loadFeatured();

  return (
    <div className="space-y-12">
      <section className="card overflow-hidden">
        <div className="bg-linear-to-br from-brand-600 to-brand-800 px-6 py-14 text-white sm:px-12">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-200">
            Automatically CI/CD pipeline setup ok.Shahadat DevOps learning lab
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            A Automatically CI/CD pipeline setup ok. small e-commerce site with real production plumbing
          </h1>
          <p className="mt-4 max-w-2xl text-brand-100">
            Next.js renders every page on the server, Traefik routes /api to two NestJS services,
            and each service owns its own PostgreSQL database. Browse the catalogue, create an
            account, and watch the request flow in the Traefik dashboard.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/products" className="btn bg-white text-brand-700 hover:bg-brand-50">
              Browse products
            </Link>
            <Link
              href="/register"
              className="btn border border-white/40 text-white hover:bg-white/10"
            >
              Create an account
            </Link>
          </div>
        </div>
      </section>

      {failed ? (
        <Alert variant="error">
          The product catalogue is unavailable right now. Check that product-service is running and
          healthy.
        </Alert>
      ) : null}

      {categories.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Shop by category</h2>
          <CategoryFilter categories={categories} />
        </section>
      ) : null}

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-4">
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Featured products</h2>
          <Link href="/products" className="text-sm font-semibold text-brand-700 hover:underline">
            View all
          </Link>
        </div>
        <ProductGrid
          products={products}
          emptyTitle="No products yet"
          emptyDescription="Run the product-service seed (npm run prisma:seed) to populate the catalogue."
        />
      </section>
    </div>
  );
}
