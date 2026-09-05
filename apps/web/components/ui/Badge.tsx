import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'ok' | 'warn' | 'err' | 'accent' | 'purple';

const toneClass: Record<Tone, string> = {
  neutral: 'bg-surface-2 text-muted border-border-strong',
  ok: 'bg-ok-soft text-ok border-ok/25',
  warn: 'bg-warn-soft text-warn border-warn/25',
  err: 'bg-err-soft text-err border-err/25',
  accent: 'bg-accent-soft text-accent border-accent/25',
  purple: 'bg-purple-soft text-purple border-purple/25',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium capitalize ${toneClass[tone]}`}
    >
      <span className="size-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

/** Maps the many status enums across the API to a consistent color language. */
const STATUS_TONE: Record<string, Tone> = {
  // generic
  ready: 'ok',
  active: 'ok',
  confirmed: 'ok',
  accepted: 'ok',
  completed: 'ok',
  resolved: 'ok',
  paid: 'ok',
  online: 'ok',
  open: 'accent',
  assigned: 'accent',
  processing: 'accent',
  pending: 'warn',
  offered: 'warn',
  dirty: 'warn',
  triaged: 'warn',
  in_progress: 'warn',
  suggested: 'warn',
  modified: 'warn',
  handoff: 'purple',
  maintenance: 'err',
  blocked: 'err',
  cancelled: 'err',
  failed: 'err',
  revoked: 'err',
  expired: 'err',
  rejected: 'err',
};

export function statusTone(status: string): Tone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={statusTone(status)}>{status.replace(/_/g, ' ')}</Badge>;
}
