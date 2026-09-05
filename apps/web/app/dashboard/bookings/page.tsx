'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { CalendarRange, Copy, Plug, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusBadge, Badge } from '../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { errorMessage } from '../../../lib/api-error';
import { formatDate } from '../../../lib/format';
import type { ChannelType } from '@xenia/sdk';

export default function BookingsPage() {
  const { client, role } = useAuth();
  const { data: bookings, mutate: mutateBookings } = useSWR('bookings', () => client.bookings.list());
  const { data: units } = useSWR('units', () => client.units.list());
  const { data: guests } = useSWR('guests', () => client.guests.list());
  const { data: channels, mutate: mutateChannels } = useSWR('channels', () => client.channels.list());

  const [showBooking, setShowBooking] = useState(false);
  const [showChannel, setShowChannel] = useState(false);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  const guestById = new Map((guests ?? []).map((g) => [g.id, g]));

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Every reservation across your channels."
        action={
          canManage(role) && (
            <div className="flex gap-2">
              <Button onClick={() => setShowChannel(true)}>
                <Plug className="size-4" /> Connect channel
              </Button>
              <Button variant="primary" onClick={() => setShowBooking(true)}>
                <Plus className="size-4" /> New booking
              </Button>
            </div>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader title="Bookings" />
        {!bookings ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState
            icon={CalendarRange}
            title="No bookings yet"
            description="Connect a channel or create a direct booking."
          />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Guest</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {bookings
                .slice()
                .sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())
                .map((b) => (
                  <Tr key={b.id}>
                    <Td>{unitById.get(b.unitId)?.name ?? '—'}</Td>
                    <Td>{b.guestId ? (guestById.get(b.guestId)?.name ?? 'Guest') : '—'}</Td>
                    <Td>{formatDate(b.checkIn)}</Td>
                    <Td>{formatDate(b.checkOut)}</Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                  </Tr>
                ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Connected channels" subtitle="Where your bookings come from" />
        {!channels ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : channels.length === 0 ? (
          <EmptyState icon={Plug} title="No channels connected" description="Connect Airbnb, Booking.com, or another source." />
        ) : (
          <div className="flex flex-wrap gap-2 p-5">
            {channels.map((c) => (
              <Badge key={c.id} tone="accent">
                {c.name} · {c.type}
              </Badge>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showBooking} onClose={() => setShowBooking(false)} title="Create a direct booking">
        <NewBookingForm
          units={units ?? []}
          onCreated={() => {
            setShowBooking(false);
            toast.success('Booking confirmed');
            void mutateBookings();
          }}
        />
      </Modal>

      <Modal open={showChannel} onClose={() => setShowChannel(false)} title="Connect a channel">
        <ConnectChannelForm
          onCreated={() => {
            setShowChannel(false);
            void mutateChannels();
          }}
        />
      </Modal>
    </div>
  );
}

function NewBookingForm({
  units,
  onCreated,
}: {
  units: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { client } = useAuth();
  const [unitId, setUnitId] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.bookings.confirm({
        unitId,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Unit">
        <Select required value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">Select a unit…</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in">
          <Input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
        </Field>
        <Field label="Check-out">
          <Input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
        </Field>
      </div>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Confirm booking
      </Button>
    </form>
  );
}

function ConnectChannelForm({ onCreated }: { onCreated: () => void }) {
  const { client } = useAuth();
  const [type, setType] = useState<ChannelType>('airbnb');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [secret, setSecret] = useState<{ webhookSecret: string; id: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const channel = await client.channels.create({ type, name });
      setSecret({ webhookSecret: channel.webhookSecret, id: channel.id });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (secret) {
    return (
      <div>
        <p className="mb-3 text-[13px] text-muted">
          Channel connected. Configure your provider to POST booking events to this webhook, authenticated with this
          secret — <strong className="text-text">shown only once</strong>.
        </p>
        <div className="mb-4 space-y-2 rounded-lg border border-border-strong bg-surface-2 p-3 font-mono text-[12px]">
          <div>
            <p className="mb-1 text-faint">Webhook URL</p>
            <p className="break-all text-text">/webhooks/channels/&lt;org&gt;/{secret.id}</p>
          </div>
          <div>
            <p className="mb-1 text-faint">Secret</p>
            <p className="break-all text-text">{secret.webhookSecret}</p>
          </div>
        </div>
        <Button
          className="w-full"
          onClick={() => {
            navigator.clipboard.writeText(secret.webhookSecret);
            toast.success('Copied to clipboard');
          }}
        >
          <Copy className="size-3.5" /> Copy secret
        </Button>
        <Button variant="primary" className="mt-2 w-full" onClick={onCreated}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field label="Provider">
        <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
          <option value="airbnb">Airbnb</option>
          <option value="booking">Booking.com</option>
          <option value="vrbo">Vrbo</option>
          <option value="direct">Direct</option>
          <option value="ical">iCal</option>
        </Select>
      </Field>
      <Field label="Label">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Airbnb — main listing" />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Connect
      </Button>
    </form>
  );
}
