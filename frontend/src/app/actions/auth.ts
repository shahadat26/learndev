'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { accountApi } from '@/lib/api/account';
import { isApiError } from '@/lib/api/client';
import { describeApiError } from '@/lib/api/error-message';
import { clearSessionCookies, getSessionTokens, setSessionCookies } from '@/lib/auth/session';
import type { FormState } from '@/lib/form-state';
import { safeRedirectPath } from '@/lib/url';
import { fieldErrorsFromZod, formValue, loginSchema, registerSchema } from '@/lib/validation';

/**
 * Authentication server actions.
 *
 * Everything here runs on the server: the credentials are posted to this process,
 * exchanged for tokens against account-service, and the tokens are written straight
 * into httpOnly cookies. They are never returned to the browser, so no client
 * component - and no XSS payload - can read them.
 */

export async function loginAction(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = formValue(formData, 'email');
  // The password is deliberately absent from `values`: never echo a credential back.
  const values = { email };
  const next = safeRedirectPath(formValue(formData, 'next'), '/profile');

  const parsed = loginSchema.safeParse({ email, password: formValue(formData, 'password') });
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  try {
    const auth = await accountApi.login(parsed.data);
    await setSessionCookies(auth);
  } catch (error) {
    // A wrong password and an unknown email must look identical, otherwise the form
    // becomes an account-enumeration oracle.
    if (isApiError(error) && (error.isUnauthorized || error.status === 400)) {
      return { status: 'error', message: 'Invalid email or password.', values };
    }
    return { status: 'error', message: describeApiError(error, 'Unable to sign in.'), values };
  }

  // The header renders the signed-in state, so the whole layout has to be refreshed.
  revalidatePath('/', 'layout');
  // redirect() works by throwing, so it must never sit inside a try/catch.
  redirect(next);
}

export async function registerAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const input = {
    email: formValue(formData, 'email'),
    password: formValue(formData, 'password'),
    confirmPassword: formValue(formData, 'confirmPassword'),
    firstName: formValue(formData, 'firstName'),
    lastName: formValue(formData, 'lastName'),
  };
  const values = {
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
  };
  const next = safeRedirectPath(formValue(formData, 'next'), '/profile');

  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  try {
    const auth = await accountApi.register({
      email: parsed.data.email,
      password: parsed.data.password,
      // Omit empty optional fields instead of sending "".
      firstName: parsed.data.firstName || undefined,
      lastName: parsed.data.lastName || undefined,
    });
    await setSessionCookies(auth);
  } catch (error) {
    if (isApiError(error) && error.status === 409) {
      return {
        status: 'error',
        message: 'An account with that email already exists.',
        fieldErrors: { email: ['An account with that email already exists.'] },
        values,
      };
    }
    return {
      status: 'error',
      message: describeApiError(error, 'Unable to create your account.'),
      values,
    };
  }

  revalidatePath('/', 'layout');
  redirect(next);
}

export async function logoutAction(): Promise<void> {
  const { refreshToken } = await getSessionTokens();

  if (refreshToken) {
    try {
      // Revoke server-side as well: clearing the cookie alone would leave a valid
      // refresh token in circulation for the rest of its 7 day lifetime.
      await accountApi.logout(refreshToken);
    } catch (error) {
      console.warn('[auth] logout call failed, clearing cookies anyway', error);
    }
  }

  await clearSessionCookies();
  revalidatePath('/', 'layout');
  redirect('/');
}
