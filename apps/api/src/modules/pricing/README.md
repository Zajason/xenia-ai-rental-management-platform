# pricing

Occupancy/ADR/RevPAR analytics and **rules-based pricing suggestions** (the v1
before any ML). Rules are declarative `conditions → effect` rows evaluated over
the rate calendar by the workers' pricing engine; suggestions are explainable
(they record which rules fired). ML pricing later slots in behind the same output.

- **Tables:** metrics_daily, pricing_rules, pricing_suggestions.
- **Events:** `pricing.suggestion.created`.
- **Failure modes:** heavy aggregation hurting OLTP → read off a projection/replica.
