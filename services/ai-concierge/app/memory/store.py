"""
Memory, three scopes:

  1. short-term  — the conversation buffer + rolling summary (agent_sessions.summary)
  2. per-stay    — facts learned during this stay (agent_sessions.memory jsonb)
  3. cross-stay  — FEATURE: returning-guest memory (guest_profiles)

This module reads the durable returning-guest profile so the agent can greet a
repeat guest with context ("welcome back — quiet unit and no feather pillows, as
always"). Memory is strictly scoped by guest/unit so it never leaks across guests.
"""
from __future__ import annotations

import psycopg

from ..config import settings


def load_memory(guest_id: str | None) -> str:
    """Return a compact natural-language brief from the returning-guest profile."""
    if not guest_id:
        return ""
    try:
        with psycopg.connect(settings.database_url) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT gp.summary, gp.preferences, gp.stay_count, gp.is_vip
                    FROM guest_profiles gp
                    WHERE gp.guest_id = %s
                    LIMIT 1
                    """,
                    (guest_id,),
                )
                row = cur.fetchone()
    except Exception:
        return ""

    if not row:
        return ""
    summary, preferences, stay_count, is_vip = row
    parts = []
    if stay_count:
        parts.append(f"Returning guest ({stay_count} previous stays).")
    if is_vip:
        parts.append("VIP.")
    if summary:
        parts.append(summary)
    if preferences:
        parts.append(f"Preferences: {preferences}")
    return " ".join(parts)
