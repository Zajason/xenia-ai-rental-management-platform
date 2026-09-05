'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { BatteryMedium, KeyRound, Lock as LockIcon, Plus, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { Button } from '../../ui/Button';
import { Field, Input } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { StatusBadge } from '../../ui/Badge';
import { errorMessage } from '../../../lib/api-error';
import { formatDateTime } from '../../../lib/format';

export function AccessPanel({ unitId }: { unitId: string }) {
  const { client, role } = useAuth();
  const { data: locks, mutate: mutateLocks } = useSWR('locks', () => client.access.locks.list());
  const { data: credentials, mutate: mutateCreds } = useSWR(`credentials-${unitId}`, () =>
    client.access.credentials.list({ unitId }),
  );
  const [showIssue, setShowIssue] = useState(false);

  const unitLocks = (locks ?? []).filter((l) => l.unitId === unitId);

  async function registerLock() {
    try {
      await client.access.locks.create(unitId);
      toast.success('Lock registered (simulator)');
      void mutateLocks();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function revoke(id: string) {
    try {
      await client.access.credentials.revoke(id);
      toast.success('Credential revoked');
      void mutateCreds();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-6">
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Locks</p>
          {canManage(role) && unitLocks.length === 0 && (
            <Button size="sm" onClick={registerLock}>
              <Plus className="size-3.5" /> Register lock
            </Button>
          )}
        </div>
        {!locks ? (
          <Skeleton className="h-14 w-full" />
        ) : unitLocks.length === 0 ? (
          <EmptyState icon={LockIcon} title="No lock registered" description="Simulated by default — swap for Seam in production." />
        ) : (
          <div className="flex flex-col gap-2">
            {unitLocks.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
                <LockIcon className="size-4 text-muted" />
                <span className="text-[13px] text-text">{l.provider}</span>
                <StatusBadge status={l.status} />
                {l.battery !== null && (
                  <span className="ml-auto flex items-center gap-1 text-[12px] text-faint">
                    <BatteryMedium className="size-3.5" /> {l.battery}%
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-faint">Access credentials</p>
          {canManage(role) && (
            <Button size="sm" onClick={() => setShowIssue(true)}>
              <Plus className="size-3.5" /> Issue credential
            </Button>
          )}
        </div>
        {!credentials ? (
          <Skeleton className="h-14 w-full" />
        ) : credentials.length === 0 ? (
          <EmptyState icon={KeyRound} title="No credentials issued" description="Time-boxed door codes appear here once issued." />
        ) : (
          <div className="flex flex-col gap-2">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 px-3.5 py-2.5">
                <KeyRound className="size-4 text-muted" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-text">
                    {formatDateTime(c.validFrom)} → {formatDateTime(c.validTo)}
                  </p>
                  <p className="text-[11px] capitalize text-faint">{c.type.replace('_', ' ')}</p>
                </div>
                <StatusBadge status={c.status} />
                {canManage(role) && c.status === 'active' && (
                  <button
                    onClick={() => revoke(c.id)}
                    title="Revoke"
                    className="flex-none rounded-lg p-1.5 text-faint hover:bg-err-soft hover:text-err"
                  >
                    <ShieldOff className="size-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <Modal open={showIssue} onClose={() => setShowIssue(false)} title="Issue an access credential">
        <IssueCredentialForm
          unitId={unitId}
          onIssued={() => {
            setShowIssue(false);
            void mutateCreds();
          }}
        />
      </Modal>
    </div>
  );
}

function IssueCredentialForm({ unitId, onIssued }: { unitId: string; onIssued: () => void }) {
  const { client } = useAuth();
  const [validFrom, setValidFrom] = useState('');
  const [validTo, setValidTo] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await client.access.credentials.issue({
        unitId,
        validFrom: new Date(validFrom).toISOString(),
        validTo: new Date(validTo).toISOString(),
      });
      toast.success(`Code issued: ${res.code} (shown once — write it down)`, { duration: 15000 });
      onIssued();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Valid from">
        <Input type="datetime-local" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
      </Field>
      <Field label="Valid to">
        <Input type="datetime-local" required value={validTo} onChange={(e) => setValidTo(e.target.value)} />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Issue code
      </Button>
    </form>
  );
}
