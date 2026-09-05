'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { ClipboardList, Plus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
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
import { formatDateTime } from '../../../lib/format';
import type { Task, TaskType } from '@xenia/sdk';

export default function TasksPage() {
  const { client, role } = useAuth();
  const { data: tasks, mutate: mutateTasks } = useSWR('tasks', () => client.tasks.list());
  const { data: units } = useSWR('units', () => client.units.list());
  const { data: staff, mutate: mutateStaff } = useSWR('staff', () => client.staff.list());

  const [showCreate, setShowCreate] = useState(false);
  const [assignTask, setAssignTask] = useState<Task | null>(null);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  async function accept(taskId: string) {
    try {
      await client.tasks.accept(taskId);
      toast.success('Task accepted');
      void mutateTasks();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function complete(taskId: string) {
    try {
      await client.tasks.complete(taskId);
      toast.success('Task completed — unit marked ready');
      void mutateTasks();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Tasks"
        description="Cleaning, inspections, and turnovers."
        action={
          canManage(role) && (
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> New task
            </Button>
          )
        }
      />

      <Card className="mb-6">
        <CardHeader title="All tasks" />
        {!tasks ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : tasks.length === 0 ? (
          <EmptyState icon={ClipboardList} title="No tasks yet" description="Turnover tasks appear here as bookings come in." />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Type</Th>
              <Th>Due</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </THead>
            <tbody>
              {tasks.map((t) => (
                <Tr key={t.id}>
                  <Td>{unitById.get(t.unitId)?.name ?? '—'}</Td>
                  <Td className="capitalize">{t.type}</Td>
                  <Td>{t.dueAt ? formatDateTime(t.dueAt) : '—'}</Td>
                  <Td>
                    <StatusBadge status={t.status} />
                  </Td>
                  <Td align="right">
                    <div className="flex justify-end gap-1.5">
                      {canManage(role) && ['pending', 'assigned'].includes(t.status) && (
                        <Button size="sm" onClick={() => setAssignTask(t)}>
                          <UserCheck className="size-3.5" /> Assign
                        </Button>
                      )}
                      {role === 'cleaner' && t.status === 'assigned' && (
                        <Button size="sm" onClick={() => accept(t.id)}>
                          Accept
                        </Button>
                      )}
                      {(role === 'cleaner' || canManage(role)) && ['accepted', 'in_progress'].includes(t.status) && (
                        <Button size="sm" variant="primary" onClick={() => complete(t.id)}>
                          Complete
                        </Button>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Card>
        <CardHeader title="Staff" subtitle="Cleaners and inspectors" />
        {!staff ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : staff.length === 0 ? (
          <EmptyState icon={UserCheck} title="No staff yet" description="Invite a cleaner from the Team page to assign tasks to them." />
        ) : (
          <div className="flex flex-wrap gap-2 p-5">
            {staff.map((s) => (
              <span key={s.id} className="rounded-full border border-border-strong bg-surface-2 px-3 py-1 text-[12.5px] text-text">
                {s.name} <span className="text-faint">· {s.role}</span>
              </span>
            ))}
          </div>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New task">
        <TaskForm
          units={units ?? []}
          onCreated={() => {
            setShowCreate(false);
            void mutateTasks();
          }}
        />
      </Modal>

      <Modal open={!!assignTask} onClose={() => setAssignTask(null)} title="Assign task">
        {assignTask && (
          <AssignForm
            staff={staff ?? []}
            onAssign={async (staffId) => {
              try {
                await client.tasks.assign(assignTask.id, staffId);
                toast.success('Task assigned');
                setAssignTask(null);
                void mutateTasks();
                void mutateStaff();
              } catch (err) {
                toast.error(errorMessage(err));
              }
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function TaskForm({ units, onCreated }: { units: { id: string; name: string }[]; onCreated: () => void }) {
  const { client } = useAuth();
  const [unitId, setUnitId] = useState('');
  const [type, setType] = useState<TaskType>('cleaning');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await client.tasks.create({ unitId, type, dueAt: dueAt ? new Date(dueAt).toISOString() : undefined });
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
      <Field label="Type">
        <Select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
          <option value="cleaning">Cleaning</option>
          <option value="inspection">Inspection</option>
          <option value="restock">Restock</option>
          <option value="custom">Custom</option>
        </Select>
      </Field>
      <Field label="Due" hint="optional">
        <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Create task
      </Button>
    </form>
  );
}

function AssignForm({
  staff,
  onAssign,
}: {
  staff: { id: string; name: string }[];
  onAssign: (staffId: string) => Promise<void>;
}) {
  const [staffId, setStaffId] = useState('');
  const [loading, setLoading] = useState(false);

  if (staff.length === 0) {
    return <EmptyState icon={UserCheck} title="No staff to assign" description="Invite a cleaner from the Team page first." />;
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setLoading(true);
        await onAssign(staffId);
        setLoading(false);
      }}
    >
      <Field label="Staff member">
        <Select required value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">Select…</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Assign
      </Button>
    </form>
  );
}
