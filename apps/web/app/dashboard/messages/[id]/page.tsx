'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../../lib/auth-context';
import { Card } from '../../../../components/ui/Card';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Field';
import { StatusBadge } from '../../../../components/ui/Badge';
import { FullScreenLoader } from '../../../../components/ui/FullScreenLoader';
import { errorMessage } from '../../../../lib/api-error';
import { formatDateTime } from '../../../../lib/format';

export default function ConversationThreadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { client } = useAuth();
  const { data: conversations } = useSWR('conversations', () => client.conversations.list());
  const { data: messages, mutate } = useSWR(`messages-${id}`, () => client.conversations.messages(id));
  const { data: units } = useSWR('units', () => client.units.list());
  const { data: guests } = useSWR('guests', () => client.guests.list());

  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const conversation = conversations?.find((c) => c.id === id);
  const unit = conversation?.unitId ? units?.find((u) => u.id === conversation.unitId) : undefined;
  const guest = conversation?.guestId ? guests?.find((g) => g.id === conversation.guestId) : undefined;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    try {
      await client.conversations.send(id, body);
      setBody('');
      void mutate();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  if (!messages) return <FullScreenLoader />;

  return (
    <div>
      <button
        onClick={() => router.push('/dashboard/messages')}
        className="mb-4 flex items-center gap-1.5 text-[13px] text-muted hover:text-text"
      >
        <ArrowLeft className="size-3.5" /> Messages
      </button>

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text">{guest?.name ?? 'Guest'}</h1>
          {unit && <p className="text-[13px] text-muted">{unit.name}</p>}
        </div>
        {conversation && <StatusBadge status={conversation.status} />}
      </div>

      <Card>
        <div className="flex h-[55vh] flex-col gap-3 overflow-y-auto p-5">
          {messages.length === 0 ? (
            <p className="m-auto text-[13px] text-faint">No messages yet</p>
          ) : (
            messages.map((m) => <MessageBubble key={m.id} message={m} />)
          )}
          <div ref={bottomRef} />
        </div>
        <form onSubmit={submit} className="flex gap-2 border-t border-border p-3">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Reply as the host…"
            className="flex-1"
          />
          <Button type="submit" variant="primary" loading={sending}>
            <Send className="size-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}

function MessageBubble({ message }: { message: { senderType: string; body: string; sentAt: string } }) {
  const isGuest = message.senderType === 'guest';
  const isSystem = message.senderType === 'system';
  const isAi = message.senderType === 'ai';

  if (isSystem) {
    return <p className="mx-auto max-w-md text-center text-[12px] text-warn">{message.body}</p>;
  }

  return (
    <div className={`flex flex-col ${isGuest ? 'items-start' : 'items-end'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 text-[13.5px] ${
          isGuest
            ? 'rounded-bl-sm border border-border-strong bg-surface-2 text-text'
            : isAi
              ? 'rounded-br-sm border border-purple/25 bg-purple-soft text-text'
              : 'rounded-br-sm bg-accent text-[#08101f]'
        }`}
      >
        {isAi && (
          <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-purple">
            <Sparkles className="size-3" /> AI concierge
          </p>
        )}
        {message.body}
      </div>
      <p className="mt-1 text-[10.5px] text-faint">{formatDateTime(message.sentAt)}</p>
    </div>
  );
}
