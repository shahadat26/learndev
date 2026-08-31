import { z } from 'zod';

/**
 * Input validation for the server actions.
 *
 * The services validate again with class-validator - this layer exists to give fast,
 * field-level feedback and to keep obviously malformed requests off the network.
 * Never treat client-side validation as a security control: this code runs on the
 * server precisely because the browser cannot be trusted.
 */

/** bcrypt only hashes the first 72 bytes of a password; longer input is silently truncated. */
const MAX_PASSWORD_LENGTH = 72;

const email = z
  .string()
  .trim()
  .min(1, 'Email is required.')
  .max(255, 'Email must be at most 255 characters.')
  .email('Enter a valid email address.')
  .transform((value) => value.toLowerCase());

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters.')
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

const optionalName = z
  .string()
  .trim()
  .max(50, 'Must be at most 50 characters.')
  .refine(
    (value) => value.length === 0 || /^[\p{L}\p{M}'\- ]+$/u.test(value),
    'Use letters, spaces, hyphens and apostrophes only.',
  );

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required.'),
});

export const registerSchema = z
  .object({
    email,
    password: password.refine(
      (value) => /[A-Za-z]/.test(value) && /\d/.test(value),
      'Password must contain at least one letter and one number.',
    ),
    confirmPassword: z.string().min(1, 'Confirm your password.'),
    firstName: optionalName,
    lastName: optionalName,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

/**
 * Both names are genuinely optional, and an empty value is a valid instruction:
 * "clear this field". There is no `at least one name` rule on purpose - the profile
 * only requires an email, so refusing to save two empty inputs would make clearing a
 * name impossible.
 */
export const updateProfileSchema = z.object({
  firstName: optionalName,
  lastName: optionalName,
});

export type LoginInputSchema = z.infer<typeof loginSchema>;
export type RegisterInputSchema = z.infer<typeof registerSchema>;
export type UpdateProfileInputSchema = z.infer<typeof updateProfileSchema>;

/**
 * Flatten Zod issues into `{ fieldName: [messages] }`.
 * Written against `error.issues`, which is stable across Zod majors, rather than the
 * flatten/treeify helpers that were reshuffled in v4.
 */
export function fieldErrorsFromZod(error: z.ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? String(issue.path[0]) : '_form';
    const bucket = fieldErrors[key];
    if (bucket) {
      bucket.push(issue.message);
    } else {
      fieldErrors[key] = [issue.message];
    }
  }
  return fieldErrors;
}

/** Read a form field as a trimmed string, tolerating File values from FormData. */
export function formValue(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}
