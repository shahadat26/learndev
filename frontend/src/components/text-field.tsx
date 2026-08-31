interface TextFieldProps {
  id: string;
  name: string;
  label: string;
  type?: 'text' | 'email' | 'password';
  defaultValue?: string;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  hint?: string;
  error?: string;
}

/**
 * Label + input + error message, wired together with aria-describedby and
 * aria-invalid so assistive technology gets the same information as a sighted user.
 */
export function TextField({
  id,
  name,
  label,
  type = 'text',
  defaultValue,
  placeholder,
  autoComplete,
  required = false,
  hint,
  error,
}: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label}
        {required ? (
          <span className="ml-0.5 text-red-600" aria-hidden="true">
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-slate-400">optional</span>
        )}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`input ${error ? 'input-invalid' : ''}`}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
