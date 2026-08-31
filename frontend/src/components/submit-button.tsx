'use client';

import { useFormStatus } from 'react-dom';

interface SubmitButtonProps {
  children: React.ReactNode;
  /** Label shown while the enclosing form is being submitted. */
  pendingLabel?: string;
  className?: string;
}

/**
 * useFormStatus reads the pending state of the *parent* form, which is why this is
 * a separate client component: the form itself can stay a server component.
 */
export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn-primary',
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}
