/**
 * Thin typed HTTP client for the Xenia API, consumed by the frontends.
 *
 * For now this is a hand-written fetch wrapper; once the API publishes its
 * OpenAPI spec we generate the typed surface from it (see docs/api). Keep the
 * ergonomics — `client.bookings.list()` — stable across that switch.
 */
export interface XeniaClientOptions {
  baseUrl: string;
  getToken?: () => string | null | undefined;
}

export class XeniaClient {
  constructor(private readonly opts: XeniaClientOptions) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.opts.getToken?.();
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(`Xenia API ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as T;
  }

  health = () => this.request<{ status: string }>('/health');

  bookings = {
    list: () => this.request<unknown[]>('/bookings'),
  };

  units = {
    list: () => this.request<unknown[]>('/units'),
  };
}

export function createClient(opts: XeniaClientOptions): XeniaClient {
  return new XeniaClient(opts);
}
