import type { LucideIcon } from 'lucide-react';
import {
  BadgeEuro,
  CalendarRange,
  ClipboardList,
  CreditCard,
  Home,
  KeyRound,
  MessageSquare,
  ScrollText,
  Users,
  UsersRound,
  Wrench,
} from 'lucide-react';
import type { Role } from '@xenia/sdk';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Roles that can see this item; omit for "every staff role". */
  roles?: Role[];
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Overview', icon: Home },
  { href: '/dashboard/properties', label: 'Properties', icon: KeyRound },
  { href: '/dashboard/bookings', label: 'Bookings', icon: CalendarRange },
  { href: '/dashboard/tasks', label: 'Tasks', icon: ClipboardList },
  { href: '/dashboard/maintenance', label: 'Maintenance', icon: Wrench },
  { href: '/dashboard/guests', label: 'Guests', icon: Users },
  { href: '/dashboard/messages', label: 'Messages', icon: MessageSquare },
  { href: '/dashboard/pricing', label: 'Pricing', icon: BadgeEuro, roles: ['owner', 'admin', 'manager'] },
  { href: '/dashboard/team', label: 'Team', icon: UsersRound, roles: ['owner', 'admin', 'manager'] },
  { href: '/dashboard/billing', label: 'Billing', icon: CreditCard, roles: ['owner', 'admin'] },
  { href: '/dashboard/audit', label: 'Audit log', icon: ScrollText, roles: ['owner', 'admin'] },
];

export function visibleNavItems(role: Role | null): NavItem[] {
  return NAV_ITEMS.filter((item) => !item.roles || (role && item.roles.includes(role)));
}

/**
 * Whether a role may open a dashboard route directly (typed URL, stale tab).
 * The API enforces this too — this only avoids rendering a page whose every
 * request will 403.
 */
export function canAccessPath(role: Role | null, pathname: string): boolean {
  const item = NAV_ITEMS.filter((i) => i.href !== '/dashboard')
    .find((i) => pathname.startsWith(i.href));
  if (!item?.roles) return true;
  return !!role && item.roles.includes(role);
}

/** owner/admin are org superusers everywhere in the UI, same as the backend. */
export function isSuperRole(role: Role | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function canManage(role: Role | null): boolean {
  return isSuperRole(role) || role === 'manager';
}
