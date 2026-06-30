import { StatusBadge } from '@xenia/ui';

/**
 * Placeholder operations dashboard. In the real build this is a server component
 * that reads today's arrivals/departures, the task queue, open conversations,
 * and alerts from the API via @xenia/sdk. For now it renders static demo data so
 * the skeleton runs and shows the intended shape.
 */
const arrivals = [
  { unit: 'Caldera Suite', guest: 'Marco Rossi', time: '15:00', status: 'confirmed' },
  { unit: 'Sunset Villa', guest: 'Sophie Dubois', time: '17:30', status: 'pending' },
];

const tasks = [
  { unit: 'Caldera Suite', type: 'cleaning', due: 'Today 11:00', status: 'dirty' },
  { unit: 'Sunset Villa', type: 'inspection', due: 'Today 14:00', status: 'ready' },
];

export default function Dashboard() {
  return (
    <main style={{ maxWidth: 980, margin: '0 auto', padding: '40px 24px' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ margin: 0, fontSize: 28 }}>Xenia</h1>
        <p style={{ color: 'var(--muted)', marginTop: 4 }}>
          The AI operating system for hospitality — operations dashboard
        </p>
      </header>

      <section style={panel}>
        <h2 style={h2}>Today&apos;s arrivals</h2>
        {arrivals.map((a) => (
          <Row key={a.unit}>
            <span>
              <strong>{a.unit}</strong> · {a.guest}
            </span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>{a.time}</span>
              <StatusBadge status={a.status} />
            </span>
          </Row>
        ))}
      </section>

      <section style={panel}>
        <h2 style={h2}>Turnover tasks</h2>
        {tasks.map((t) => (
          <Row key={t.unit + t.type}>
            <span>
              <strong>{t.unit}</strong> · {t.type}
            </span>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)' }}>{t.due}</span>
              <StatusBadge status={t.status} />
            </span>
          </Row>
        ))}
      </section>

      <footer style={{ color: 'var(--muted)', fontSize: 13, marginTop: 24 }}>
        API: <code>{process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}</code> · Swagger at{' '}
        <code>/docs</code>
      </footer>
    </main>
  );
}

const panel: React.CSSProperties = {
  background: 'var(--panel)',
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 20,
  marginBottom: 20,
};
const h2: React.CSSProperties = { margin: '0 0 12px', fontSize: 16 };

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      {children}
    </div>
  );
}
