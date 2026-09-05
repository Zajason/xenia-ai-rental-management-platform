'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { BadgeEuro, CheckCircle2, Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Card, CardHeader } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { Field, Input, Select } from '../../../components/ui/Field';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton';
import { Badge, StatusBadge } from '../../../components/ui/Badge';
import { Table, THead, Th, Tr, Td } from '../../../components/ui/Table';
import { errorMessage } from '../../../lib/api-error';
import { formatDate, formatMoney } from '../../../lib/format';

export default function PricingPage() {
  const { client } = useAuth();
  const { data: rules, mutate: mutateRules } = useSWR('pricing-rules', () => client.pricing.rules.list());
  const { data: suggestions, mutate: mutateSuggestions } = useSWR('pricing-suggestions', () =>
    client.pricing.suggestions.list(),
  );
  const { data: units } = useSWR('units', () => client.units.list());
  const [showRule, setShowRule] = useState(false);
  const [showEvaluate, setShowEvaluate] = useState(false);

  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  async function accept(id: string) {
    try {
      await client.pricing.suggestions.accept(id);
      toast.success('Suggestion accepted — added to the rate calendar');
      void mutateSuggestions();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <PageHeader
        title="Pricing"
        description="Rules-based, explainable pricing suggestions."
        action={
          <div className="flex gap-2">
            <Button onClick={() => setShowRule(true)}>
              <Plus className="size-4" /> New rule
            </Button>
            <Button variant="primary" onClick={() => setShowEvaluate(true)}>
              <Sparkles className="size-4" /> Evaluate a day
            </Button>
          </div>
        }
      />

      <Card className="mb-6">
        <CardHeader title="Rules" />
        {!rules ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : rules.length === 0 ? (
          <EmptyState icon={BadgeEuro} title="No rules yet" description="e.g. discount last-minute, low-occupancy nights." />
        ) : (
          <ul className="divide-y divide-border">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div>
                  <p className="text-[13.5px] font-medium text-text">{r.name}</p>
                  <p className="text-[12px] text-muted">{r.unitId ? unitById.get(r.unitId)?.name : 'All units'}</p>
                </div>
                <Badge tone="accent">
                  {r.effect.adjustPct !== undefined
                    ? `${r.effect.adjustPct > 0 ? '+' : ''}${r.effect.adjustPct}%`
                    : r.effect.adjustAbs !== undefined
                      ? formatMoney(r.effect.adjustAbs)
                      : `min ${r.effect.setMinNights}n`}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Suggestions" />
        {!suggestions ? (
          <div className="p-5">
            <Skeleton className="h-16 w-full" />
          </div>
        ) : suggestions.length === 0 ? (
          <EmptyState icon={Sparkles} title="No suggestions yet" description="Evaluate a day to get an explainable price." />
        ) : (
          <Table>
            <THead>
              <Th>Unit</Th>
              <Th>Day</Th>
              <Th>Base</Th>
              <Th>Suggested</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </THead>
            <tbody>
              {suggestions.map((s) => (
                <Tr key={s.id}>
                  <Td>{unitById.get(s.unitId)?.name ?? '—'}</Td>
                  <Td>{formatDate(s.day)}</Td>
                  <Td>{formatMoney(s.currentPrice)}</Td>
                  <Td>
                    <span className="font-medium text-accent">{formatMoney(s.suggestedPrice)}</span>
                    {s.rationale && s.rationale.length > 0 && (
                      <span className="ml-1.5 text-[11px] text-faint">({s.rationale.length} rule{s.rationale.length === 1 ? '' : 's'})</span>
                    )}
                  </Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                  <Td align="right">
                    {s.status === 'suggested' && (
                      <Button size="sm" variant="primary" onClick={() => accept(s.id)}>
                        <CheckCircle2 className="size-3.5" /> Accept
                      </Button>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal open={showRule} onClose={() => setShowRule(false)} title="New pricing rule">
        <RuleForm
          units={units ?? []}
          onCreated={() => {
            setShowRule(false);
            void mutateRules();
          }}
        />
      </Modal>

      <Modal open={showEvaluate} onClose={() => setShowEvaluate(false)} title="Evaluate a day">
        <EvaluateForm
          units={units ?? []}
          onEvaluated={() => {
            setShowEvaluate(false);
            void mutateSuggestions();
          }}
        />
      </Modal>
    </div>
  );
}

function RuleForm({ units, onCreated }: { units: { id: string; name: string }[]; onCreated: () => void }) {
  const { client } = useAuth();
  const [name, setName] = useState('');
  const [unitId, setUnitId] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState('');
  const [maxOccupancy, setMaxOccupancy] = useState('');
  const [adjustPct, setAdjustPct] = useState('-15');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const conditions: Record<string, unknown> = {};
    if (leadTimeDays) conditions.leadTimeDays = { lt: Number(leadTimeDays) };
    if (maxOccupancy) conditions.occupancy = { lt: Number(maxOccupancy) / 100 };
    setLoading(true);
    try {
      await client.pricing.rules.create({
        name,
        unitId: unitId || undefined,
        conditions,
        effect: { adjustPct: Number(adjustPct) },
        priority: 10,
      });
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Rule name">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Last-minute low-occupancy discount" />
      </Field>
      <Field label="Applies to" hint="optional">
        <Select value={unitId} onChange={(e) => setUnitId(e.target.value)}>
          <option value="">All units</option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Lead time under" hint="days, optional">
          <Input type="number" min={0} value={leadTimeDays} onChange={(e) => setLeadTimeDays(e.target.value)} placeholder="3" />
        </Field>
        <Field label="Occupancy under" hint="%, optional">
          <Input type="number" min={0} max={100} value={maxOccupancy} onChange={(e) => setMaxOccupancy(e.target.value)} placeholder="50" />
        </Field>
      </div>
      <Field label="Price adjustment" hint="%, negative = discount">
        <Input type="number" required value={adjustPct} onChange={(e) => setAdjustPct(e.target.value)} />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Create rule
      </Button>
    </form>
  );
}

function EvaluateForm({ units, onEvaluated }: { units: { id: string; name: string }[]; onEvaluated: () => void }) {
  const { client } = useAuth();
  const [unitId, setUnitId] = useState('');
  const [day, setDay] = useState('');
  const [basePrice, setBasePrice] = useState('100');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ suggestedPrice: string; rationale: { reason: string }[] | null } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await client.pricing.suggestions.evaluate({ unitId, day, basePrice: Number(basePrice) });
      setResult(res);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div>
        <p className="mb-1 text-[12px] uppercase tracking-wide text-faint">Suggested price</p>
        <p className="mb-3 text-3xl font-semibold text-accent">{formatMoney(result.suggestedPrice)}</p>
        {result.rationale && result.rationale.length > 0 ? (
          <ul className="mb-4 flex flex-col gap-1.5">
            {result.rationale.map((r, i) => (
              <li key={i} className="text-[12.5px] text-muted">
                • {r.reason}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-[12.5px] text-faint">No rules fired — base price unchanged.</p>
        )}
        <Button variant="primary" className="w-full" onClick={onEvaluated}>
          Done
        </Button>
      </div>
    );
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
      <Field label="Day">
        <Input type="date" required value={day} onChange={(e) => setDay(e.target.value)} />
      </Field>
      <Field label="Base price">
        <Input type="number" min={1} required value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Evaluate
      </Button>
    </form>
  );
}
