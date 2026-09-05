'use client';

import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Building2 } from 'lucide-react';
import { ApiError } from '@xenia/sdk';
import { useAuth } from '../../lib/auth-context';
import { AuthShell } from '../../components/auth/AuthShell';
import { FullScreenLoader } from '../../components/ui/FullScreenLoader';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { errorMessage } from '../../lib/api-error';

interface OrgChoice {
  slug: string;
  name: string;
}

export default function LoginPage() {
  const { status, client, setSession } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [orgChoices, setOrgChoices] = useState<OrgChoice[] | null>(null);
  const [orgSlug, setOrgSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  // See the identical guard in signup/page.tsx: stops the generic redirect
  // below from racing the explicit navigation this page's own submit does.
  const navigatedHereRef = useRef(false);

  useEffect(() => {
    if (status === 'authenticated' && !navigatedHereRef.current) router.replace('/dashboard');
  }, [status, router]);

  if (status === 'loading' || status === 'authenticated') return <FullScreenLoader />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const session = await client.auth.login({ email, password, orgSlug: orgSlug || undefined });
      navigatedHereRef.current = true;
      setSession(session);
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400 && Array.isArray((err.body as { organizations?: OrgChoice[] })?.organizations)) {
        setOrgChoices((err.body as { organizations: OrgChoice[] }).organizations);
      } else {
        setError(errorMessage(err));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold tracking-tight text-text">Welcome back</h1>
      <p className="mt-1.5 text-[13.5px] text-muted">Sign in to your Xenia operations dashboard.</p>

      <form onSubmit={submit} className="mt-7">
        {orgChoices ? (
          <div>
            <p className="mb-3 text-[13px] text-muted">
              <strong className="text-text">{email}</strong> belongs to more than one organization. Pick one to
              continue.
            </p>
            <div className="mb-4 flex flex-col gap-2">
              {orgChoices.map((org) => (
                <button
                  type="button"
                  key={org.slug}
                  onClick={() => setOrgSlug(org.slug)}
                  className={`flex items-center gap-3 rounded-lg border px-3.5 py-3 text-left text-sm transition-colors ${
                    orgSlug === org.slug
                      ? 'border-accent bg-accent-soft text-text'
                      : 'border-border-strong bg-surface-2 text-muted hover:text-text'
                  }`}
                >
                  <Building2 className="size-4 flex-none" />
                  <span>
                    <span className="block font-medium">{org.name}</span>
                    <span className="block text-[12px] text-faint">{org.slug}</span>
                  </span>
                </button>
              ))}
            </div>
            {error && <p className="mb-4 text-[12.5px] text-err">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading} disabled={!orgSlug}>
              Continue <ArrowRight className="size-4" />
            </Button>
            <button
              type="button"
              onClick={() => {
                setOrgChoices(null);
                setOrgSlug('');
              }}
              className="mt-3 w-full text-center text-[12.5px] text-muted hover:text-text"
            >
              Use a different account
            </button>
          </div>
        ) : (
          <>
            <Field label="Email">
              <Input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </Field>
            {error && <p className="mb-4 -mt-1 text-[12.5px] text-err">{error}</p>}
            <Button type="submit" variant="primary" size="lg" className="w-full" loading={loading}>
              Sign in <ArrowRight className="size-4" />
            </Button>
          </>
        )}
      </form>

      <p className="mt-6 text-center text-[13px] text-muted">
        New to Xenia?{' '}
        <a href="/signup" className="font-medium text-accent hover:underline">
          Create an account
        </a>
      </p>
    </AuthShell>
  );
}
