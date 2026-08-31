'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { accountApi } from '@/lib/api/account';
import { describeApiError } from '@/lib/api/error-message';
import { SessionExpiredError, withAccessToken } from '@/lib/auth/session';
import type { FormState } from '@/lib/form-state';
import type { User } from '@/lib/types';
import { fieldErrorsFromZod, formValue, updateProfileSchema } from '@/lib/validation';

/**
 * Profile server action.
 *
 * `withAccessToken` is the refresh-on-401 helper: if the access token expired
 * between the page render and this submit, it rotates the refresh token once,
 * persists the new pair and retries - which is legal here because a Server Action
 * may write cookies.
 */
export async function updateProfileAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    firstName: formValue(formData, 'firstName'),
    lastName: formValue(formData, 'lastName'),
  };

  const parsed = updateProfileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Please correct the highlighted fields.',
      fieldErrors: fieldErrorsFromZod(parsed.error),
      values,
    };
  }

  let updated: User;
  try {
    updated = await withAccessToken((accessToken) =>
      accountApi.updateProfile(accessToken, {
        // Send both fields verbatim, empty string included. PATCH semantics in
        // account-service are "assign every key the caller sent", so mapping "" to
        // undefined would drop the field from the body and silently keep the old
        // name - the form would then redisplay it under a green "Profile updated."
        // banner. An emptied input is an instruction to clear the column.
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
      }),
    );
  } catch (error) {
    if (error instanceof SessionExpiredError) {
      // Safe inside a catch: nothing above swallows the redirect signal it throws.
      redirect('/login?next=/profile');
    }
    return {
      status: 'error',
      message: describeApiError(error, 'Unable to update your profile.'),
      values,
    };
  }

  // The header greets the user by name, so refresh the layout as well as the page.
  revalidatePath('/profile');
  revalidatePath('/', 'layout');

  return {
    status: 'success',
    message: 'Profile updated.',
    values: {
      firstName: updated.firstName ?? '',
      lastName: updated.lastName ?? '',
    },
  };
}
