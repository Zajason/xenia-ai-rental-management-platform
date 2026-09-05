'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Plus, UserCog, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusBadge } from '../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { errorMessage } from '../../../lib/api-error';
import { formatMoney } from '../../../lib/format';
import type { MaintenanceTicket } from '@xenia/sdk';

export default function MaintenancePage() {
  const { client, role } = useAuth();
  const { data: tickets, mutate: mutateTickets } = useSWR('maintenance-tickets', () => client.maintenance.list());
  const { data: vendors, mutate: mutateVendors } = useSWR('vendors', () => client.vendors.list());
  const { data: units } = useSWR('units', () => client.units.list());

  const [showTicket, setShowTicket] = useState(false);
  const [showVendor, setShowVendor] = useState(false);
  const [assignTicket, setAssignTicket] = useState<MaintenanceTicket | null>(null);
  const [resolveTicket, setResolveTicket] = useState<MaintenanceTicket | null>(null);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  return (
    <div>
      <PageHeader
        title="Maintenance"
        description="Vendor coordination and repair tickets."
        action={
          <div className="flex gap-2">
            {canManage(role) && (
              <Button onClick={() => setShowVendor(true)}>
                <Plus className="size-4" /> Add vendor
              </Button>
            )}
            <Button variant="primary" onClick={() => setShowTicket(true)}>
              <Plus className="size-4" /> New ticket
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Tickets" />
        {!tickets ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : tickets.length === 0 ? (
          <EmptyState icon={Wrench} title="No tickets" description="Repair requests will show up here." />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Issue</Th>
              <Th>Priority</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </THead>
            <tbody>
              {tickets.map((t) => (
                <Tr key={t.id}>
                  <Td>{unitById.get(t.unitId)?.name ?? '—'}</Td>
                  <Td>{t.title}</Td>
                  <Td>{t.priority}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td align="right">
                    {canManage(role) && !['resolved', 'cancelled'].includes(t.status) && (
                      <div className="flex justify-end gap-1.5">
                        {t.status === 'open' && (
                          <Button size="sm" onClick={() => setAssignTicket(t)}>
                            <UserCog className="size-3.5" /> Assign vendor
                          </Button>
                        )}
                        <Button size="sm" variant="primary" onClick={() => setResolveTicket(t)}>
                          <CheckCircle2 className="size-3.5" /> Resolve
                        </Button>
                      </div>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Vendors" />
        {!vendors ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : vendors.length === 0 ? (
          <EmptyState icon={UserCog} title="No vendors yet" description="Add a plumber, electrician, or handyman." />
        ) : (
          <div className="flex flex-wrap gap-2 p-5">
            {vendors.map((v) => (
              <span key={v.id} className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-[12.5px] text-text">
                {v.name} {v.trade && <span className="text-faint">· {v.trade}</span>}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showTicket} onClose={() => setShowTicket(false)} title="Report an issue">
        <TicketForm
          units={units ?? []}
          onCreated={() => {
            setShowTicket(false);
            void mutateTickets();
          }}
        />
      </Modal>

      <Modal open={showVendor} onClose={() => setShowVendor(false)} title="Add a vendor">
        <VendorForm
          onCreated={() => {
            setShowVendor(false);
            void mutateVendors();
          }}
        />
      </Modal>

      <Modal open={!!assignTicket} onClose={() => setAssignTicket(null)} title="Assign a vendor">
        {assignTicket && (
          <AssignVendorForm
            ticketId={assignTicket.id}
            vendors={vendors ?? []}
            onAssigned={() => {
              setAssignTicket(null);
              void mutateTickets();
            }}
          />
        )}
      </Modal>

      <Modal open={!!resolveTicket} onClose={() => setResolveTicket(null)} title="Resolve ticket">
        {resolveTicket && (
          <ResolveForm
            ticketId={resolveTicket.id}
            onResolved={() => {
              setResolveTicket(null);
              void mutateTickets();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function TicketForm({ units, onCreated }: { units: { id: string; name: string }[]; onCreated: () => void }) {
  const { client } = useAuth();
  const [unitId, setUnitId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState(3);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.maintenance.open({ unitId, title, description: description || undefined, priority });
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
      <Field label="Issue">
        <Input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="AC not cooling" />
      </Field>
      <Field label="Details" hint="optional">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Priority" hint="0 (low) – 10 (urgent)">
        <Input type="number" min={0} max={10} value={priority} onChange={(e) => setPriority(Number(e.target.value))} />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Open ticket
      </Button>
    </form>
  );
}

function VendorForm({ onCreated }: { onCreated: () => void }) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [trade, setTrade] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.vendors.create({ name, trade: trade || undefined, phone: phone || undefined });
      toast.success('Vendor added');
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Yiannis Plumbing" />
      </Field>
      <Field label="Trade" hint="optional">
        <Input value={trade} onChange={(e) => setTrade(e.target.value)} placeholder="plumber" />
      </Field>
      <Field label="Phone" hint="optional">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+30 697 000 0000" />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Add vendor
      </Button>
    </form>
  );
}

function AssignVendorForm({
  ticketId,
  vendors,
  onAssigned,
}: {
  ticketId: string;
  vendors: { id: string; name: string }[];
  onAssigned: () => void;
}) {
  const { client } = useAuth();
  const [vendorId, setVendorId] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [grantAccess, setGrantAccess] = useState(true);
  const [loading, setLoading] = useState(false);

  if (vendors.length === 0) {
    return <EmptyState icon={UserCog} title="No vendors" description="Add a vendor first." />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await client.maintenance.assignVendor(ticketId, {
        vendorId,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined,
        grantAccess,
      });
      toast.success(res.accessCredentialId ? 'Vendor assigned — access code issued' : 'Vendor assigned');
      onAssigned();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Vendor">
        <Select required value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
          <option value="">Select…</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Scheduled visit" hint="optional">
        <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
      </Field>
      <label className="mb-4 flex items-center gap-2 text-[13px] text-muted">
        <input type="checkbox" checked={grantAccess} onChange={(e) => setGrantAccess(e.target.checked)} className="size-4 accent-accent" />
        Grant a temporary door code for the visit
      </label>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Assign
      </Button>
    </form>
  );
}

function ResolveForm({ ticketId, onResolved }: { ticketId: string; onResolved: () => void }) {
  const { client } = useAuth();
  const [cost, setCost] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.maintenance.resolve(ticketId, cost ? Number(cost) : undefined);
      toast.success(`Ticket resolved${cost ? ` — ${formatMoney(cost)}` : ''}`);
      onResolved();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Cost" hint="optional">
        <Input type="number" min={0} step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="120.50" />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Mark resolved
      </Button>
    </form>
  );
}
