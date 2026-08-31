interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-10 w-10 text-slate-300"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 9.75h16.5M4.5 6.75h15a.75.75 0 0 1 .75.75v9a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 16.5v-9a.75.75 0 0 1 .75-.75Z"
        />
      </svg>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      {description ? <p className="max-w-md text-sm text-slate-600">{description}</p> : null}
      {action}
    </div>
  );
}
