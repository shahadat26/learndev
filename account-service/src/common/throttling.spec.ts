import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerOptions } from '@nestjs/throttler';

import {
  SKIP_ALL_THROTTLERS,
  THROTTLE_CREDENTIAL_LIMIT,
  THROTTLE_IP_LIMIT,
  throttlerOptions,
} from './throttling';

/**
 * The rate limiter is the only thing standing between a public, bcrypt-backed
 * login endpoint and unlimited credential stuffing, and its interesting logic
 * lives in two small callbacks rather than in a controller. They are worth
 * pinning down: a tracker that silently keyed everything to the same bucket, or
 * a `skipIf` that accidentally returned true for login, would disable the
 * protection without failing anything else.
 */

const throttlers: ThrottlerOptions[] = Array.isArray(throttlerOptions)
  ? throttlerOptions
  : throttlerOptions.throttlers;

function throttlerNamed(name: string): ThrottlerOptions {
  const found = throttlers.find((entry) => entry.name === name);

  if (!found) {
    throw new Error(`the "${name}" throttler must be configured`);
  }

  return found;
}

const ip = throttlerNamed('ip');
const credential = throttlerNamed('credential');

/** A stand-in for the Express request/ExecutionContext pair the guard passes in. */
function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function trackerFor(request: Record<string, unknown>): Promise<string> {
  if (!credential.getTracker) {
    throw new Error('the credential throttler must define a tracker');
  }
  // The hook is allowed to be sync or async; normalise so the tests can await.
  return Promise.resolve(credential.getTracker(request, contextFor(request)));
}

describe('throttler configuration', () => {
  it('applies a blunt per-address ceiling to every route', () => {
    expect(ip.limit).toBe(THROTTLE_IP_LIMIT);
    expect(ip.ttl).toBe(60_000);
  });

  it('caps attempts against a single email far more tightly', () => {
    expect(credential.limit).toBe(THROTTLE_CREDENTIAL_LIMIT);
    expect(THROTTLE_CREDENTIAL_LIMIT).toBeLessThan(THROTTLE_IP_LIMIT);
  });

  describe('the credential bucket', () => {
    it('keys on the trusted forwarded address and the email together', async () => {
      await expect(
        trackerFor({ ips: ['203.0.113.7'], ip: '10.0.0.2', body: { email: 'a@shop.local' } }),
      ).resolves.toBe('203.0.113.7|a@shop.local');
    });

    it('normalises the email so casing cannot buy extra attempts', async () => {
      const mixedCase = await trackerFor({ ip: '10.0.0.2', body: { email: '  A@Shop.Local ' } });
      const lowerCase = await trackerFor({ ip: '10.0.0.2', body: { email: 'a@shop.local' } });

      expect(mixedCase).toBe(lowerCase);
    });

    it('separates two accounts guessed from the same address', async () => {
      const first = await trackerFor({ ip: '10.0.0.2', body: { email: 'a@shop.local' } });
      const second = await trackerFor({ ip: '10.0.0.2', body: { email: 'b@shop.local' } });

      expect(first).not.toBe(second);
    });

    it('separates the same account guessed from two addresses', async () => {
      const first = await trackerFor({ ip: '10.0.0.2', body: { email: 'a@shop.local' } });
      const second = await trackerFor({ ip: '10.0.0.3', body: { email: 'a@shop.local' } });

      expect(first).not.toBe(second);
    });

    it('applies to a request that carries an email', () => {
      expect(credential.skipIf?.(contextFor({ body: { email: 'a@shop.local' } }))).toBe(false);
    });

    it('stands aside for requests with no email, leaving them to the ip bucket', () => {
      expect(credential.skipIf?.(contextFor({ body: { refreshToken: 'x' } }))).toBe(true);
      expect(credential.skipIf?.(contextFor({ body: { email: '   ' } }))).toBe(true);
      expect(credential.skipIf?.(contextFor({ body: { email: 42 } }))).toBe(true);
      expect(credential.skipIf?.(contextFor({}))).toBe(true);
    });
  });

  it('names every configured throttler in the skip list used by the probes', () => {
    expect(Object.keys(SKIP_ALL_THROTTLERS).sort()).toEqual(
      throttlers.map((entry) => entry.name ?? 'default').sort(),
    );
  });
});
