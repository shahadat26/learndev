import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { Price } from '@/components/price';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { isApiError } from '@/lib/api/client';
import { productApi } from '@/lib/api/products';
import { formatDate, truncate } from '@/lib/format';
import type { Product } from '@/lib/types';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  try {
    const product = await productApi.getProduct(id);
    return {
      title: product.name,
      description: product.description ? truncate(product.description, 160) : undefined,
    };
  } catch {
    // Metadata generation must never throw: the page itself renders the 404.
    return { title: 'Product not found' };
  }
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;

  let product: Product;
  try {
    product = await productApi.getProduct(id);
  } catch (error) {
    if (isApiError(error) && error.isNotFound) {
      // Renders not-found.tsx with a real 404 status - important for crawlers and
      // for anyone reading the access logs.
      notFound();
    }
    throw error;
  }

  const inStock = typeof product.stock !== 'number' || product.stock > 0;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="hover:text-brand-700">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <Link href="/products" className="hover:text-brand-700">
              Products
            </Link>
          </li>
          {product.category?.name ? (
            <>
              <li aria-hidden="true">/</li>
              <li>
                <Link
                  href={`/products?categoryId=${encodeURIComponent(product.category.id)}`}
                  className="hover:text-brand-700"
                >
                  {product.category.name}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card aspect-4/3 overflow-hidden bg-slate-100">
          <ProductThumbnail name={product.name} imageUrl={product.imageUrl} />
        </div>

        <div className="space-y-5">
          <div className="space-y-2">
            {product.category?.name ? (
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
                {product.category.name}
              </p>
            ) : null}
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">{product.name}</h1>
            <Price
              priceCents={product.priceCents}
              currency={product.currency}
              className="block text-2xl font-bold text-slate-900"
            />
          </div>

          {product.description ? (
            <p className="text-slate-700">{product.description}</p>
          ) : (
            <p className="text-slate-500">No description provided.</p>
          )}

          <dl className="card divide-y divide-slate-200 text-sm">
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-slate-500">Availability</dt>
              <dd className={inStock ? 'font-medium text-emerald-700' : 'font-medium text-red-700'}>
                {inStock
                  ? typeof product.stock === 'number'
                    ? `In stock (${product.stock})`
                    : 'In stock'
                  : 'Out of stock'}
              </dd>
            </div>
            {product.sku ? (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">SKU</dt>
                <dd className="font-mono text-slate-800">{product.sku}</dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-4 px-4 py-3">
              <dt className="text-slate-500">Product ID</dt>
              <dd className="font-mono text-xs text-slate-800">{product.id}</dd>
            </div>
            {product.createdAt ? (
              <div className="flex justify-between gap-4 px-4 py-3">
                <dt className="text-slate-500">Added</dt>
                <dd className="text-slate-800">{formatDate(product.createdAt)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="text-sm text-slate-500">
            This lab has no cart or checkout: the catalogue is read-only for shoppers, and only an
            ADMIN token may create or edit products.
          </p>

          <Link href="/products" className="btn-secondary">
            Back to products
          </Link>
        </div>
      </div>
    </div>
  );
}
