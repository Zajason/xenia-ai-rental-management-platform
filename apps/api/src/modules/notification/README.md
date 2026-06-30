# notification

The single fan-out point for email/SMS/WhatsApp/push. Every other module calls
`notify(...)` here — never a provider SDK directly. Handles channel preference,
quiet hours, throttling, templating, and idempotent delivery. Depends on identity.

- **Tables:** notification_preferences, notifications, delivery_log.
- **Events:** `notification.delivered`, `notification.failed`.
- **Failure modes:** provider outage (fallback channel), spam/throttle, dedupe by
  (recipient, template, dedupeKey).
