'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { FullScreenLoader } from '../components/ui/FullScreenLoader';

/**
 * The root route never renders content — it's a pure redirect based on
 * session state. An authenticated user (of any staff role) lands straight on
 * the dashboard with no intermediate step; otherwise they go to /login.
 */
export default function RootPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') router.replace('/dashboard');
    else if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  return <FullScreenLoader />;
}
