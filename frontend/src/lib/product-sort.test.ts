import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normaliseProductSort, PRODUCT_SORT_OPTIONS, selectedSortValue } from './product-sort.ts';

describe('normaliseProductSort', () => {
  it('passes through every value product-service accepts', () => {
    for (const field of ['createdAt', 'updatedAt', 'name', 'priceCents', 'stock']) {
      assert.equal(normaliseProductSort(`${field}:asc`), `${field}:asc`);
      assert.equal(normaliseProductSort(`${field}:desc`), `${field}:desc`);
    }
  });

  it('drops anything outside the whitelist', () => {
    // These are the shapes a curious user actually types. Forwarding any of them would
    // come back as a 400 and throw the listing into error.tsx.
    assert.equal(normaliseProductSort('cheapest'), undefined);
    assert.equal(normaliseProductSort('price:asc'), undefined);
    assert.equal(normaliseProductSort('name'), undefined);
    assert.equal(normaliseProductSort('name:ASC'), undefined);
    assert.equal(normaliseProductSort('name:asc,stock:desc'), undefined);
    assert.equal(normaliseProductSort(''), undefined);
    assert.equal(normaliseProductSort(undefined), undefined);
  });

  it('is not fooled by inherited Object properties', () => {
    // The whitelist is a Set, not an object literal, so `?sort=constructor` is just a miss.
    assert.equal(normaliseProductSort('constructor'), undefined);
    assert.equal(normaliseProductSort('__proto__'), undefined);
  });
});

describe('PRODUCT_SORT_OPTIONS', () => {
  it('only offers values the API would accept', () => {
    for (const option of PRODUCT_SORT_OPTIONS) {
      if (option.value === '') {
        continue; // "Newest first" means: leave `sort` out and take the service default.
      }
      assert.equal(normaliseProductSort(option.value), option.value, option.label);
    }
  });
});

describe('selectedSortValue', () => {
  it('echoes a value the picker can display', () => {
    assert.equal(selectedSortValue('priceCents:desc'), 'priceCents:desc');
  });

  it('falls back to the default option for URL-only and invalid values', () => {
    // `stock:asc` is valid on the API but has no <option>, so the picker must not try to
    // select it - a <select> with an unknown value silently shows the first entry instead.
    assert.equal(selectedSortValue('stock:asc'), '');
    assert.equal(selectedSortValue('cheapest'), '');
    assert.equal(selectedSortValue(undefined), '');
  });
});
