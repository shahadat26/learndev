/**
 * Minimal JWT payload reader.
 *
 * SECURITY: this DECODES, it never VERIFIES. The signature is checked by the
 * services, which own the secrets; the storefront holds no JWT secret at all.
 * The decoded `exp` claim is used for exactly one thing - giving the cookie the
 * same lifetime as the token it carries - and never for an authorisation decision.
 *
 * Uses only Web APIs (atob) so it also runs in the Edge middleware runtime.
 */

interface JwtPayload {
  exp?: number;
  [claim: string]: unknown;
}

function base64UrlDecode(segment: string): string | null {
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  try {
    return atob(padded);
  } catch {
    return null;
  }
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const segment = token.split('.')[1];
  if (!segment) {
    return null;
  }
  const json = base64UrlDecode(segment);
  if (!json) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null ? (parsed as JwtPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Seconds remaining until the token expires, or the fallback when the token
 * carries no usable `exp`.
 */
export function secondsUntilExpiry(token: string, fallbackSeconds: number): number {
  const exp = decodeJwtPayload(token)?.exp;
  if (typeof exp !== 'number') {
    return fallbackSeconds;
  }
  const remaining = Math.floor(exp - Date.now() / 1000);
  return remaining > 0 ? remaining : fallbackSeconds;
}
