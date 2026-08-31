import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';

import {
  fieldErrorsFromZod,
  formValue,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from './validation.ts';

/** Collect the messages Zod produced for one field, in the shape the forms consume. */
function errorsFor(error: z.ZodError | undefined, field: string): string[] {
  assert.ok(error, 'expected the schema to reject this input');
  return fieldErrorsFromZod(error)[field] ?? [];
}

describe('loginSchema', () => {
  it('normalises the email so "Ada@Example.COM" and "ada@example.com" are one account', () => {
    const result = loginSchema.safeParse({ email: '  Ada@Example.COM  ', password: 'secret' });
    assert.equal(result.success, true);
    assert.equal(result.data?.email, 'ada@example.com');
  });

  it('rejects a malformed email with the message the form renders', () => {
    const result = loginSchema.safeParse({ email: 'ada@', password: 'secret' });
    assert.deepEqual(errorsFor(result.error, 'email'), ['Enter a valid email address.']);
  });

  it('only requires the password to be present - length rules belong to registration', () => {
    assert.equal(loginSchema.safeParse({ email: 'ada@example.com', password: 'x' }).success, true);
    const result = loginSchema.safeParse({ email: 'ada@example.com', password: '' });
    assert.deepEqual(errorsFor(result.error, 'password'), ['Password is required.']);
  });

  it('rejects a missing field instead of coercing undefined to ""', () => {
    assert.equal(loginSchema.safeParse({ email: 'ada@example.com' }).success, false);
  });
});

describe('registerSchema', () => {
  const valid = {
    email: 'ada@example.com',
    password: 'passw0rd',
    confirmPassword: 'passw0rd',
    firstName: 'Ada',
    lastName: 'Lovelace',
  };

  it('accepts a well formed registration', () => {
    assert.equal(registerSchema.safeParse(valid).success, true);
  });

  it('requires both a letter and a digit in the password', () => {
    const result = registerSchema.safeParse({
      ...valid,
      password: 'password',
      confirmPassword: 'password',
    });
    assert.deepEqual(errorsFor(result.error, 'password'), [
      'Password must contain at least one letter and one number.',
    ]);
  });

  it('enforces the 8 character minimum', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'pw0', confirmPassword: 'pw0' });
    assert.deepEqual(errorsFor(result.error, 'password'), [
      'Password must be at least 8 characters.',
    ]);
  });

  it('refuses a password longer than the 72 bytes bcrypt would hash', () => {
    // bcrypt silently truncates past 72 bytes, so a 100 character password would give the
    // user a false sense of strength and let a 72 character prefix log them in.
    const tooLong = `${'a1'.repeat(36)}x`;
    const result = registerSchema.safeParse({
      ...valid,
      password: tooLong,
      confirmPassword: tooLong,
    });
    assert.deepEqual(errorsFor(result.error, 'password'), [
      'Password must be at most 72 characters.',
    ]);
  });

  it('reports a mismatch on confirmPassword, which is the field the user must fix', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'passw0rD' });
    assert.deepEqual(errorsFor(result.error, 'confirmPassword'), ['Passwords do not match.']);
    assert.deepEqual(errorsFor(result.error, 'password'), []);
  });

  it('accepts names with accents, hyphens and apostrophes but not digits', () => {
    assert.equal(
      registerSchema.safeParse({ ...valid, firstName: 'Ada-Renée', lastName: "O'Brien" }).success,
      true,
    );
    const result = registerSchema.safeParse({ ...valid, firstName: 'Ada2' });
    assert.deepEqual(errorsFor(result.error, 'firstName'), [
      'Use letters, spaces, hyphens and apostrophes only.',
    ]);
  });
});

describe('updateProfileSchema', () => {
  it('treats an empty name as the instruction "clear this field"', () => {
    const result = updateProfileSchema.safeParse({ firstName: '', lastName: '' });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { firstName: '', lastName: '' });
  });

  it('trims before it measures, so 50 characters of padding still fit', () => {
    const result = updateProfileSchema.safeParse({ firstName: '  Ada  ', lastName: 'Lovelace' });
    assert.equal(result.data?.firstName, 'Ada');
  });

  it('rejects a name over 50 characters', () => {
    const result = updateProfileSchema.safeParse({ firstName: 'a'.repeat(51), lastName: '' });
    assert.deepEqual(errorsFor(result.error, 'firstName'), ['Must be at most 50 characters.']);
  });
});

describe('fieldErrorsFromZod', () => {
  it('buckets every issue under the first path segment', () => {
    const result = z
      .object({ email: z.string().email('Bad email.').max(5, 'Too long.') })
      .safeParse({ email: 'not-an-email-at-all' });
    assert.ok(result.error, 'expected the schema to reject this input');
    const fieldErrors = fieldErrorsFromZod(result.error);
    assert.deepEqual(Object.keys(fieldErrors), ['email']);
    assert.deepEqual(fieldErrors.email?.toSorted(), ['Bad email.', 'Too long.']);
  });

  it('files a form-level issue under _form so it can be rendered in the alert', () => {
    const result = z
      .object({})
      .refine(() => false, 'Something is wrong with this form.')
      .safeParse({});
    assert.ok(result.error, 'expected the schema to reject this input');
    assert.deepEqual(fieldErrorsFromZod(result.error), {
      _form: ['Something is wrong with this form.'],
    });
  });
});

describe('formValue', () => {
  it('reads a string field', () => {
    const form = new FormData();
    form.set('email', 'ada@example.com');
    assert.equal(formValue(form, 'email'), 'ada@example.com');
  });

  it('returns "" for a missing field and for an uploaded File', () => {
    // A crafted multipart body can send a File where the action expects text; the schema
    // should see an empty string and reject it, not receive a File object.
    const form = new FormData();
    form.set('avatar', new File(['x'], 'avatar.png'));
    assert.equal(formValue(form, 'avatar'), '');
    assert.equal(formValue(form, 'missing'), '');
  });
});
