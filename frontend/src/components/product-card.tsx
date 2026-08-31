import Link from 'next/link';

import { Price } from '@/components/price';
import { ProductThumbnail } from '@/components/product-thumbnail';
import { truncate } from '@/lib/format';
import type { Product } from '@/lib/types';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const outOfStock = typeof product.stock === 'number' && product.stock <= 0;

  return (
    <article className="card group relative flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <div className="relative aspect-4/3 w-full overflow-hidden bg-slate-100">
        <ProductThumbnail name={product.name} imageUrl={product.imageUrl} />
        {outOfStock ? (
          <span className="absolute left-2 top-2 rounded-full bg-slate-900/80 px-2 py-0.5 text-xs font-semibold text-white">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        {product.category?.name ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            {product.category.name}
          </p>
        ) : null}

        <h3 className="text-base font-semibold text-slate-900">
          {/* The whole card is clickable through this stretched link, so there is still
              exactly one focusable element per card for keyboard users. */}
          <Link href={`/products/${product.id}`} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>

        {product.description ? (
          <p className="text-sm text-slate-600">{truncate(product.description, 96)}</p>
        ) : null}

        <div className="mt-auto pt-2">
          <Price
            priceCents={product.priceCents}
            currency={product.currency}
            className="text-lg font-bold text-slate-900"
          />
        </div>
      </div>
    </article>
  );
}
