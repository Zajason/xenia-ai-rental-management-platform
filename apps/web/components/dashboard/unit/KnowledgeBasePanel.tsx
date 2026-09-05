'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import useSWR from 'swr';
import { BookOpen, Plus, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../lib/auth-context';
import { canManage } from '../../../lib/nav';
import { Button } from '../../ui/Button';
import { Field, Input, Select, Textarea } from '../../ui/Field';
import { Modal } from '../../ui/Modal';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { Badge } from '../../ui/Badge';
import { errorMessage } from '../../../lib/api-error';
import { formatDateTime } from '../../../lib/format';

export function KnowledgeBasePanel({ unitId }: { unitId: string }) {
  const { client, role } = useAuth();
  const { data: docs, mutate } = useSWR(`kb-docs-${unitId}`, () => client.kb.documents.list(unitId));
  const { data: stats, mutate: mutateStats } = useSWR(`kb-chunks-${unitId}`, () => client.kb.chunkStats(unitId));
  const [showCreate, setShowCreate] = useState(false);
  const [reindexing, setReindexing] = useState(false);

  async function reindex() {
    setReindexing(true);
    try {
      const res = await client.kb.reindexUnit(unitId);
      if (res.ok) toast.success(`Indexed ${res.chunks ?? 0} searchable chunks`);
      else toast.warning('AI service is offline — index will update once it is back');
      void mutateStats();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setReindexing(false);
    }
  }

  async function remove(id: string) {
    try {
      await client.kb.documents.remove(id);
      toast.success('Document removed');
      void mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-purple/20 bg-purple-soft/40 p-3.5">
        <div className="flex items-center gap-2.5">
          <Sparkles className="size-4 text-purple" />
          <div>
            <p className="text-[13px] font-medium text-text">
              {stats ? `${stats.chunks} searchable chunk${stats.chunks === 1 ? '' : 's'} indexed` : 'Loading index…'}
            </p>
            <p className="text-[11.5px] text-muted">What the AI concierge retrieves to answer guests</p>
          </div>
        </div>
        {canManage(role) && (
          <Button size="sm" onClick={reindex} loading={reindexing}>
            <RefreshCw className="size-3.5" /> Reindex
          </Button>
        )}
      </div>

      {canManage(role) && (
        <div className="mb-4 flex justify-end">
          <Button variant="primary" onClick={() => setShowCreate(true)}>
            <Plus className="size-4" /> Add document
          </Button>
        </div>
      )}

      {!docs ? (
        <Skeleton className="h-24 w-full" />
      ) : docs.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No documents yet"
          description="Write a house manual or local guide — the AI concierge will ground its answers in it."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.id} className="rounded-lg border border-border bg-surface-2 px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-medium text-text">{d.title}</p>
                    <Badge tone="purple">{d.sourceType.replace('_', ' ')}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[12.5px] text-muted">{d.content}</p>
                  <p className="mt-1.5 text-[11px] text-faint">v{d.version} · updated {formatDateTime(d.updatedAt)}</p>
                </div>
                {canManage(role) && (
                  <button
                    onClick={() => remove(d.id)}
                    className="flex-none rounded-lg p-1.5 text-faint hover:bg-err-soft hover:text-err"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add a knowledge document" width={560}>
        <DocumentForm
          unitId={unitId}
          onCreated={() => {
            setShowCreate(false);
            void mutate();
            void mutateStats();
          }}
        />
      </Modal>
    </div>
  );
}

function DocumentForm({ unitId, onCreated }: { unitId: string; onCreated: () => void }) {
  const { client } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [sourceType, setSourceType] = useState<'manual' | 'local_guide' | 'faq'>('manual');
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await client.kb.documents.create({ unitId, title, content, sourceType });
      toast.success('Document added — reindex to make it searchable');
      onCreated();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Title">
        <Input required autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="House Manual" />
      </Field>
      <Field label="Type">
        <Select value={sourceType} onChange={(e) => setSourceType(e.target.value as typeof sourceType)}>
          <option value="manual">House manual</option>
          <option value="local_guide">Local guide</option>
          <option value="faq">FAQ</option>
        </Select>
      </Field>
      <Field label="Content" hint={`${content.length}/20000`}>
        <Textarea
          required
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="The boiler switch is in the hallway closet…"
          className="min-h-40"
        />
      </Field>
      <Button type="submit" variant="primary" className="w-full" loading={loading}>
        Add document
      </Button>
    </form>
  );
}
