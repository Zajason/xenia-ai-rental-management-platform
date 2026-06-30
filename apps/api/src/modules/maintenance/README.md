# maintenance

Maintenance tickets and vendor coordination with SLA tracking. A ticket can be
opened by a guest, a cleaner, or the AI concierge, and may grant a vendor
temporary access. Depends on property, access, notification.

- **Tables:** vendors, maintenance_tickets, vendor_assignments, ticket_events.
- **Events:** `maintenance.ticket.opened`, `maintenance.ticket.resolved`.
- **Failure modes:** lost tickets, no vendor coverage, access-grant coordination.
