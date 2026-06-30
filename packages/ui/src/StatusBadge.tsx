import type { ReactElement } from 'react';

const TONES: Record<string, string> = {
  ready: '#16a34a',
  dirty: '#d97706',
  maintenance: '#dc2626',
  blocked: '#6b7280',
  confirmed: '#16a34a',
  pending: '#d97706',
  cancelled: '#dc2626',
};

/** Tiny shared component so the design language is consistent across apps. */
export function StatusBadge({ status }: { status: string }): ReactElement {
  const color = TONES[status] ?? '#6b7280';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 10px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color,
        background: `${color}1a`,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
      {status}
    </span>
  );
}
