import { type ExecutionContext } from '@nestjs/common';
import { type ThrottlerOptions } from '@nestjs/throttler';

import {
  SKIP_ALL_THROTTLERS,
  THROTTLE_IP_LIMIT,
  THROTTLE_WRITE_LIMIT,
  throttlerOptions,
} from './throttling';

/**
 * The rate limiter is the only thing capping how fast a stolen ADMIN token can
 * rewrite the catalogue, and its interesting logic lives in two small callbacks
 * rather than in a controller. They are worth pinning down: a `skipIf` that
 * accidentally returned true for POST would disable the tight bucket entirely,
 * and a tracker that keyed everything to one string would throttle every client
 * together - neither would fail any other test.
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
const write = throttlerNamed('write');

/** A stand-in for the Express request/ExecutionContext pair the guard passes in. */
function contextFor(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function trackerFor(request: Record<string, unknown>): Promise<string> {
  if (!write.getTracker) {
    throw new Error('the write throttler must define a tracker');
  }
  // The hook is allowed to be sync or async; normalise so the tests can await.
  return Promise.resolve(write.getTracker(request, contextFor(request)));
}

describe('throttler configuration', () => {
  it('applies a blunt per-address ceiling to every route', () => {
    expect(ip.limit).toBe(THROTTLE_IP_LIMIT);
    expect(ip.ttl).toBe(60_000);
  });

  it('caps mutating requests far more tightly than reads', () => {
    expect(write.limit).toBe(THROTTLE_WRITE_LIMIT);
    expect(THROTTLE_WRITE_LIMIT).toBeLessThan(THROTTLE_IP_LIMIT);
  });

  it('leaves the read ceiling generous enough for a page of the catalogue', () => {
    // A product grid fires several requests per view, and every server-rendered
    // page shares the frontend container's address.
    expect(THROTTLE_IP_LIMIT).toBeGreaterThanOrEqual(100);
  });

  describe('the write bucket', () => {
    it('applies to every method that changes the catalogue', () => {
      for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
        expect(write.skipIf?.(contextFor({ method }))).toBe(false);
      }
    });

    it('stands aside for reads, leaving them to the ip bucket', () => {
      for (const method of ['GET', 'HEAD', 'OPTIONS']) {
        expect(write.skipIf?.(contextFor({ method }))).toBe(true);
      }
    });

    it('stands aside rather than throwing on a request with no method', () => {
      expect(write.skipIf?.(contextFor({}))).toBe(true);
    });

    it('keys on the trusted forwarded address, not the proxy that delivered it', async () => {
      await expect(
        trackerFor({ ips: ['203.0.113.7'], ip: '10.0.0.2', method: 'POST' }),
      ).resolves.toBe('203.0.113.7');
    });

    it('falls back to the socket address when nothing was forwarded', async () => {
      await expect(trackerFor({ ips: [], ip: '10.0.0.2', method: 'POST' })).resolves.toBe(
        '10.0.0.2',
      );
    });

    it('separates two addresses writing at the same time', async () => {
      const first = await trackerFor({ ip: '10.0.0.2', method: 'POST' });
      const second = await trackerFor({ ip: '10.0.0.3', method: 'POST' });

      expect(first).not.toBe(second);
    });
  });

  it('names every configured throttler in the skip list used by the probes', () => {
    expect(Object.keys(SKIP_ALL_THROTTLERS).sort()).toEqual(
      throttlers.map((entry) => entry.name ?? 'default').sort(),
    );
  });
});
