'use client';

import { useActionState } from 'react';

import { loginAction } from '@/app/actions/auth';
import { Alert } from '@/components/alert';
import { SubmitButton } from '@/components/submit-button';
import { TextField } from '@/components/text-field';
import { fieldError, initialFormState, type FormState } from '@/lib/form-state';

interface LoginFormProps {
  /** Path to return to after a successful sign in. Already sanitised on the server. */
  next?: string;
}

export function LoginForm({ next }: LoginFormProps) {
  // useActionState keeps the server action's return value as form state and gives
  // the form progressive enhancement: it posts even before React has hydrated.
  const [state, formAction] = useActionState<FormState, FormData>(loginAction, initialFormState);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      {state.status === 'error' && state.message ? (
        <Alert variant="error">{state.message}</Alert>
      ) : null}

      <TextField
        id="login-email"
        name="email"
        label="Email"
        type="email"
        required
        autoComplete="email"
        defaultValue={state.values?.email}
        error={fieldError(state, 'email')}
      />

      <TextField
        id="login-password"
        name="password"
        label="Password"
        type="password"
        required
        autoComplete="current-password"
        error={fieldError(state, 'password')}
      />

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
