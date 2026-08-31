import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatDate, formatPrice, fullName, initials, truncate } from './format.ts';

describe('formatPrice', () => {
  it('turns integer minor units into a decimal only at the last moment', () => {
    assert.equal(formatPrice(0), '$0.00');
    assert.equal(formatPrice(5), '$0.05');
    assert.equal(formatPrice(1999), '$19.99');
  });

  it('groups thousands on a large amount', () => {
    assert.equal(formatPrice(123456789), '$1,234,567.89');
    assert.equal(formatPrice(99999999999), '$999,999,999.99');
  });

  it('drifts by a cent only far outside the range a price lives in', () => {
    // `priceCents / 100` is an IEEE-754 divide, so an absurd amount rounds down: this one
    // is 90071992547409.849999... Pinned rather than hidden - it is the reason money is
    // stored, transported and compared as integer minor units everywhere else in the lab.
    assert.equal(formatPrice(Number.MAX_SAFE_INTEGER - 6), '$90,071,992,547,409.84');
  });

  it('always shows two fraction digits, including for a whole amount', () => {
    assert.equal(formatPrice(1000), '$10.00');
  });

  it('falls back to a plain number rather than crashing on a bad currency code', () => {
    // Intl throws a RangeError on anything that is not a three-letter code, and a page
    // must not 500 because one row in the catalogue has a typo in `currency`.
    assert.equal(formatPrice(1050, 'DOLLARS'), '10.50 DOLLARS');
  });
});

describe('formatDate', () => {
  it('renders a medium date', () => {
    // Asserted by shape, not by a literal: the output depends on the runner's timezone.
    assert.match(formatDate('2024-03-15T12:00:00.000Z'), /^[A-Z][a-z]{2} \d{1,2}, 2024$/);
  });

  it('shows a dash instead of "Invalid Date" for missing or unparseable input', () => {
    assert.equal(formatDate(undefined), '-');
    assert.equal(formatDate(null), '-');
    assert.equal(formatDate(''), '-');
    assert.equal(formatDate('not a date'), '-');
  });
});

describe('fullName', () => {
  it('joins the names that are present', () => {
    assert.equal(
      fullName({ firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com' }),
      'Ada Lovelace',
    );
    assert.equal(fullName({ firstName: 'Ada', lastName: null, email: 'ada@example.com' }), 'Ada');
  });

  it('falls back to the email, which is the only field the profile requires', () => {
    assert.equal(
      fullName({ firstName: null, lastName: null, email: 'ada@example.com' }),
      'ada@example.com',
    );
  });
});

describe('initials', () => {
  it('takes the first letter of the first two words', () => {
    assert.equal(initials('Ada Lovelace'), 'AL');
    assert.equal(initials('Ada Byron King Lovelace'), 'AB');
    assert.equal(initials('ada'), 'A');
  });

  it('ignores punctuation, so an email address still yields something', () => {
    assert.equal(initials('ada@example.com'), 'AE');
  });

  it('never returns an empty avatar label', () => {
    assert.equal(initials(''), '?');
    assert.equal(initials('!!!'), '?');
  });
});

describe('truncate', () => {
  it('leaves a short value untouched', () => {
    assert.equal(truncate('short', 10), 'short');
    assert.equal(truncate('exactlyten', 10), 'exactlyten');
  });

  it('replaces the overflow with a single ellipsis character', () => {
    // The ellipsis takes the last slot, so the result is never longer than `max`.
    const result = truncate('abcdefghijkl', 10);
    assert.equal(result, 'abcdefghi…');
    assert.equal(result.length, 10);
  });

  it('does not leave a dangling space before the ellipsis', () => {
    assert.equal(truncate('hello world', 7), 'hello…');
  });
});
