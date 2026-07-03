import { describe, expect, it } from 'vitest';
import { evaluate } from '@xenia/shared';
import type { PriceContext, PricingRule } from '@xenia/shared';

/** Pure unit tests for the rules engine (lives in @xenia/shared). */
describe('pricing rules engine', () => {
  const base: PriceContext = { basePrice: 100, leadTimeDays: 1, occupancy: 0.2, weekday: 5, gapNights: 0 };

  const lastMinute: PricingRule = {
    id: 'r1',
    conditions: { leadTimeDays: { lt: 3 }, occupancy: { lt: 0.5 } },
    effect: { adjustPct: -15 },
    priority: 10,
  };
  const weekendBump: PricingRule = {
    id: 'r2',
    conditions: { weekday: { gte: 5 } },
    effect: { adjustPct: 10 },
    priority: 5,
  };

  it('applies a matching rule', () => {
    const s = evaluate(base, [lastMinute]);
    expect(s.suggestedPrice).toBe(85);
    expect(s.rationale).toHaveLength(1);
  });

  it('skips rules whose conditions do not match', () => {
    const s = evaluate({ ...base, leadTimeDays: 30 }, [lastMinute]);
    expect(s.suggestedPrice).toBe(100);
    expect(s.rationale).toHaveLength(0);
  });

  it('stacks rules by priority (higher first), compounding', () => {
    const s = evaluate(base, [weekendBump, lastMinute]);
    // priority 10 first: 100 → 85; then weekend +10%: 85 → 93.5
    expect(s.suggestedPrice).toBe(93.5);
    expect(s.rationale.map((r) => r.ruleId)).toEqual(['r1', 'r2']);
  });

  it('supports absolute adjustments', () => {
    const s = evaluate(base, [
      { id: 'r3', conditions: {}, effect: { adjustAbs: -7.5 }, priority: 0 },
    ]);
    expect(s.suggestedPrice).toBe(92.5);
  });
});
