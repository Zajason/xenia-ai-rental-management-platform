'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../../lib/auth-context';
import { canAccessPath, visibleNavItems } from '../../lib/nav';
import { FullScreenLoader } from '../../components/ui/FullScreenLoader';
import { initials } from '../../lib/format';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { status, user, org, role, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  // A cleaner who types /dashboard/billing would otherwise sit on a spinner
  // while every request behind it 403s — send them back to the overview.
  useEffect(() => {
    if (status === 'authenticated' && !canAccessPath(role, pathname)) router.replace('/dashboard');
  }, [status, role, pathname, router]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (status !== 'authenticated' || !canAccessPath(role, pathname)) return <FullScreenLoader />;

  const items = visibleNavItems(role);

  return (
    <div className="min-h-screen bg-bg lg:grid lg:grid-cols-[240px_1fr]">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-surface lg:flex">
        <SidebarContent items={items} pathname={pathname} orgName={org?.name} />
      </aside>

      {/* Sidebar (mobile drawer) */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative flex h-full w-64 flex-col border-r border-border bg-surface">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text"
            >
              <X className="size-4" />
            </button>
            <SidebarContent items={items} pathname={pathname} orgName={org?.name} />
          </aside>
        </div>
      )}

      <div className="flex min-h-screen flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-30 flex h-14 flex-none items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur lg:px-8">
          <button
            className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-text lg:hidden"
            onClick={() => setMobileOpen(true)}
          >
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-[13px] font-medium text-text">{user?.name || user?.email}</p>
              <p className="text-[11.5px] capitalize text-faint">{role}</p>
            </div>
            <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-accent to-purple text-[12px] font-semibold text-[#08101f]">
              {initials(user?.name || user?.email)}
            </div>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-err"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function SidebarContent({
  items,
  pathname,
  orgName,
}: {
  items: ReturnType<typeof visibleNavItems>;
  pathname: string;
  orgName?: string;
}) {
  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border px-5 py-4">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-purple text-[14px] font-bold text-[#08101f]">
          X
        </div>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold leading-tight text-text">Xenia</p>
          <p className="truncate text-[11.5px] leading-tight text-faint">{orgName ?? '—'}</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="flex flex-col gap-0.5">
          {items.map((item) => {
            const active = item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
                    active ? 'bg-accent-soft text-accent' : 'text-muted hover:bg-surface-2 hover:text-text'
                  }`}
                >
                  <item.icon className="size-4 flex-none" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-border px-4 py-3">
        <a
          href="/docs"
          target="_blank"
          rel="noreferrer"
          className="block rounded-lg px-2 py-1.5 text-[11.5px] text-faint hover:text-muted"
        >
          API reference ↗
        </a>
      </div>
    </>
  );
}
