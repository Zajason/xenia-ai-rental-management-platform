'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { CalendarRange, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
import { errorMessage } from '../../../lib/api-error';
import { formatDate } from '../../../lib/format';

export function AvailabilityPanel({ unitId }: { unitId: string }) {
  const { client, role } = useAuth();
  const { data: blocks, mutate } = useSWR(`blocks-${unitId}`, () => client.calendar.blocks(unitId));
  const [showCreate, setShowCreate] = useState(false);

  async function remove(id: string) {
    try {
      await client.calendar.removeBlock(id);
      toast.success('Block removed');
      void mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  const sorted = [...(blocks ?? [])].sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

  return (
    <div>
      {canManage(role) && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Block dates
          </Button>
        </div>
      )}

      {!blocks ? (
        <Skeleton className="h-24 w-full" />
      ) : sorted.length === 0 ? (
        <EmptyState icon={CalendarRange} title="No blocked dates" description="Bookings and manual blocks will show up here." />
      ) : (
        <div className="flex flex-col gap-2">
          {sorted.map((b) => (
            <div key={b.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
              <CalendarRange className="size-4 text-muted" />
              <span className="text-[13px] text-text">
                {formatDate(b.checkIn)} → {formatDate(b.checkOut)}
              </span>
              <Badge tone={b.source === 'booking' ? 'accent' : 'neutral'}>{b.source}</Badge>
              {canManage(role) && b.source === 'manual' && (
                <button
                  onClick={() => remove(b.id)}
                  className="ml-auto flex-none rounded-lg p-1.5 text-faint hover:bg-err-soft hover:text-err"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Block dates manually">
        <BlockForm
          unitId={unitId}
          onCreated={() => {
            setShowCreate(false);
            void mutate();
          }}
        />
      </Modal>
    </div>
  );
}

function BlockForm({ unitId, onCreated }: { unitId: string; onCreated: () => void }) {
  const { client } = useAuth();
  const [checkIn, setCheckIn] = useState('');
  const [checkOut, setCheckOut] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.calendar.createBlock({
        unitId,
        checkIn: new Date(checkIn).toISOString(),
        checkOut: new Date(checkOut).toISOString(),
      });
      toast.success('Dates blocked');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="From">
        <Input type="date" required value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
      </Field>
      <Field label="To">
        <Input type="date" required value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Block these dates
      </Button>
    </form>
  );
}
