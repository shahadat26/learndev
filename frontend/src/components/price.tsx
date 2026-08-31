import { formatPrice } from '@/lib/format';

interface PriceProps {
  /** Integer minor units, exactly as stored by product-service. */
  priceCents: number;
  currency?: string;
  className?: string;
}

export function Price({ priceCents, currency = 'USD', className = '' }: PriceProps) {
  return (
    <span className={className} data-price-cents={priceCents}>
      {formatPrice(priceCents, currency)}
    </span>
  );
}
