'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, CheckCircle2, DoorOpen } from 'lucide-react';
import type { Property } from '@xenia/sdk';
import { useAuth } from '../../lib/auth-context';
import { FullScreenLoader } from '../../components/ui/FullScreenLoader';
import { Card, CardBody, CardHeader } from '../../components/ui/Card';
import { PropertyForm } from '../../components/dashboard/PropertyForm';
import { UnitForm } from '../../components/dashboard/UnitForm';

type Step = 'property' | 'unit' | 'done';

/**
 * The first-run funnel for a freshly registered owner: create the first
 * property, then its first unit, reusing the exact same forms the dashboard's
 * Properties page uses. Every step can be skipped — the empty-state CTAs on
 * /dashboard/properties do the same job later.
 */
export default function OnboardingPage() {
  const { status, org } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>('property');
  const [property, setProperty] = useState<Property | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <FullScreenLoader />;

  const steps = [
    { key: 'property', label: 'Property', icon: Building2 },
    { key: 'unit', label: 'First unit', icon: DoorOpen },
  ] as const;

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-[12.5px] font-medium uppercase tracking-wide text-accent">Welcome to {org?.name}</p>
          <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-text">Set up your first property</h1>
          <p className="mt-1.5 text-[13.5px] text-muted">Takes about a minute — you can always add more later.</p>
        </div>

        <div className="mb-6 flex items-center justify-center gap-2">
          {steps.map((s, i) => {
            const isDone = step === 'done' || (s.key === 'property' && step !== 'property');
            const isActive = s.key === step;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <div
                  className={`flex size-7 items-center justify-center rounded-full border text-[12px] font-medium ${
                    isDone
                      ? 'border-ok/40 bg-ok-soft text-ok'
                      : isActive
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-border-strong bg-surface-2 text-faint'
                  }`}
                >
                  {isDone ? <CheckCircle2 className="size-4" /> : i + 1}
                </div>
                <span className={`text-[12.5px] ${isActive ? 'text-text' : 'text-faint'}`}>{s.label}</span>
                {i < steps.length - 1 && <div className="h-px w-6 bg-border-strong" />}
              </div>
            );
          })}
        </div>

        <Card>
          {step === 'property' && (
            <>
              <CardHeader title="Create a property" subtitle="A villa, apartment building, or single listing." />
              <CardBody>
                <PropertyForm
                  onCreated={(p) => {
                    setProperty(p);
                    setStep('unit');
                  }}
                />
              </CardBody>
            </>
          )}

          {step === 'unit' && property && (
            <>
              <CardHeader title={`Add a unit at ${property.name}`} subtitle="The bookable space guests stay in." />
              <CardBody>
                <UnitForm propertyId={property.id} onCreated={() => router.replace('/dashboard')} submitLabel="Finish setup" />
              </CardBody>
            </>
          )}
        </Card>

        <button
          onClick={() => router.replace('/dashboard')}
          className="mt-4 w-full text-center text-[13px] text-muted hover:text-text"
        >
          Skip for now — I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}
