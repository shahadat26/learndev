/**
 * Shape returned by every server action and consumed by `useActionState` in the
 * client forms. Deliberately serialisable: it crosses the server/client boundary.
 */
export interface FormState {
  status: 'idle' | 'error' | 'success';
  /** Human readable summary, rendered in an alert above the form. */
  message?: string;
  /** Per-field validation messages, keyed by the input `name`. */
  fieldErrors?: Record<string, string[]>;
  /** Non-secret values echoed back so a failed submit does not wipe the form. */
  values?: Record<string, string>;
}

export const initialFormState: FormState = { status: 'idle' };

export function fieldError(state: FormState, field: string): string | undefined {
  return state.fieldErrors?.[field]?.[0];
}
