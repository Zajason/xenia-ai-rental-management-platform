'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, DoorOpen, MapPin, Plus } from 'lucide-react';
import { useAuth } from '../../../../lib/auth-context';
import { canManage } from '../../../../lib/nav';
import { Card, CardBody, CardHeader } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Modal } from '../../../../components/ui/Modal';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { StatusBadge } from '../../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../../components/ui/Table';
import { UnitForm } from '../../../../components/dashboard/UnitForm';
import { FullScreenLoader } from '../../../../components/ui/FullScreenLoader';

export default function PropertyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { client, role } = useAuth();
  const { data: properties } = useSWR('properties', () => client.properties.list());
  const { data: units, mutate: mutateUnits } = useSWR('units', () => client.units.list());
  const [showCreate, setShowCreate] = useState(false);

  if (!properties) return <FullScreenLoader />;
  const property = properties.find((p) => p.id === id);
  if (!property) {
    return (
      <Card>
        <EmptyState icon={DoorOpen} title="Property not found" description="It may have been removed." />
      </Card>
    );
  }

  const propertyUnits = (units ?? []).filter((u) => u.propertyId === id);

  return (
    <div>
      <button
        onClick={() => router.push('/dashboard/properties')}
        className="mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Properties
      </button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">{property.name}</h1>
          {property.address && (
            <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-muted">
              <MapPin className="size-3.5" /> {property.address} · {property.timezone}
            </p>
          )}
        </div>
        {canManage(role) && (
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Add unit
          </Button>
        )}
      </div>

      <Card>
        <CardHeader title="Units" subtitle={`${propertyUnits.length} unit${propertyUnits.length === 1 ? '' : 's'}`} />
        {!units ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : propertyUnits.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            title="No units yet"
            description="Add the first bookable space at this property."
            action={
              canManage(role) && (
                <Button variant="primary" onClick={() => setShowCreate(true)}>
                  <Plus className="size-4" /> Add unit
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Capacity</Th>
              <Th>Bedrooms</Th>
              <Th>Status</Th>
            </THead>
            <tbody>
              {propertyUnits.map((u) => (
                <Tr key={u.id} onClick={() => router.push(`/dashboard/properties/${id}/units/${u.id}`)}>
                  <Td>{u.name}</Td>
                  <Td>{u.capacity} guests</Td>
                  <Td>{u.bedrooms}</Td>
                  <Td>
                    <StatusBadge status={u.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title={`Add a unit at ${property.name}`}>
        <UnitForm
          propertyId={property.id}
          onCreated={() => {
            setShowCreate(false);
            void mutateUnits();
          }}
        />
      </Modal>
    </div>
  );
}
