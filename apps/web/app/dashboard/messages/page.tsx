'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { useRouter } from 'next/navigation';
import { MessageSquare, Plus } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Select } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusBadge } from '../../../components/ui/Badge';
import { errorMessage } from '../../../lib/api-error';
import type { ConversationChannel } from '@xenia/sdk';

export default function MessagesPage() {
  const { client, role } = useAuth();
  const router = useRouter();
  const { data: conversations, mutate } = useSWR('conversations', () => client.conversations.list());
  const { data: units } = useSWR('units', () => client.units.list());
  const { data: guests } = useSWR('guests', () => client.guests.list());
  const [showCreate, setShowCreate] = useState(false);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));
  const guestById = new Map((guests ?? []).map((g) => [g.id, g]));

  return (
    <div>
      <PageHeader
        title="Messages"
        description="Guest conversations, answered by your AI concierge."
        action={
          canManage(role) && (
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> New conversation
            </Button>
          )
        }
      />

      <Card>
        <CardHeader title="Conversations" />
        {!conversations ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : conversations.length === 0 ? (
          <EmptyState icon={MessageSquare} title="No conversations yet" description="Open one to chat with a guest." />
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => (
              <li
                key={c.id}
                onClick={() => router.push(`/dashboard/messages/${c.id}`)}
                className="flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
              >
                <div className="flex size-9 flex-none items-center justify-center rounded-lg bg-surface-2 text-muted">
                  <MessageSquare className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-text">
                    {c.guestId ? (guestById.get(c.guestId)?.name ?? 'Guest') : 'No guest'}
                    {c.unitId && <span className="text-faint"> · {unitById.get(c.unitId)?.name}</span>}
                  </p>
                  <p className="text-[12px] capitalize text-muted">{c.channel.replace('_', ' ')}</p>
                </div>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Start a conversation">
        <NewConversationForm
          units={units ?? []}
          guests={guests ?? []}
          onCreated={(id) => {
            setShowCreate(false);
            void mutate();
            router.push(`/dashboard/messages/${id}`);
          }}
        />
      </Modal>
    </div>
  );
}

function NewConversationForm({
  units,
  guests,
  onCreated,
}: {
  units: { id: string; name: string }[];
  guests: { id: string; name: string | null }[];
  onCreated: (id: string) => void;
}) {
  const { client } = useAuth();
  const [unitId, setUnitId] = useState('');
  const [guestId, setGuestId] = useState('');
  const [channel, setChannel] = useState<ConversationChannel>('in_app');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const conv = await client.conversations.create({
        unitId: unitId || undefined,
        guestId: guestId || undefined,
        channel,
      });
      onCreated(conv.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Unit" hint="optional">
        <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">—</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Guest" hint="optional">
        <Select value={guestId} onChange={(e) => setGuestId(e.target.value)}>
          <option value="">—</option>
          {guests.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name ?? 'Guest'}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Channel">
        <Select value={channel} onChange={(e) => setChannel(e.target.value as ConversationChannel)}>
          <option value="in_app">In-app</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
        </Select>
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Start conversation
      </Button>
    </form>
  );
}
