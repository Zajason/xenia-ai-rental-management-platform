import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * The PaymentProvider port. Two capabilities:
 *  - subscriptions (Xenia's own SaaS billing)         → Stripe Billing in prod
 *  - transfers (owner pays a cleaner/vendor in-app)   → Stripe Connect in prod
 *
 * The simulator approves everything instantly so the full billing flow is
 * developable/testable offline. The production mapping (checkout sessions,
 * Connect onboarding, webhooks) is documented in docs/integrations/billing.md.
 */
export interface PaymentProvider {
  activateSubscription(orgId: string, plan: string): Promise<{ ref: string; periodEnd: Date }>;
  transfer(input: {
    amountCents: number;
    currency: string;
    payeeRef: string;
  }): Promise<{ ref: string; status: 'paid' | 'processing' }>;
}

@Injectable()
export class SimulatedPaymentProvider implements PaymentProvider {
  async activateSubscription(_orgId: string, _plan: string) {
    return {
      ref: `sim_sub_${randomBytes(8).toString('hex')}`,
      periodEnd: new Date(Date.now() + 30 * 86400_000),
    };
  }

  async transfer(input: { amountCents: number; currency: string; payeeRef: string }) {
    if (input.amountCents <= 0) throw new Error('amount must be positive');
    return { ref: `sim_tr_${randomBytes(8).toString('hex')}`, status: 'paid' as const };
  }
}
