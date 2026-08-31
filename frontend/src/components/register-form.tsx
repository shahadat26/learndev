'use client';

import { useActionState } from 'react';

import { registerAction } from '@/app/actions/auth';
import { Alert } from '@/components/alert';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { fieldError, initialFormState, type FormState } from '@/lib/form-state';

interface RegisterFormProps {
  next?: string;
}

export function RegisterForm({ next }: RegisterFormProps) {
  const [state, formAction] = useActionState<FormState, FormData>(registerAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.status === 'error' && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          id="register-first-name"
          name="firstName"
          label="First name"
          autoComplete="given-name"
          defaultValue={state.values?.firstName}
          error={fieldError(state, 'firstName')}
        />
        <TextField
          id="register-last-name"
          name="lastName"
          label="Last name"
          autoComplete="family-name"
          defaultValue={state.values?.lastName}
          error={fieldError(state, 'lastName')}
        />
      </div>

      <TextField
        id="register-email"
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        defaultValue={state.values?.email}
        error={fieldError(state, 'email')}
      />

      <TextField
        id="register-password"
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="new-password"
        hint="At least 8 characters, including a letter and a number."
        error={fieldError(state, 'password')}
      />

      <TextField
        id="register-confirm-password"
        name="confirmPassword"
        label="Confirm password"
        type="password"
        required
        autoComplete="new-password"
        error={fieldError(state, 'confirmPassword')}
      />

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}
