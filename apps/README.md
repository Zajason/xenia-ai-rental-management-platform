# apps/

Deployable, user-facing applications. Each app is a thin presentation/edge layer
that talks to the API over HTTP and never reaches into the database directly.

- **web** — the owner / property-manager / admin dashboard (Next.js).
- **guest-concierge** — the guest-facing concierge surface, entered via a magic
  link sent at booking time. No account, no install.
- **cleaner-pwa** — installable mobile PWA for cleaners and turnover staff.
- **api** — the NestJS modular monolith. It is the API gateway *and* the home of
  every domain module (one folder per bounded context).

Frontends consume `@xenia/sdk` for typed API access and `@xenia/ui` for shared
components.
