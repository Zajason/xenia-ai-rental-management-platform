# pricing (rules engine)

The rules-based pricing-suggestion engine. `rules-engine.ts` is a pure function —
`evaluate(context, rules) → explainable suggestion` — so it is trivially unit
tested. A scheduled job feeds it each unit's forward calendar context + enabled
`pricing_rules`, writes `pricing_suggestions`, and emits
`pricing.suggestion.created`. ML pricing later produces the same suggestion shape.
