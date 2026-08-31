interface AlertProps {
  variant: 'error' | 'success' | 'info';
  children: React.ReactNode;
  className?: string;
}

const STYLES: Record<AlertProps['variant'], string> = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-brand-200 bg-brand-50 text-brand-800',
};

/**
 * role="alert" makes screen readers announce the message as soon as it appears,
 * which is what a form submission result needs.
 */
export function Alert({ variant, children, className = '' }: AlertProps) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-4 py-3 text-sm ${STYLES[variant]} ${className}`}
    >
      {children}
    </div>
  );
}
