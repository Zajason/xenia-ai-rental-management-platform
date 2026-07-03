# Billing — dummy today, Stripe tomorrow

Two money flows, one `PaymentProvider` port
(`apps/api/src/modules/billing/payment.provider.ts`):

1. **Subscriptions** — orgs pay Xenia (per-unit SaaS pricing).
2. **Payouts** — the owner/manager pays a **cleaner or repair vendor through the
   app**, optionally linked to the task/ticket being paid for.

## What runs today (simulated provider)

- `POST /billing/subscription/checkout { plan }` → activates instantly,
  `unit_count` metered from the org's units, `sim_sub_*` reference.
- `POST /webhooks/billing` (header `x-billing-signature` must equal
  `BILLING_WEBHOOK_SECRET`, default `dev-billing-secret`) → simulates provider
  events: `invoice.paid` renews the period, `subscription.cancelled` cancels.
- `POST /billing/payouts { payeeType: staff|vendor, payeeId, amount, taskId?/ticketId?, note? }`
  → validates the payee belongs to the org, executes the transfer via the
  provider (simulated: instant `paid` + `sim_tr_*` ref), audits it.

Covered end-to-end by `apps/api/test/billing.e2e.spec.ts` — including RBAC
(owner-only subscription management), signature rejection, cross-org payee
rejection, and audit-trail assertions.

## What real operation requires

### Subscriptions → Stripe Billing
1. Stripe account; API keys.
2. Products/Prices: per-unit pricing → a metered or quantity-based Price
   (`unit_count` becomes the subscription item quantity, updated when units
   are added/removed).
3. Replace `activateSubscription()` with a **Stripe Checkout Session** (or
   Payment Element) flow; store `subscription.id` in `subscriptions.stripe_id`.
4. Point a Stripe webhook at `/webhooks/billing` and replace the dummy-signature
   check with `stripe.webhooks.constructEvent(rawBody, sig, STRIPE_WEBHOOK_SECRET)`
   — NB: this needs the **raw request body** (Nest: `rawBody: true` on the route).
   Handle at minimum: `checkout.session.completed`, `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated/deleted`.
5. Dunning/entitlements: on `payment_failed` → grace period, then downgrade
   (plan limits enforcement is a TODO hook in the billing service).

### Payouts → Stripe Connect
Moving money **to other people** (cleaners, vendors) legally requires a payments
platform — this is exactly what Stripe Connect is for. The shape:

1. **Connected accounts** — each payee (staff/vendor) onboards to a Stripe
   **Express account** via an onboarding link (Stripe handles KYC/identity/bank
   details — do NOT collect these yourself). Store `stripe_account_id` on
   `staff`/`vendors` (schema column to add when this lands).
2. **Funding** — the org either keeps a platform balance (charge their card /
   SEPA debit into your platform) or you use destination charges. For
   owner-pays-cleaner, the clean model is: charge the owner's saved payment
   method, then **`stripe.transfers.create()`** to the payee's connected account.
3. Replace `transfer()` in the provider: create the PaymentIntent + Transfer,
   return the transfer id; payout status transitions map to Stripe events
   (`transfer.created`, `payout.paid`/`payout.failed` on the connected account)
   arriving on the same webhook endpoint.
4. **Compliance notes:** platform liability, per-country availability of
   Express, and payout schedules are Stripe-side settings. In the EU, SCA
   applies to the funding charge.

### Env expected
```
STRIPE_SECRET_KEY=sk_live_…
STRIPE_WEBHOOK_SECRET=whsec_…        # replaces BILLING_WEBHOOK_SECRET check
STRIPE_CONNECT_CLIENT_ID=ca_…        # Express onboarding
```

### Why the port design matters
Everything outside `payment.provider.ts` — payout rows, status transitions,
RBAC, audit, the API surface, the tests — is provider-agnostic and stays exactly
as-is when Stripe lands. The swap is: implement `StripePaymentProvider`, bind it
in `BillingModule` when `STRIPE_SECRET_KEY` is set, add the raw-body webhook
verification, and add the connected-account onboarding endpoints.
