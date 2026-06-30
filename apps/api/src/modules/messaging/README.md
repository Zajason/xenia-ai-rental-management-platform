# messaging

Omnichannel guest conversations (WhatsApp/SMS/email/in-app): threading, delivery
state, inbound normalization. Binds a thread to a stay and hands off to the AI
concierge. Depends on identity, booking, concierge.

- **Tables:** conversations, messages, delivery_receipts, message_templates.
- **Events:** `message.received`, `message.sent`, `human.handoff.requested`.
- **Failure modes:** provider outages, inbound dedupe, WhatsApp 24h window, opt-out.
