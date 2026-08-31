'use client';

import { useActionState } from 'react';

import { updateProfileAction } from '@/app/actions/profile';
import { Alert } from '@/components/alert';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { fieldError, initialFormState, type FormState } from '@/lib/form-state';

interface ProfileFormProps {
  firstName: string;
  lastName: string;
}

export function ProfileForm({ firstName, lastName }: ProfileFormProps) {
  const [state, formAction] = useActionState<FormState, FormData>(
    updateProfileAction,
    initialFormState,
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {state.message ? (
        <Alert variant={state.status === 'success' ? 'success' : 'error'}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="profile-first-name"
          name="firstName"
          label="First name"
          autoComplete="given-name"
          defaultValue={state.values?.firstName ?? firstName}
          error={fieldError(state, 'firstName')}
        />
        <TextField
          id="profile-last-name"
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          defaultValue={state.values?.lastName ?? lastName}
          error={fieldError(state, 'lastName')}
        />
      </div>

      {fieldError(state, '_form') ? (
        <p className="text-xs font-medium text-red-600">{fieldError(state, '_form')}</p>
      ) : null}

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
