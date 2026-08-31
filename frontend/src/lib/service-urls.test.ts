import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { getAccountApiUrl, getProductApiUrl, normalizeBaseUrl } from './service-urls.ts';

describe('normalizeBaseUrl', () => {
  it('strips a trailing slash so `${base}${path}` never doubles it', () => {
    // `http://svc//products` is a different path to most routers, and Nest answers 404.
    assert.equal(
      normalizeBaseUrl('http://product-service:3007/', 'http://fallback'),
      'http://product-service:3007',
    );
    assert.equal(
      normalizeBaseUrl('http://product-service:3007///', 'http://fallback'),
      'http://product-service:3007',
    );
  });

  it('leaves an already clean value alone, path prefixes included', () => {
    assert.equal(
      normalizeBaseUrl('http://localhost/api', 'http://fallback'),
      'http://localhost/api',
    );
  });

  it('trims the whitespace a .env file leaves behind', () => {
    assert.equal(
      normalizeBaseUrl('  http://localhost:3007  ', 'http://fallback'),
      'http://localhost:3007',
    );
  });

  it('falls back when the variable is unset or blank', () => {
    // An empty string in the environment is the same as "not configured" - otherwise every
    // request would be sent to a relative URL and fail with an unhelpful parse error.
    assert.equal(normalizeBaseUrl(undefined, 'http://fallback'), 'http://fallback');
    assert.equal(normalizeBaseUrl('', 'http://fallback'), 'http://fallback');
    assert.equal(normalizeBaseUrl('   ', 'http://fallback'), 'http://fallback');
  });
});

describe('the two service URLs', () => {
  const saved = { account: process.env.API_ACCOUNT_URL, product: process.env.API_PRODUCT_URL };

  /** `delete`, not `= undefined`: assigning undefined would store the string "undefined". */
  function restore(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }

  afterEach(() => {
    restore('API_ACCOUNT_URL', saved.account);
    restore('API_PRODUCT_URL', saved.product);
  });

  it('defaults to the localhost ports used when the services run outside Docker', () => {
    delete process.env.API_ACCOUNT_URL;
    delete process.env.API_PRODUCT_URL;
    assert.equal(getAccountApiUrl(), 'http://localhost:3006');
    assert.equal(getProductApiUrl(), 'http://localhost:3007');
  });

  it('reads the environment on every call, so a restart with a new value takes effect', () => {
    process.env.API_PRODUCT_URL = 'http://product-service:3007/';
    assert.equal(getProductApiUrl(), 'http://product-service:3007');
    process.env.API_PRODUCT_URL = 'http://traefik/api/products';
    assert.equal(getProductApiUrl(), 'http://traefik/api/products');
  });
});
