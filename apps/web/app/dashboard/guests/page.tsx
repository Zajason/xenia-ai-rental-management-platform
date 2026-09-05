'use client';

import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { Crown, Users } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { Badge } from '../../../components/ui/Badge';

export default function GuestsPage() {
  const { client } = useAuth();
  const router = useRouter();
  const { data: guests } = useSWR('guests', () => client.guests.list());

  return (
    <div>
      <PageHeader title="Guests" description="Everyone who has stayed, across every channel." />

      <Card>
        <CardHeader title="Directory" />
        {!guests ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : guests.length === 0 ? (
          <EmptyState icon={Users} title="No guests yet" description="Guests appear here automatically from bookings." />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Language</Th>
              <Th>Stays</Th>
            </THead>
            <tbody>
              {guests.map((g) => (
                <Tr key={g.id} onClick={() => router.push(`/dashboard/guests/${g.id}`)}>
                  <Td>
                    <span className="flex items-center gap-1.5">
                      {g.name ?? 'Guest'}
                      {g.isVip && <Crown className="size-3.5 text-warn" />}
                    </span>
                  </Td>
                  <Td>{g.email ?? '—'}</Td>
                  <Td className="uppercase">{g.preferredLanguage}</Td>
                  <Td>
                    {g.stayCount ? (
                      <Badge tone="accent">{g.stayCount} stays</Badge>
                    ) : (
                      <span className="text-faint">first stay</span>
                    )}
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
