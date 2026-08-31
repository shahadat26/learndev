import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

// Specs import the module under test by its real `.ts` path. Node 24 strips the types
// itself (no transpile step, no test framework), which is why the import needs the
// extension the file actually has - see the note in README.md.
import { buildUrl, firstParam, positiveInt, safeRedirectPath, uuidParam } from './url.ts';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';

describe('firstParam', () => {
  it('takes the first value when Next.js hands over a repeated key', () => {
    assert.equal(firstParam(['red', 'blue']), 'red');
  });

  it('trims surrounding whitespace', () => {
    assert.equal(firstParam('  shoes  '), 'shoes');
  });

  it('treats blank and missing values as absent', () => {
    assert.equal(firstParam(undefined), undefined);
    assert.equal(firstParam(''), undefined);
    assert.equal(firstParam('   '), undefined);
    assert.equal(firstParam([]), undefined);
  });
});

describe('positiveInt', () => {
  it('parses a usable value', () => {
    assert.equal(positiveInt('3', 1), 3);
  });

  it('falls back on anything that is not a positive integer', () => {
    assert.equal(positiveInt(undefined, 1), 1);
    assert.equal(positiveInt('0', 1), 1);
    assert.equal(positiveInt('-5', 1), 1);
    assert.equal(positiveInt('abc', 1), 1);
    assert.equal(positiveInt('', 1), 1);
  });

  it('clamps to the maximum instead of forwarding a huge limit', () => {
    // Without the clamp a hand-typed `?limit=100000` would ask product-service for the
    // whole catalogue in one response - and be rejected with a 400 for exceeding @Max().
    assert.equal(positiveInt('100000', 12, 48), 48);
    assert.equal(positiveInt('48', 12, 48), 48);
  });

  it('parses the leading digits of a partly numeric value', () => {
    // Number.parseInt stops at the first non-digit, so `?page=12abc` degrades to page 12
    // rather than to the fallback. Documented here so the behaviour is a choice, not a surprise.
    assert.equal(positiveInt('12abc', 1), 12);
  });
});

describe('uuidParam', () => {
  it('accepts a UUID in either case', () => {
    assert.equal(uuidParam(UUID), UUID);
    assert.equal(uuidParam(UUID.toUpperCase()), UUID.toUpperCase());
  });

  it('drops anything the services would answer with a 400', () => {
    assert.equal(uuidParam('shoes'), undefined);
    assert.equal(uuidParam(`${UUID}x`), undefined);
    assert.equal(uuidParam(UUID.replace(/-/g, '')), undefined);
    assert.equal(uuidParam(undefined), undefined);
  });
});

describe('buildUrl', () => {
  it('returns the bare path when every value is empty', () => {
    assert.equal(buildUrl('/products', { search: undefined, sort: '' }), '/products');
    assert.equal(buildUrl('/products', {}), '/products');
  });

  it('keeps zero, which is a real value, and drops the empty string, which is not', () => {
    assert.equal(buildUrl('/products', { page: 0, search: '' }), '/products?page=0');
  });

  it('percent-encodes the values it keeps', () => {
    assert.equal(
      buildUrl('/products', { search: 'red shoes', categoryId: UUID }),
      `/products?search=red+shoes&categoryId=${UUID}`,
    );
    assert.equal(buildUrl('/products', { search: 'a&b=c' }), '/products?search=a%26b%3Dc');
  });
});

describe('safeRedirectPath', () => {
  it('keeps a same-site absolute path', () => {
    assert.equal(safeRedirectPath('/profile'), '/profile');
    assert.equal(safeRedirectPath('/products?page=2'), '/products?page=2');
  });

  it('refuses every open-redirect shape', () => {
    // Each of these would send the user to another origin if it were passed through.
    assert.equal(safeRedirectPath('//evil.example'), '/');
    assert.equal(safeRedirectPath('https://evil.example'), '/');
    assert.equal(safeRedirectPath('/\\evil.example'), '/');
    assert.equal(safeRedirectPath('javascript:alert(1)'), '/');
    assert.equal(safeRedirectPath('profile'), '/');
  });

  it('uses the caller fallback for a missing value', () => {
    assert.equal(safeRedirectPath(undefined), '/');
    assert.equal(safeRedirectPath(null), '/');
    assert.equal(safeRedirectPath('', '/login'), '/login');
  });
});
