'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Property } from '@xenia/sdk';
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth-context';
import { Button } from '../ui/Button';
import { Field, Input, Select } from '../ui/Field';
import { errorMessage } from '../../lib/api-error';

const TIMEZONES = [
  'Europe/Athens',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'America/New_York',
  'America/Los_Angeles',
  'UTC',
];

export function PropertyForm({
  onCreated,
  submitLabel = 'Create property',
}: {
  onCreated: (property: Property) => void;
  submitLabel?: string;
}) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [timezone, setTimezone] = useState('Europe/Athens');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const property = await client.properties.create({ name, address: address || undefined, timezone });
      toast.success(`${property.name} created`);
      onCreated(property);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Property name">
        <Input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Santorini Cliff House"
        />
      </Field>
      <Field label="Address" hint="optional">
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Oia, Santorini, Greece" />
      </Field>
      <Field label="Timezone">
        <Select value={timezone} onChange={(e) => setTimezone(e.target.value)}>
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Select>
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        {submitLabel}
      </Button>
    </form>
  );
}
