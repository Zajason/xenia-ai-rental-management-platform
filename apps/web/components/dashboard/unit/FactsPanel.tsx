'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { Plus, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { Button } from '../../ui/Button';
import { Input, Select } from '../../ui/Field';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { errorMessage } from '../../../lib/api-error';

const CATEGORIES = ['wifi', 'checkin', 'checkout', 'parking', 'recommendation', 'appliance', 'rules', 'other'];

export function FactsPanel({ unitId }: { unitId: string }) {
  const { client, role } = useAuth();
  const { data: facts, mutate } = useSWR(`facts-${unitId}`, () => client.units.facts.list(unitId));
  const [category, setCategory] = useState('wifi');
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.units.facts.add(unitId, { category, key, value });
      setKey('');
      setValue('');
      toast.success('Fact added — the AI concierge will pick it up on next reindex');
      void mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {canManage(role) && (
        <form onSubmit={submit} className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-2 p-3">
          <div className="w-32">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>
          <Input required placeholder="key (e.g. password)" value={key} onChange={(e) => setKey(e.target.value)} className="w-40" />
          <Input required placeholder="value" value={value} onChange={(e) => setValue(e.target.value)} className="flex-1 min-w-40" />
          <Button type="submit" variant="primary" loading={loading}>
            <Plus className="size-4" /> Add
          </Button>
        </form>
      )}

      {!facts ? (
        <Skeleton className="h-24 w-full" />
      ) : facts.length === 0 ? (
        <EmptyState icon={Tag} title="No facts yet" description="Wifi password, parking, check-in time — anything guests ask about." />
      ) : (
        <div className="flex flex-col gap-2">
          {facts.map((f) => (
            <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
              <span className="rounded-md bg-surface px-2 py-0.5 text-[11px] capitalize text-muted">{f.category}</span>
              <span className="text-[13px] font-medium text-text">{f.key}</span>
              <span className="flex-1 truncate text-[13px] text-muted">{f.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
