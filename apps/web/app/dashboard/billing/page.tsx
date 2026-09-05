'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { CreditCard, HandCoins, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusBadge } from '../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { errorMessage } from '../../../lib/api-error';
import { formatDate, formatMoney } from '../../../lib/format';

const PLANS = [
  { id: 'starter' as const, name: 'Starter', blurb: 'For a handful of units' },
  { id: 'pro' as const, name: 'Pro', blurb: 'For growing portfolios' },
  { id: 'scale' as const, name: 'Scale', blurb: 'For property managers' },
];

export default function BillingPage() {
  const { client, role } = useAuth();
  // An org with no plan gets an empty 200 body, so `subscription` is falsy in
  // both the loading and the no-plan case — `isLoading` is what separates them.
  const {
    data: subscription,
    isLoading: subLoading,
    mutate: mutateSub,
  } = useSWR('billing-subscription', () => client.billing.subscription());
  const { data: payouts, mutate: mutatePayouts } = useSWR('billing-payouts', () => client.billing.payouts.list());
  const { data: staff } = useSWR('staff', () => client.staff.list());
  const { data: vendors } = useSWR('vendors', () => client.vendors.list());
  const [showCheckout, setShowCheckout] = useState(false);
  const [showPayout, setShowPayout] = useState(false);

  const isOwner = role === 'owner' || role === 'admin';

  async function cancel() {
    try {
      await client.billing.cancelSubscription();
      toast.success('Subscription cancelled');
      void mutateSub();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader title="Billing" description="Your subscription and in-app payouts." />

      <Card className="mb-6">
        <CardHeader title="Subscription" />
        <CardBody>
          {subLoading ? (
            <Skeleton className="h-12 w-full" />
          ) : !subscription ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-surface-2 text-muted">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <p className="text-[13.5px] font-medium text-text">No active plan</p>
                  <p className="text-[12.5px] text-muted">Choose a plan to unlock billing features.</p>
                </div>
              </div>
              {isOwner && (
                <Button variant="primary" onClick={() => setShowCheckout(true)}>
                  Choose a plan
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[15px] font-semibold capitalize text-text">
                  {subscription.plan} <StatusBadge status={subscription.status} />
                </p>
                <p className="mt-1 text-[12.5px] text-muted">
                  {subscription.unitCount} unit{subscription.unitCount === 1 ? '' : 's'} metered
                  {subscription.currentPeriodEnd && ` · renews ${formatDate(subscription.currentPeriodEnd)}`}
                </p>
              </div>
              {isOwner && subscription.status === 'active' && (
                <Button onClick={cancel}>Cancel subscription</Button>
              )}
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Payouts"
          subtitle="Pay a cleaner or repair vendor through the app"
          action={
            <Button variant="primary" onClick={() => setShowPayout(true)}>
              <Plus className="size-4" /> New payout
            </Button>
          }
        />
        {!payouts ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : payouts.length === 0 ? (
          <EmptyState icon={HandCoins} title="No payouts yet" description="Pay a cleaner for a turnover or a vendor for a repair." />
        ) : (
          <Table>
            <THead>
              <Th>Payee</Th>
              <Th>Amount</Th>
              <Th>Note</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {payouts.map((p) => {
                const name =
                  p.payeeType === 'staff'
                    ? staff?.find((s) => s.id === p.payeeId)?.name
                    : vendors?.find((v) => v.id === p.payeeId)?.name;
                return (
                  <Tr key={p.id}>
                    <Td className="capitalize">
                      {name ?? p.payeeType} <span className="text-faint">· {p.payeeType}</span>
                    </Td>
                    <Td>{formatMoney(p.amount, p.currency)}</Td>
                    <Td>{p.note ?? '—'}</Td>
                    <Td>
                      <StatusBadge status={p.status} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showCheckout} onClose={() => setShowCheckout(false)} title="Choose a plan">
        <div className="flex flex-col gap-2">
          {PLANS.map((p) => (
            <PlanRow
              key={p.id}
              plan={p}
              onSelect={async () => {
                try {
                  await client.billing.checkout(p.id);
                  toast.success(`${p.name} plan activated`);
                  setShowCheckout(false);
                  void mutateSub();
                } catch (err) {
                  toast.error(errorMessage(err));
                }
              }}
            />
          ))}
        </div>
      </Modal>

      <Modal open={showPayout} onClose={() => setShowPayout(false)} title="Pay a cleaner or vendor">
        <PayoutForm
          staff={staff ?? []}
          vendors={vendors ?? []}
          onCreated={() => {
            setShowPayout(false);
            void mutatePayouts();
          }}
        />
      </Modal>
    </div>
  );
}

function PlanRow({
  plan,
  onSelect,
}: {
  plan: { id: string; name: string; blurb: string };
  onSelect: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  return (
    <button
      onClick={async () => {
        setLoading(true);
        await onSelect();
        setLoading(false);
      }}
      disabled={loading}
      className="flex items-center justify-between rounded-lg border border-border-strong bg-surface-2 px-4 py-3 text-left transition-colors hover:border-accent disabled:opacity-50"
    >
      <div>
        <p className="text-[13.5px] font-medium text-text">{plan.name}</p>
        <p className="text-[12px] text-muted">{plan.blurb}</p>
      </div>
      <CreditCard className="size-4 text-faint" />
    </button>
  );
}

function PayoutForm({
  staff,
  vendors,
  onCreated,
}: {
  staff: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const { client } = useAuth();
  const [payeeType, setPayeeType] = useState<'staff' | 'vendor'>('staff');
  const [payeeId, setPayeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = payeeType === 'staff' ? staff : vendors;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.billing.payouts.create({ payeeType, payeeId, amount: Number(amount), note: note || undefined });
      toast.success('Payout sent');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Pay">
        <Select
          value={payeeType}
          onChange={(e) => {
            setPayeeType(e.target.value as 'staff' | 'vendor');
            setPayeeId('');
          }}
        >
          <option value="staff">A cleaner</option>
          <option value="vendor">A vendor</option>
        </Select>
      </Field>
      <Field label={payeeType === 'staff' ? 'Cleaner' : 'Vendor'}>
        <Select required value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
          <option value="">Select…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Amount">
        <Input type="number" min={0.01} step="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="45.50" />
      </Field>
      <Field label="Note" hint="optional">
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Turnover — Loft 3B" />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Send payout
      </Button>
    </form>
  );
}
