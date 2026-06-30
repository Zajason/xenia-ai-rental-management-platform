# apps/guest-concierge

The guest-facing concierge surface. A guest opens it from a **magic link** sent at
booking time — no account, no app install. It shows check-in instructions, the
door code (only inside its valid window), house rules, local recommendations, and
a chat that is backed by `services/ai-concierge` (RAG + tool-calling + escalation
+ multi-language). The magic link binds the session to a specific stay/unit so the
guest only ever sees their own information.

**Status:** scaffolded as a folder + spec. Build as a lightweight Next.js app (or
a route group in `apps/web`) in Phase 3. No `package.json` yet, so it is excluded
from the workspace until then.

Key screens: Welcome / check-in · Door & access · House manual · Chat concierge ·
Report an issue.
