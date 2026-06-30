# billing

Xenia's own SaaS billing: per-unit subscriptions, usage metering, plan
entitlements, Stripe webhooks. Depends on identity; leans on Stripe for the hard
parts.

- **Tables:** subscriptions, usage_records (+ plans/invoices later).
- **Events:** `subscription.updated`.
- **Failure modes:** webhook ordering, entitlement enforcement, dunning.
