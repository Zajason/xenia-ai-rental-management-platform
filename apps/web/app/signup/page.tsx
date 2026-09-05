'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2, MailCheck, Ticket } from 'lucide-react';
import type { AuthSession } from '@xenia/sdk';
import { useAuth } from '../../lib/auth-context';
import { AuthShell } from '../../components/auth/AuthShell';
import { FullScreenLoader } from '../../components/ui/FullScreenLoader';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Tabs';
import { errorMessage } from '../../lib/api-error';

type Mode = 'owner' | 'invite';

/** Invite links handed out by /dashboard/team carry the token as ?invite=. */
function inviteTokenFromUrl(): string {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('invite') ?? '';
}

export default function SignupPage() {
  const { status, setSession } = useAuth();
  const router = useRouter();
  const [invitedToken] = useState(inviteTokenFromUrl);
  const [mode, setMode] = useState<Mode>(invitedToken ? 'invite' : 'owner');
  // Registering/accepting-an-invite here navigates somewhere specific
  // (/onboarding or /dashboard) — this flag stops the generic "already have a
  // session" redirect below from racing that explicit navigation and winning.
  const navigatedHereRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !navigatedHereRef.current) router.replace('/dashboard');
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') return <FullScreenLoader />;

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight text-text">Create your account</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">
        Xenia has two ways to join, depending on your role.
      </p>

      <div className="mt-6">
        <Tabs
          active={mode}
          onChange={(k) => setMode(k as Mode)}
          items={[
            { key: 'owner', label: 'Start an organization', icon: <Building2 className="size-3.5" /> },
            { key: 'invite', label: 'I have an invite', icon: <Ticket className="size-3.5" /> },
          ]}
        />
      </div>

      <div className="mt-6">
        {mode === 'owner' ? (
          <OwnerSignupForm
            onSuccess={async (session) => {
              navigatedHereRef.current = true;
              setSession(session);
              router.replace('/onboarding');
            }}
          />
        ) : (
          <InviteSignupForm
            initialToken={invitedToken}
            onSuccess={async (session) => {
              navigatedHereRef.current = true;
              setSession(session);
              router.replace('/dashboard');
            }}
          />
        )}
      </div>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-border bg-surface-2 p-3.5">
        <MailCheck className="mt-0.5 size-4 flex-none text-muted" />
        <p className="text-[12.5px] leading-relaxed text-muted">
          <strong className="text-text">Guests and vendors</strong> don&apos;t need a password — your host sends
          them a secure link for their stay or job, and that&apos;s what signs them in.
        </p>
      </div>

      <p className="mt-6 text-center text-[13px] text-muted">
        Already have an account?{' '}
        <a href="/login" className="font-medium text-accent hover:underline">
          Sign in
        </a>
      </p>
    </AuthShell>
  );
}

function OwnerSignupForm({ onSuccess }: { onSuccess: (session: AuthSession) => Promise<void> }) {
  const { client } = useAuth();
  const [orgName, setOrgName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const session = await client.auth.register({ orgName, name: name || undefined, email, password });
      await onSuccess(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Organization name" hint="e.g. your management company">
        <Input required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Aegean Stays" />
      </Field>
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Eleni Host" />
      </Field>
      <Field label="Email">
        <Input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Password" hint="min. 8 characters">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm">
          <Input
            type="password"
            required
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
      </div>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        Create organization <ArrowRight className="size-4" />
      </Button>
      <p className="mt-3 text-center text-[12px] text-faint">
        You&apos;ll be the <strong className="text-muted">owner</strong> and can add properties right away.
      </p>
    </form>
  );
}

function InviteSignupForm({
  initialToken,
  onSuccess,
}: {
  initialToken: string;
  onSuccess: (session: AuthSession) => Promise<void>;
}) {
  const { client } = useAuth();
  const [token, setToken] = useState(initialToken);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await client.auth.acceptInvite({ token, name: name || undefined, password });
      await onSuccess(session);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Invite token" hint="from your manager or owner">
        <Input
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="paste the token you were given"
          className="font-mono text-[12.5px]"
        />
      </Field>
      <Field label="Your name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nikos" />
      </Field>
      <Field label="Set a password" hint="min. 8 characters">
        <Input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
      </Field>
      {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
      <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
        Join team <ArrowRight className="size-4" />
      </Button>
    </form>
  );
}
