import type { User } from '@/lib/types';

/**
 * Presentation helpers. Safe to import from both server and client components:
 * no environment access, no secrets, no network.
 */

/**
 * Money arrives as an integer number of minor units (`priceCents`) plus a currency
 * code, and is only turned into a decimal at the very last moment - here.
 */
export function formatPrice(priceCents: number, currency = 'USD'): string {
  const amount = priceCents / 100;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code: fall back to a plain number rather than crashing a page.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function formatDate(value: string | undefined | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function fullName(user: Pick<User, 'firstName' | 'lastName' | 'email'>): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return name.length > 0 ? name : user.email;
}

export function initials(value: string): string {
  const parts = value
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(' ')
    .filter(Boolean);
  const letters = parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase());
  return letters.join('') || '?';
}

export function truncate(value: string, max = 140): string {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}
