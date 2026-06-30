# memory

Three scopes of memory:

1. **short-term** — conversation buffer + rolling summary (`agent_sessions.summary`).
2. **per-stay** — facts learned this stay: arrival time, issues raised
   (`agent_sessions.memory`).
3. **cross-stay / returning-guest** — durable `guest_profiles`: learned
   preferences, dietary notes, VIP flag, stay count. Matched to a guest by
   email/phone on a new booking so a repeat guest is recognised and greeted with
   context.

All strictly scoped by guest/unit — memory never leaks across guests.
