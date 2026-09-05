'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Bot, Globe, ScrollText, Settings2, User } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../../lib/auth-context';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Badge } from '../../../components/ui/Badge';
import { Select } from '../../../components/ui/Field';
import { formatDateTime } from '../../../lib/format';
import type { AuditEvent } from '@xenia/sdk';

const ACTOR_ICON: Record<AuditEvent['actorType'], LucideIcon> = {
  user: User,
  ai: Bot,
  system: Settings2,
  webhook: Globe,
};

const ACTOR_TONE: Record<AuditEvent['actorType'], 'accent' | 'purple' | 'neutral'> = {
  user: 'accent',
  ai: 'purple',
  system: 'neutral',
  webhook: 'neutral',
};

export default function AuditPage() {
  const { client } = useAuth();
  const [resourceType, setResourceType] = useState('');
  const { data: events } = useSWR(['audit', resourceType], () =>
    client.audit.list({ resourceType: resourceType || undefined, limit: 200 }),
  );

  // Filter options come from what the org has actually recorded — no invented list.
  const { data: allEvents } = useSWR('audit-all', () => client.audit.list({ limit: 200 }));
  const resourceTypes = [...new Set((allEvents ?? []).map((e) => e.resourceType))].sort();

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every write to your org — by you, your team, the AI, and inbound webhooks."
        action={
          resourceTypes.length > 0 && (
            <Select value={resourceType} onChange={(e) => setResourceType(e.target.value)} className="w-48">
              <option value="">All resources</option>
              {resourceTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          )
        }
      />

      <Card>
        <CardHeader title="Activity" subtitle={events ? `${events.length} events` : undefined} />
        {!events ? (
          <div className="p-5">
            <Skeleton className="h-24 w-full" />
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title="Nothing recorded yet"
            description="Actions across the platform show up here as they happen."
          />
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => {
              const Icon = ACTOR_ICON[e.actorType] ?? Settings2;
              return (
                <li key={e.id} className="flex items-start gap-3 px-5 py-3.5">
                  <div className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-lg bg-surface-2 text-muted">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] text-text">
                      <span className="font-medium">{e.action.replace(/[._]/g, ' ')}</span>{' '}
                      <span className="text-muted">on {e.resourceType.replace(/_/g, ' ')}</span>
                    </p>
                    {e.resourceId && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-faint">{e.resourceId}</p>
                    )}
                  </div>
                  <div className="flex flex-none items-center gap-3">
                    <Badge tone={ACTOR_TONE[e.actorType] ?? 'neutral'}>{e.actorType}</Badge>
                    <span className="w-28 text-right text-[12px] text-faint">{formatDateTime(e.at)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
