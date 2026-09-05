/**
 * Typed HTTP client for the Xenia API, consumed by the frontends. Framework
 * agnostic (no React dependency) so it can be reused by every app in
 * `apps/*` — the web dashboard today, the planned guest/cleaner surfaces
 * later.
 *
 * Session-aware: pass `getAccessToken`/`getRefreshToken`/`onTokensRefreshed`
 * and a 401 triggers exactly one `/auth/refresh` + retry before giving up and
 * calling `onSessionExpired`. Concurrent 401s share a single in-flight
 * refresh so the rotating refresh token isn't raced.
 */
export * from './types';
import type {
  AccessCredential,
  AccessEvent,
  AuditEvent,
  AuthSession,
  AvailabilityBlock,
  Booking,
  Channel,
  ChannelWithSecret,
  ConciergeReply,
  Conversation,
  Guest,
  GuestDetail,
  KbDocument,
  Lock,
  MaintenanceTicket,
  Member,
  Message,
  Payout,
  PricingRule,
  PricingSuggestion,
  Property,
  PropertyFact,
  Role,
  Staff,
  Subscription,
  Task,
  Unit,
  Vendor,
  VendorAssignment,
} from './types';

export interface ApiIssue {
  path: string;
  message: string;
}

/** A failed API call. `body` is the raw parsed error payload, if any. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly issues?: ApiIssue[];
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(extractMessage(body));
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
    if (body && typeof body === 'object') {
      const b = body as Record<string, unknown>;
      if (typeof b.code === 'string') this.code = b.code;
      if (Array.isArray(b.issues)) this.issues = b.issues as ApiIssue[];
    }
  }
}

function extractMessage(body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.message === 'string') return b.message;
    if (Array.isArray(b.message)) return b.message.join(', ');
  }
  if (typeof body === 'string' && body) return body;
  return 'Request failed';
}

export interface XeniaClientOptions {
  baseUrl: string;
  getAccessToken?: () => string | null | undefined;
  getRefreshToken?: () => string | null | undefined;
  onTokensRefreshed?: (accessToken: string, refreshToken: string) => void;
  onSessionExpired?: () => void;
}

export class XeniaClient {
  private refreshInFlight: Promise<string | null> | null = null;

  constructor(private readonly opts: XeniaClientOptions) {}

  private async request<T>(path: string, init: RequestInit = {}, isRetry = false): Promise<T> {
    const token = this.opts.getAccessToken?.();
    const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };
    if (init.body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${this.opts.baseUrl}${path}`, { ...init, headers });

    if (res.status === 401 && !isRetry && this.opts.getRefreshToken?.()) {
      const newToken = await this.refreshOnce();
      if (newToken) return this.request<T>(path, init, true);
      this.opts.onSessionExpired?.();
    }

    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;

    if (!res.ok) throw new ApiError(res.status, parsed);
    return parsed as T;
  }

  /** Dedupe concurrent 401s into a single refresh call. */
  private refreshOnce(): Promise<string | null> {
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.doRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async doRefresh(): Promise<string | null> {
    const refreshToken = this.opts.getRefreshToken?.();
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${this.opts.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { accessToken: string; refreshToken: string };
      this.opts.onTokensRefreshed?.(body.accessToken, body.refreshToken);
      return body.accessToken;
    } catch {
      return null;
    }
  }

  private get = <T>(path: string) => this.request<T>(path);
  private post = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
  private patch = <T>(path: string, body?: unknown) =>
    this.request<T>(path, { method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined });
  private del = <T>(path: string) => this.request<T>(path, { method: 'DELETE' });

  // ---------------------------------------------------------------- auth
  auth = {
    register: (input: { email: string; password: string; orgName: string; name?: string }) =>
      this.post<AuthSession>('/auth/register', input),
    login: (input: { email: string; password: string; orgSlug?: string }) =>
      this.post<AuthSession>('/auth/login', input),
    logout: (refreshToken: string) => this.post<{ ok: boolean }>('/auth/logout', { refreshToken }),
    me: () =>
      this.get<
        | { scope: 'staff'; user: { id: string; email: string; name: string | null }; org: { id: string; slug: string; name: string } | null; role: Role }
        | { scope: 'magic'; subjectId: string; org: { id: string; slug: string; name: string } | null; role: string }
      >('/auth/me'),
    members: () => this.get<Member[]>('/auth/members'),
    invite: (input: { email: string; role: Role }) =>
      this.post<{ invitationId: string; token: string; role: Role; expiresAt: string }>('/auth/invitations', input),
    acceptInvite: (input: { token: string; password: string; name?: string }) =>
      this.post<AuthSession>('/auth/invitations/accept', input),
  };

  // ------------------------------------------------------------ properties
  properties = {
    list: () => this.get<Property[]>('/properties'),
    create: (input: { name: string; address?: string; timezone?: string }) =>
      this.post<Property>('/properties', input),
  };

  units = {
    list: () => this.get<Unit[]>('/units'),
    create: (propertyId: string, input: { name: string; capacity?: number; bedrooms?: number }) =>
      this.post<Unit>(`/properties/${propertyId}/units`, input),
    update: (unitId: string, input: { name?: string; status?: Unit['status'] }) =>
      this.patch<Unit>(`/units/${unitId}`, input),
    facts: {
      list: (unitId: string) => this.get<PropertyFact[]>(`/units/${unitId}/facts`),
      add: (unitId: string, input: { category: string; key: string; value: string }) =>
        this.post<PropertyFact>(`/units/${unitId}/facts`, input),
    },
  };

  // --------------------------------------------------------------- guests
  guests = {
    list: () => this.get<Guest[]>('/guests'),
    get: (id: string) => this.get<GuestDetail>(`/guests/${id}`),
  };

  // -------------------------------------------------------------- booking
  bookings = {
    list: () => this.get<Booking[]>('/bookings'),
    confirm: (input: { unitId: string; guestId?: string; channelId?: string; checkIn: string; checkOut: string; externalRef?: string }) =>
      this.post<Booking>('/bookings/confirm', input),
  };

  channels = {
    list: () => this.get<Channel[]>('/channels'),
    create: (input: { type: Channel['type']; name: string }) =>
      this.post<ChannelWithSecret>('/channels', input),
  };

  calendar = {
    blocks: (unitId: string) => this.get<AvailabilityBlock[]>(`/calendar/units/${unitId}/blocks`),
    createBlock: (input: { unitId: string; checkIn: string; checkOut: string }) =>
      this.post<AvailabilityBlock>('/calendar/blocks', input),
    removeBlock: (id: string) => this.del<{ ok: boolean }>(`/calendar/blocks/${id}`),
    availability: (unitId: string, checkIn: string, checkOut: string) =>
      this.get<{ available: boolean; conflicts: { id: string; source: string }[] }>(
        `/calendar/units/${unitId}/availability?checkIn=${encodeURIComponent(checkIn)}&checkOut=${encodeURIComponent(checkOut)}`,
      ),
  };

  // ---------------------------------------------------------------- tasks
  tasks = {
    list: (filters?: { unitId?: string; status?: string }) =>
      this.get<Task[]>(`/tasks${toQuery(filters)}`),
    create: (input: { unitId: string; type?: Task['type']; bookingId?: string; dueAt?: string; priority?: number }) =>
      this.post<Task>('/tasks', input),
    assign: (taskId: string, staffId: string) =>
      this.post<{ id: string }>(`/tasks/${taskId}/assign`, { staffId }),
    accept: (taskId: string) => this.post<Task>(`/tasks/${taskId}/accept`),
    complete: (taskId: string, photos: string[] = []) =>
      this.post<Task>(`/tasks/${taskId}/complete`, { photos }),
  };

  staff = {
    list: () => this.get<Staff[]>('/staff'),
    create: (input: { name: string; phone?: string; role?: string; userId?: string }) =>
      this.post<Staff>('/staff', input),
  };

  // ----------------------------------------------------------- maintenance
  vendors = {
    list: () => this.get<Vendor[]>('/vendors'),
    create: (input: { name: string; trade?: string; phone?: string; email?: string }) =>
      this.post<Vendor>('/vendors', input),
  };

  maintenance = {
    list: () => this.get<MaintenanceTicket[]>('/maintenance/tickets'),
    open: (input: { unitId: string; title: string; description?: string; priority?: number }) =>
      this.post<MaintenanceTicket>('/maintenance/tickets', input),
    assignVendor: (ticketId: string, input: { vendorId: string; scheduledAt?: string; grantAccess?: boolean }) =>
      this.post<VendorAssignment>(`/maintenance/tickets/${ticketId}/assign`, input),
    resolve: (ticketId: string, cost?: number) =>
      this.post<MaintenanceTicket>(`/maintenance/tickets/${ticketId}/resolve`, { cost }),
  };

  // -------------------------------------------------------------- access
  access = {
    locks: {
      list: () => this.get<Lock[]>('/access/locks'),
      create: (unitId: string, provider?: 'simulator' | 'seam') =>
        this.post<Lock>('/access/locks', { unitId, provider }),
    },
    credentials: {
      list: (filters?: { bookingId?: string; unitId?: string }) =>
        this.get<AccessCredential[]>(`/access/credentials${toQuery(filters)}`),
      issue: (input: { bookingId?: string; unitId?: string; validFrom?: string; validTo?: string; type?: AccessCredential['type'] }) =>
        this.post<{ credential: AccessCredential; code: string }>('/access/credentials', input),
      revoke: (id: string) => this.post<AccessCredential>(`/access/credentials/${id}/revoke`),
      events: (id: string) => this.get<AccessEvent[]>(`/access/credentials/${id}/events`),
    },
  };

  // ------------------------------------------------------------- messaging
  conversations = {
    list: () => this.get<Conversation[]>('/conversations'),
    create: (input: { unitId?: string; bookingId?: string; guestId?: string; channel?: Conversation['channel'] }) =>
      this.post<Conversation>('/conversations', input),
    messages: (id: string) => this.get<Message[]>(`/conversations/${id}/messages`),
    send: (id: string, body: string) =>
      this.post<{ message: Message; ai?: ConciergeReply }>(`/conversations/${id}/messages`, { body }),
  };

  // -------------------------------------------------------------- pricing
  pricing = {
    rules: {
      list: () => this.get<PricingRule[]>('/pricing/rules'),
      create: (input: { unitId?: string; name: string; conditions: Record<string, unknown>; effect: PricingRule['effect']; priority?: number }) =>
        this.post<PricingRule>('/pricing/rules', input),
    },
    suggestions: {
      list: (unitId?: string) => this.get<PricingSuggestion[]>(`/pricing/suggestions${toQuery({ unitId })}`),
      evaluate: (input: { unitId: string; day: string; basePrice: number }) =>
        this.post<PricingSuggestion>('/pricing/suggestions/evaluate', input),
      accept: (id: string) => this.post<PricingSuggestion>(`/pricing/suggestions/${id}/accept`),
    },
  };

  // -------------------------------------------------------------- billing
  billing = {
    subscription: () => this.get<Subscription | null>('/billing/subscription'),
    checkout: (plan: 'starter' | 'pro' | 'scale') =>
      this.post<Subscription>('/billing/subscription/checkout', { plan }),
    cancelSubscription: () => this.post<Subscription>('/billing/subscription/cancel'),
    payouts: {
      list: () => this.get<Payout[]>('/billing/payouts'),
      create: (input: { payeeType: 'staff' | 'vendor'; payeeId: string; amount: number; currency?: string; taskId?: string; ticketId?: string; note?: string }) =>
        this.post<Payout>('/billing/payouts', input),
    },
  };

  // ------------------------------------------------------- knowledge base
  kb = {
    documents: {
      list: (unitId?: string) => this.get<KbDocument[]>(`/kb/documents${toQuery({ unitId })}`),
      create: (input: { unitId?: string; title: string; content: string; sourceType?: KbDocument['sourceType']; language?: string }) =>
        this.post<KbDocument>('/kb/documents', input),
      update: (id: string, input: { title?: string; content?: string }) =>
        this.patch<KbDocument>(`/kb/documents/${id}`, input),
      remove: (id: string) => this.del<{ ok: boolean }>(`/kb/documents/${id}`),
    },
    reindexUnit: (unitId: string) => this.post<{ ok: boolean; chunks?: number }>(`/kb/units/${unitId}/reindex`),
    chunkStats: (unitId: string) => this.get<{ unitId: string; chunks: number }>(`/kb/units/${unitId}/chunks`),
  };

  // ---------------------------------------------------------------- audit
  audit = {
    list: (filters?: { resourceType?: string; action?: string; limit?: number }) =>
      this.get<AuditEvent[]>(`/audit${toQuery(filters)}`),
  };
}

function toQuery(params?: Record<string, string | number | undefined>): string {
  if (!params) return '';
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== '');
  if (!entries.length) return '';
  return '?' + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&');
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createClient(opts: XeniaClientOptions): XeniaClient {
  return new XeniaClient(opts);
}
