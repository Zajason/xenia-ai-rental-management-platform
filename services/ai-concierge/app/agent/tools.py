"""
The agent's tools. Two tiers:

  - READ tools run automatically (look up a booking, check availability).
  - WRITE tools (extend checkout, issue an access code, open a maintenance
    ticket) are policy-gated: some auto-approved, some require host approval. A
    write tool emits `agent.action.requested` back to the core API, which runs it
    through the SAME RBAC + audit path a human action would.

Schemas here follow the Anthropic tool-use format. Execution is delegated to the
core API over HTTP (see executor.py) — the AI never touches the database directly.
"""
from __future__ import annotations

TOOLS = [
    {
        "name": "get_booking_details",
        "description": "Look up the current guest's booking: dates, unit, status.",
        "tier": "read",
        "input_schema": {
            "type": "object",
            "properties": {"booking_id": {"type": "string"}},
            "required": ["booking_id"],
        },
    },
    {
        "name": "check_availability",
        "description": "Check whether a unit is free for a date range.",
        "tier": "read",
        "input_schema": {
            "type": "object",
            "properties": {
                "unit_id": {"type": "string"},
                "check_in": {"type": "string"},
                "check_out": {"type": "string"},
            },
            "required": ["unit_id", "check_in", "check_out"],
        },
    },
    {
        "name": "create_maintenance_ticket",
        "description": "Report a maintenance issue the guest raised.",
        "tier": "write",
        "requires_approval": False,
        "input_schema": {
            "type": "object",
            "properties": {
                "unit_id": {"type": "string"},
                "title": {"type": "string"},
                "description": {"type": "string"},
                "priority": {"type": "integer"},
            },
            "required": ["unit_id", "title"],
        },
    },
    {
        "name": "extend_checkout",
        "description": "Request a later checkout time for the guest's booking.",
        "tier": "write",
        "requires_approval": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "booking_id": {"type": "string"},
                "new_checkout": {"type": "string"},
            },
            "required": ["booking_id", "new_checkout"],
        },
    },
    {
        "name": "escalate_to_host",
        "description": "Hand the conversation to a human host with context.",
        "tier": "write",
        "requires_approval": False,
        "input_schema": {
            "type": "object",
            "properties": {"reason": {"type": "string"}},
            "required": ["reason"],
        },
    },
]


def anthropic_tools() -> list[dict]:
    """Strip our internal metadata to the shape the Anthropic SDK expects."""
    return [
        {"name": t["name"], "description": t["description"], "input_schema": t["input_schema"]}
        for t in TOOLS
    ]


def requires_approval(tool_name: str) -> bool:
    for t in TOOLS:
        if t["name"] == tool_name:
            return bool(t.get("requires_approval", False))
    return True
