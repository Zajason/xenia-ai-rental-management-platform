/**
 * FEATURE: rules-based pricing suggestions (v1).
 *
 * Pure, testable evaluation: given a day's context and the unit's enabled rules
 * (ordered by priority), apply matching effects to the base price and return an
 * explainable suggestion. No ML — but ML later emits the same suggestion shape,
 * so the rest of the system is unaffected.
 */
export interface PriceContext {
  basePrice: number;
  leadTimeDays: number;
  occupancy: number; // 0..1 over a forward window
  weekday: number; // 0=Sun
  gapNights: number; // length of the empty gap this day sits in
}

export interface PricingRule {
  id: string;
  conditions: Record<string, unknown>;
  effect: { adjustPct?: number; adjustAbs?: number; setMinNights?: number };
  priority: number;
}

export interface Suggestion {
  suggestedPrice: number;
  rationale: { ruleId: string; reason: string }[];
}

type Comparator = { lt?: number; lte?: number; gt?: number; gte?: number; eq?: number };

function matches(value: number, cmp: Comparator): boolean {
  if (cmp.lt !== undefined && !(value < cmp.lt)) return false;
  if (cmp.lte !== undefined && !(value <= cmp.lte)) return false;
  if (cmp.gt !== undefined && !(value > cmp.gt)) return false;
  if (cmp.gte !== undefined && !(value >= cmp.gte)) return false;
  if (cmp.eq !== undefined && !(value === cmp.eq)) return false;
  return true;
}

const FIELDS: (keyof PriceContext)[] = ['leadTimeDays', 'occupancy', 'weekday', 'gapNights'];

export function evaluate(ctx: PriceContext, rules: PricingRule[]): Suggestion {
  let price = ctx.basePrice;
  const rationale: { ruleId: string; reason: string }[] = [];

  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    const ok = FIELDS.every((field) => {
      const cmp = rule.conditions[field] as Comparator | undefined;
      return cmp === undefined || matches(ctx[field], cmp);
    });
    if (!ok) continue;

    if (rule.effect.adjustPct !== undefined) {
      price = Math.round(price * (1 + rule.effect.adjustPct / 100) * 100) / 100;
      rationale.push({ ruleId: rule.id, reason: `${rule.effect.adjustPct}% adjustment` });
    }
    if (rule.effect.adjustAbs !== undefined) {
      price = Math.round((price + rule.effect.adjustAbs) * 100) / 100;
      rationale.push({ ruleId: rule.id, reason: `${rule.effect.adjustAbs} absolute adjustment` });
    }
  }

  return { suggestedPrice: price, rationale };
}
