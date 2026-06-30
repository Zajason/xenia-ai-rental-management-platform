/** RBAC roles, mirrored by the `member_role` enum in @xenia/db. */
export const ROLES = ['owner', 'manager', 'admin', 'cleaner'] as const;
export type Role = (typeof ROLES)[number];

/** Coarse capability map used by the API's RBAC guard. Refine per-resource later. */
export const ROLE_CAPABILITIES: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['*'],
  manager: [
    'property:*',
    'booking:*',
    'task:*',
    'maintenance:*',
    'messaging:*',
    'pricing:*',
    'analytics:read',
  ],
  cleaner: ['task:read', 'task:update:assigned', 'media:upload'],
};

export function can(role: Role, capability: string): boolean {
  const caps = ROLE_CAPABILITIES[role];
  if (caps.includes('*')) return true;
  if (caps.includes(capability)) return true;
  const [domain] = capability.split(':');
  return caps.includes(`${domain}:*`);
}
