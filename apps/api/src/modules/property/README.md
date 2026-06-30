# property

Properties, units, amenities, house rules, and **typed property facts** (wifi,
parking, appliances) — the structured source of truth that both the dashboard and
the AI knowledge base derive from. Depends on identity.

- **Tables:** properties, units, amenities, property_facts, house_rules, media.
- **Events:** `property.unit.created`, `property.fact.updated` (→ re-index KB).
- **Failure modes:** stale facts feeding the concierge a wrong wifi password.
