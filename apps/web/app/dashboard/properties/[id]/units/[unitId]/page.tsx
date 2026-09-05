'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, BookOpen, DoorOpen, KeyRound, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../../../lib/auth-context';
import { canManage } from '../../../../../../lib/nav';
import { Card, CardBody } from '../../../../../../components/ui/Card';
import { Tabs } from '../../../../../../components/ui/Tabs';
import { Select } from '../../../../../../components/ui/Field';
import { StatusBadge } from '../../../../../../components/ui/Badge';
import { EmptyState } from '../../../../../../components/ui/EmptyState';
import { FullScreenLoader } from '../../../../../../components/ui/FullScreenLoader';
import { FactsPanel } from '../../../../../../components/dashboard/unit/FactsPanel';
import { KnowledgeBasePanel } from '../../../../../../components/dashboard/unit/KnowledgeBasePanel';
import { AccessPanel } from '../../../../../../components/dashboard/unit/AccessPanel';
import { AvailabilityPanel } from '../../../../../../components/dashboard/unit/AvailabilityPanel';
import { errorMessage } from '../../../../../../lib/api-error';
import type { UnitStatus } from '@xenia/sdk';

type Tab = 'facts' | 'kb' | 'access' | 'availability';

export default function UnitDetailPage() {
  const { id: propertyId, unitId } = useParams<{ id: string; unitId: string }>();
  const router = useRouter();
  const { client, role } = useAuth();
  const { data: properties } = useSWR('properties', () => client.properties.list());
  const { data: units, mutate: mutateUnits } = useSWR('units', () => client.units.list());
  const [tab, setTab] = useState<Tab>('facts');
  const [updatingStatus, setUpdatingStatus] = useState(false);

  if (!properties || !units) return <FullScreenLoader />;

  const property = properties.find((p) => p.id === propertyId);
  const unit = units.find((u) => u.id === unitId);

  if (!unit) {
    return (
      <Card>
        <EmptyState icon={DoorOpen} title="Unit not found" description="It may have been removed." />
      </Card>
    );
  }

  async function updateStatus(status: UnitStatus) {
    setUpdatingStatus(true);
    try {
      await client.units.update(unit!.id, { status });
      toast.success(`Marked as ${status}`);
      void mutateUnits();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setUpdatingStatus(false);
    }
  }

  return (
    <div>
      <button
        onClick={() => router.push(`/dashboard/properties/${propertyId}`)}
        className="mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> {property?.name ?? 'Property'}
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">{unit.name}</h1>
          <p className="mt-1 text-[13.5px] text-muted">
            {unit.capacity} guests · {unit.bedrooms} bedroom{unit.bedrooms === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <StatusBadge status={unit.status} />
          {canManage(role) && (
            <Select
              value=""
              disabled={updatingStatus}
              onChange={(e) => e.target.value && updateStatus(e.target.value as UnitStatus)}
              className="w-40"
            >
              <option value="">Change status…</option>
              {(['ready', 'dirty', 'maintenance', 'blocked'] as const)
                .filter((s) => s !== unit.status)
                .map((s) => (
                  <option key={s} value={s}>
                    Mark {s}
                  </option>
                ))}
            </Select>
          )}
        </div>
      </div>

      <Card>
        <div className="border-b border-border p-3">
          <Tabs
            active={tab}
            onChange={(k) => setTab(k as Tab)}
            items={[
              { key: 'facts', label: 'Facts', icon: <Tag className="size-3.5" /> },
              { key: 'kb', label: 'Knowledge base', icon: <BookOpen className="size-3.5" /> },
              { key: 'access', label: 'Access', icon: <KeyRound className="size-3.5" /> },
              { key: 'availability', label: 'Availability', icon: <DoorOpen className="size-3.5" /> },
            ]}
          />
        </div>
        <CardBody>
          {tab === 'facts' && <FactsPanel unitId={unit.id} />}
          {tab === 'kb' && <KnowledgeBasePanel unitId={unit.id} />}
          {tab === 'access' && <AccessPanel unitId={unit.id} />}
          {tab === 'availability' && <AvailabilityPanel unitId={unit.id} />}
        </CardBody>
      </Card>
    </div>
  );
}
