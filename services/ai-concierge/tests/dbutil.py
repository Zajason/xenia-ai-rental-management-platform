"""Shared test helpers for DB-backed KB/concierge tests (admin role, RLS bypassed)."""
from __future__ import annotations

import os
import uuid

import psycopg
import pytest

ADMIN = os.environ.get("DATABASE_ADMIN_URL", "postgres://xenia:xenia@localhost:5442/xenia")


def _db_available() -> bool:
    try:
        with psycopg.connect(ADMIN, connect_timeout=2):
            return True
    except Exception:
        return False


requires_db = pytest.mark.skipif(not _db_available(), reason="Postgres not reachable")


def create_org_unit(*, facts: bool = True, doc: bool = True) -> tuple[str, str]:
    """Simulate 'owner creates a property + unit and adds info'. Returns (org, unit)."""
    suffix = uuid.uuid4().hex[:8]
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO organizations (name, slug) VALUES (%s,%s) RETURNING id",
            (f"KB Test {suffix}", f"kb-{suffix}"),
        )
        org_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO properties (org_id, name) VALUES (%s,%s) RETURNING id",
            (org_id, "Cliff House"),
        )
        prop_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO units (org_id, property_id, name) VALUES (%s,%s,%s) RETURNING id",
            (org_id, prop_id, "Caldera Suite"),
        )
        unit_id = cur.fetchone()[0]
        if facts:
            cur.executemany(
                "INSERT INTO property_facts (org_id, unit_id, category, key, value) VALUES (%s,%s,%s,%s,%s)",
                [
                    (org_id, unit_id, "wifi", "password", "sunset2024"),
                    (org_id, unit_id, "parking", "info", "Free lot 80m uphill, spot 4."),
                ],
            )
        if doc:
            cur.execute(
                "INSERT INTO kb_documents (org_id, unit_id, title, content) VALUES (%s,%s,%s,%s)",
                (org_id, unit_id, "House Manual", "Quiet hours are 23:00 to 08:00."),
            )
        conn.commit()
    return str(org_id), str(unit_id)


def add_fact(org_id: str, unit_id: str, category: str, key: str, value: str) -> None:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO property_facts (org_id, unit_id, category, key, value) VALUES (%s,%s,%s,%s,%s)",
            (org_id, unit_id, category, key, value),
        )
        conn.commit()


def update_fact(unit_id: str, key: str, new_value: str) -> None:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE property_facts SET value = %s WHERE unit_id = %s AND key = %s",
            (new_value, unit_id, key),
        )
        conn.commit()


def delete_documents(unit_id: str) -> None:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM kb_documents WHERE unit_id = %s", (unit_id,))
        conn.commit()


def count_chunks(unit_id: str) -> int:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM kb_chunks WHERE unit_id = %s", (unit_id,))
        return cur.fetchone()[0]


def cleanup(org_id: str) -> None:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
        conn.commit()
