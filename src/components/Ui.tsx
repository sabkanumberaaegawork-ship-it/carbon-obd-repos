export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 max-w-2xl text-sm text-neutral-600">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-neutral-200 bg-white ${className}`}>
      {children}
    </div>
  );
}

export function Metric({
  label,
  value,
  unit,
  hint,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
        {unit && <span className="ml-1 text-base font-normal text-neutral-500">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center">
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mt-1 max-w-md text-sm text-neutral-600">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </Card>
  );
}

export function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-black bg-neutral-50 px-4 py-3 text-sm">
      <span className="font-semibold">Note: </span>
      {children}
    </div>
  );
}

export function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-700">
      {children}
    </span>
  );
}
