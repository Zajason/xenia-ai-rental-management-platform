import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-border-strong bg-surface-2 text-faint">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-text">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
