'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Building2, DoorOpen, MapPin, Plus } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardBody } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { PropertyForm } from '../../../components/dashboard/PropertyForm';

export default function PropertiesPage() {
  const { client, role } = useAuth();
  const { data: properties, mutate: mutateProperties } = useSWR('properties', () => client.properties.list());
  const { data: units } = useSWR('units', () => client.units.list());
  const [showCreate, setShowCreate] = useState(false);

  const unitCountFor = (propertyId: string) => (units ?? []).filter((u) => u.propertyId === propertyId).length;

  return (
    <div>
      <PageHeader
        title="Properties"
        description="Every building and listing you manage."
        action={
          canManage(role) && (
            <Button variant="primary" onClick={() => setShowCreate(true)}>
              <Plus className="size-4" /> Add property
            </Button>
          )
        }
      />

      {!properties ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No properties yet"
            description="Add your first property to start managing units, bookings, and guests."
            action={
              canManage(role) && (
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" /> Add property
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {properties.map((p) => (
            <Link key={p.id} href={`/dashboard/properties/${p.id}`}>
              <Card className="h-full transition-colors hover:border-accent/40">
                <CardBody>
                  <div className="flex items-start justify-between">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-accent">
                      <Building2 className="size-4.5" />
                    </div>
                    <span className="rounded-full border border-border-strong bg-surface-2 px-2 py-0.5 text-[11px] text-muted">
                      {p.timezone}
                    </span>
                  </div>
                  <p className="mt-3 text-[14.5px] font-semibold text-text">{p.name}</p>
                  {p.address && (
                    <p className="mt-1 flex items-center gap-1 text-[12.5px] text-muted">
                      <MapPin className="size-3 flex-none" /> {p.address}
                    </p>
                  )}
                  <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-faint">
                    <DoorOpen className="size-3.5" /> {unitCountFor(p.id)} unit{unitCountFor(p.id) === 1 ? '' : 's'}
                  </p>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add a property">
        <PropertyForm
          onCreated={() => {
            setShowCreate(false);
            void mutateProperties();
          }}
        />
      </Modal>
    </div>
  );
}
