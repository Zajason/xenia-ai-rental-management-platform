'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Unit } from '@xenia/sdk';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth-context';
import { Button } from '../ui/Button';
import { Field, Input } from '../ui/Field';
import { errorMessage } from '../../lib/api-error';

export function UnitForm({
  propertyId,
  onCreated,
  submitLabel = 'Add unit',
}: {
  propertyId: string;
  onCreated: (unit: Unit) => void;
  submitLabel?: string;
}) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState(2);
  const [bedrooms, setBedrooms] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const unit = await client.units.create(propertyId, { name, capacity, bedrooms });
      toast.success(`${unit.name} added`);
      onCreated(unit);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Unit name">
        <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Caldera Suite" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Guests">
          <Input
            type="number"
            min={1}
            max={50}
            value={capacity}
            onChange={(e) => setCapacity(Number(e.target.value))}
          />
        </Field>
        <Field label="Bedrooms">
          <Input
            type="number"
            min={0}
            max={20}
            value={bedrooms}
            onChange={(e) => setBedrooms(Number(e.target.value))}
          />
        </Field>
      </div>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
