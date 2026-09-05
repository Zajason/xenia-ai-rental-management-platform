'use client';

import useSWR from 'swr';
import Link from 'next/link';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  ClipboardList,
  CreditCard,
  LogIn,
  LogOut as LogOutIcon,
  ScrollText,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { isSuperRole } from '../../lib/nav';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StatusBadge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { formatDateTime, relativeDay } from '../../lib/format';

export default function OverviewPage() {
  const { client, role, user } = useAuth();

  const { data: properties } = useSWR('properties', () => client.properties.list());
  const { data: units } = useSWR('units', () => client.units.list());
  const { data: bookings } = useSWR('bookings', () => client.bookings.list());
  const { data: tasks } = useSWR('tasks', () => client.tasks.list());
  const { data: tickets } = useSWR('maintenance-tickets', () => client.maintenance.list());
  const { data: guests } = useSWR('guests', () => client.guests.list());
  const { data: subscription } = useSWR('billing-subscription', () => client.billing.subscription());
  const { data: audit } = useSWR(isSuperRole(role) ? 'audit-recent' : null, () =>
    client.audit.list({ limit: 8 }),
  );

  const loading = !properties || !units || !bookings || !tasks || !tickets;

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  const guestById = new Map((guests ?? []).map((g) => [g.id, g]));

  const openTasks = (tasks ?? []).filter((t) => !['completed', 'cancelled'].includes(t.status));
  const openTickets = (tickets ?? []).filter((t) => !['resolved', 'cancelled'].includes(t.status));

  const todaysEvents = (bookings ?? [])
    .filter((b) => b.status !== 'cancelled')
    .flatMap((b) => {
      const rows: { kind: 'arrival' | 'departure'; at: string; booking: typeof b }[] = [];
      if (relativeDay(b.checkIn) === 'Today') rows.push({ kind: 'arrival', at: b.checkIn, booking: b });
      if (relativeDay(b.checkOut) === 'Today') rows.push({ kind: 'departure', at: b.checkOut, booking: b });
      return rows;
    })
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const noProperties = properties && properties.length === 0;

  return (
    <div>
      <PageHeader
        title={`Good ${greeting()}, ${user?.name?.split(' ')[0] ?? 'there'}`}
        description="Here's what's happening across your properties today."
      />

      {noProperties && (
        <Card className="mb-6 border-accent/30 bg-accent-soft/40">
          <CardBody className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-surface text-accent">
                <Building2 className="size-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-text">You haven&apos;t added a property yet</p>
                <p className="text-[13px] text-muted">Add your first property to start taking bookings.</p>
              </div>
            </div>
            <Link href="/dashboard/properties">
              <Button variant="primary">
                Add a property <ArrowRight className="size-4" />
              </Button>
            </Link>
          </CardBody>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi
          icon={Building2}
          label="Units"
          value={loading ? null : `${units?.length ?? 0}`}
          hint={
            loading
              ? undefined
              : `across ${properties?.length ?? 0} ${properties?.length === 1 ? 'property' : 'properties'}`
          }
        />
        <Kpi icon={ClipboardList} label="Open tasks" value={loading ? null : `${openTasks.length}`} hint="cleaning & inspections" />
        <Kpi icon={Wrench} label="Open tickets" value={loading ? null : `${openTickets.length}`} hint="maintenance" />
        <Kpi
          icon={CreditCard}
          label="Plan"
          value={loading ? null : subscription ? capitalize(subscription.plan) : 'None'}
          hint={subscription ? capitalize(subscription.status) : 'no active subscription'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader title="Today's arrivals & departures" subtitle="From your live booking calendar" />
            {loading ? (
              <div className="p-5">
                <Skeleton className="h-12 w-full" />
              </div>
            ) : todaysEvents.length === 0 ? (
              <EmptyState icon={CalendarClock} title="Nothing scheduled today" description="Arrivals and departures will show up here as they're booked." />
            ) : (
              <ul className="divide-y divide-border">
                {todaysEvents.map((e, i) => {
                  const unit = unitById.get(e.booking.unitId);
                  const guest = e.booking.guestId ? guestById.get(e.booking.guestId) : null;
                  return (
                    <li key={i} className="flex items-center gap-3 px-5 py-3.5">
                      <div
                        className={`flex size-8 flex-none items-center justify-center rounded-lg ${
                          e.kind === 'arrival' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
                        }`}
                      >
                        {e.kind === 'arrival' ? <LogIn className="size-4" /> : <LogOutIcon className="size-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-text">
                          {unit?.name ?? 'Unit'} {guest?.name ? `· ${guest.name}` : ''}
                        </p>
                        <p className="text-[12px] text-muted capitalize">{e.kind}</p>
                      </div>
                      <p className="flex-none text-[12.5px] text-faint">{formatDateTime(e.at)}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-6 lg:col-span-2">
          {isSuperRole(role) && (
            <Card>
              <CardHeader title="Recent activity" subtitle="Audit trail" action={
                <Link href="/dashboard/audit" className="text-[12.5px] text-accent hover:underline">View all</Link>
              } />
              {!audit ? (
                <div className="p-5">
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : audit.length === 0 ? (
                <EmptyState icon={ScrollText} title="No activity yet" />
              ) : (
                <ul className="divide-y divide-border">
                  {audit.slice(0, 6).map((entry) => (
                    <li key={entry.id} className="px-5 py-3">
                      <p className="text-[13px] text-text">{entry.action.replace(/\./g, ' → ')}</p>
                      <p className="mt-0.5 text-[11.5px] text-faint">{formatDateTime(entry.at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          <Card>
            <CardHeader title="Open tasks" subtitle="Cleaning & inspections" action={
              <Link href="/dashboard/tasks" className="text-[12.5px] text-accent hover:underline">View all</Link>
            } />
            {loading ? (
              <div className="p-5">
                <Skeleton className="h-8 w-full" />
              </div>
            ) : openTasks.length === 0 ? (
              <EmptyState icon={ClipboardList} title="All caught up" description="No open tasks right now." />
            ) : (
              <ul className="divide-y divide-border">
                {openTasks.slice(0, 6).map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-text">
                        {unitById.get(t.unitId)?.name ?? 'Unit'}
                      </p>
                      <p className="text-[11.5px] capitalize text-faint">{t.type}</p>
                    </div>
                    <StatusBadge status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Building2;
  label: string;
  value: string | null;
  hint?: string;
}) {
  return (
    <Card>
      <CardBody className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-faint">{label}</p>
          {value === null ? (
            <Skeleton className="mt-2 h-7 w-16" />
          ) : (
            <p className="mt-1 text-2xl font-semibold tracking-tight text-text">{value}</p>
          )}
          {hint && <p className="mt-1 text-[12px] text-muted">{hint}</p>}
        </div>
        <div className="flex size-9 flex-none items-center justify-center rounded-lg bg-surface-2 text-accent">
          <Icon className="size-4.5" />
        </div>
      </CardBody>
    </Card>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
