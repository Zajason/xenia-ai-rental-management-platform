'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { Copy, Sparkles, UserPlus, UsersRound } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { isSuperRole } from '../../../lib/nav';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Badge } from '../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { errorMessage } from '../../../lib/api-error';
import { formatDate, initials } from '../../../lib/format';
import type { Role } from '@xenia/sdk';

const ROLE_TONE: Record<Role, 'accent' | 'purple' | 'neutral'> = {
  owner: 'accent',
  admin: 'accent',
  manager: 'purple',
  cleaner: 'neutral',
};

export default function TeamPage() {
  const { client, role, user } = useAuth();
  const { data: members, mutate: mutateMembers } = useSWR('members', () => client.auth.members());
  const { data: staff, mutate: mutateStaff } = useSWR('staff', () => client.staff.list());
  const [showInvite, setShowInvite] = useState(false);
  const [showStaff, setShowStaff] = useState(false);

  return (
    <div>
      <PageHeader
        title="Team"
        description="Who has access to this organization, and who does the work on the ground."
        action={
          <Button variant="primary" onClick={() => setShowInvite(true)}>
            <UserPlus className="size-4" /> Invite teammate
          </Button>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Members" subtitle="Accounts with a login to this org" />
        {!members ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : members.length === 0 ? (
          <EmptyState icon={UsersRound} title="No members yet" description="Invite a manager or cleaner to get started." />
        ) : (
          <Table>
            <THead>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Role</Th>
              <Th>Joined</Th>
            </THead>
            <tbody>
              {members.map((m) => (
                <Tr key={m.userId}>
                  <Td>
                    <span className="flex items-center gap-2.5">
                      <span className="flex size-7 flex-none items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted">
                        {initials(m.name ?? m.email)}
                      </span>
                      {m.name ?? '—'}
                      {m.userId === user?.id && <span className="text-[11px] text-faint">you</span>}
                    </span>
                  </Td>
                  <Td>{m.email}</Td>
                  <Td>
                    <Badge tone={ROLE_TONE[m.role]}>{m.role}</Badge>
                  </Td>
                  <Td>{formatDate(m.joinedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Cleaning staff"
          subtitle="People you can assign turnover tasks to"
          action={
            <Button onClick={() => setShowStaff(true)}>
              <UserPlus className="size-4" /> Add staff
            </Button>
          }
        />
        {!staff ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : staff.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="No staff yet"
            description="Add a cleaner so you can assign tasks and pay them out."
          />
        ) : (
          <ul className="divide-y divide-border">
            {staff.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-text">{s.name}</p>
                  <p className="text-[12px] text-muted">
                    {s.phone ?? 'no phone'}
                    {s.skills.length > 0 && ` · ${s.skills.join(', ')}`}
                  </p>
                </div>
                <Badge tone="neutral">{s.role}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite a teammate">
        <InviteForm
          canInviteAdmins={isSuperRole(role)}
          onDone={() => {
            setShowInvite(false);
            void mutateMembers();
          }}
        />
      </Modal>

      <Modal open={showStaff} onClose={() => setShowStaff(false)} title="Add cleaning staff">
        <StaffForm
          onCreated={() => {
            setShowStaff(false);
            void mutateStaff();
          }}
        />
      </Modal>
    </div>
  );
}

function InviteForm({ canInviteAdmins, onDone }: { canInviteAdmins: boolean; onDone: () => void }) {
  const { client } = useAuth();
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('cleaner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{ token: string; expiresAt: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await client.auth.invite({ email, role: inviteRole });
      setIssued({ token: res.token, expiresAt: res.expiresAt });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (issued) {
    const link = `${window.location.origin}/signup?invite=${encodeURIComponent(issued.token)}`;
    return (
      <div>
        <p className="mb-3 text-[13px] text-muted">
          Invite created for <strong className="text-text">{email}</strong>. Send them this link —{' '}
          <strong className="text-text">it is shown only once</strong> and expires {formatDate(issued.expiresAt)}.
        </p>
        <div className="mb-4 rounded-lg border border-border-strong bg-surface-2 p-3 font-mono text-[12px] break-all text-text">
          {link}
        </div>
        <Button
          className="w-full"
          onClick={() => {
            navigator.clipboard.writeText(link);
            toast.success('Invite link copied');
          }}
        >
          <Copy className="size-3.5" /> Copy invite link
        </Button>
        <Button variant="primary" className="mt-2 w-full" onClick={onDone}>
          Done
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <Field label="Email">
        <Input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="teammate@example.com"
        />
      </Field>
      <Field label="Role">
        <Select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as Role)}>
          <option value="cleaner">Cleaner — own tasks only</option>
          <option value="manager">Manager — day-to-day operations</option>
          {canInviteAdmins && <option value="admin">Admin — full access</option>}
        </Select>
      </Field>
      <p className="mb-4 -mt-1 text-[12px] text-faint">
        Xenia doesn&apos;t send email yet — you&apos;ll get a link to share yourself.
      </p>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Create invite
      </Button>
    </form>
  );
}

function StaffForm({ onCreated }: { onCreated: () => void }) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [staffRole, setStaffRole] = useState('cleaner');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.staff.create({ name, phone: phone || undefined, role: staffRole });
      toast.success('Staff member added');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Name">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Maria Silva" />
      </Field>
      <Field label="Phone" hint="optional">
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+30 690 000 0000" />
      </Field>
      <Field label="Role">
        <Select value={staffRole} onChange={(e) => setStaffRole(e.target.value)}>
          <option value="cleaner">Cleaner</option>
          <option value="inspector">Inspector</option>
          <option value="manager">Manager</option>
        </Select>
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Add staff member
      </Button>
    </form>
  );
}
