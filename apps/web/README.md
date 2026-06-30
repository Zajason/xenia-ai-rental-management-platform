# @xenia/web

The owner / property-manager / admin dashboard (Next.js App Router, React 19).
Talks to the API via `@xenia/sdk` and shares components through `@xenia/ui`.

```bash
pnpm --filter @xenia/web dev   # http://localhost:3000
```

The current `app/page.tsx` is a static placeholder showing the intended shape
(today's arrivals, turnover tasks). Build it out into server components reading
live data per `docs/architecture/roadmap.md`. Add Tailwind + shadcn/ui here.
