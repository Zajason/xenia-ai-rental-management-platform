'use client';

import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Crown, Mail, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { FullScreenLoader } from '../../../../components/ui/FullScreenLoader';
import { StatusBadge } from '../../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../../components/ui/Table';
import { formatDate, initials } from '../../../../lib/format';

export default function GuestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { client } = useAuth();
  const { data: guest, error } = useSWR(`guest-${id}`, () => client.guests.get(id));
  const { data: units } = useSWR('units', () => client.units.list());

  if (error) {
    return (
      <Card>
        <EmptyState icon={MessageCircle} title="Guest not found" />
      </Card>
    );
  }
  if (!guest) return <FullScreenLoader />;

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  return (
    <div>
      <button
        onClick={() => router.push('/dashboard/guests')}
        className="mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Guests
      </button>

      <div className="mb-6 flex items-center gap-4">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-purple text-[18px] font-semibold text-[#08101f]">
          {initials(guest.name)}
        </div>
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-text">
            {guest.name ?? 'Guest'}
            {guest.isVip && <Crown className="size-4.5 text-warn" />}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted">
            {guest.email && (
              <span className="flex items-center gap-1.5">
                <Mail className="size-3.5" /> {guest.email}
              </span>
            )}
            {guest.phone && (
              <span className="flex items-center gap-1.5">
                <Phone className="size-3.5" /> {guest.phone}
              </span>
            )}
          </div>
        </div>
      </div>

      {guest.summary && (
        <Card className="mb-6">
          <CardBody>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">Returning-guest memory</p>
            <p className="text-[13.5px] text-text">{guest.summary}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Stay history" subtitle={`${guest.bookings.length} booking${guest.bookings.length === 1 ? '' : 's'}`} />
        {guest.bookings.length === 0 ? (
          <EmptyState icon={MessageCircle} title="No bookings yet" />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Check-in</Th>
              <Th>Check-out</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {guest.bookings.map((b) => (
                <Tr key={b.id}>
                  <Td>{unitById.get(b.unitId)?.name ?? '—'}</Td>
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
    </div>
  );
}
