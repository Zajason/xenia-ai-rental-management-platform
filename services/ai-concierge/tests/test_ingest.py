"""
Proves the KB write-side: seed sources → reindex → retrieve returns real chunks.

Needs Postgres (skips cleanly if it's not reachable). Runs offline: with no
VOYAGE_API_KEY the embeddings are deterministic stubs, so ranking is noise — we
therefore assert the pipeline *stored and can return* the knowledge, not that a
particular chunk ranks first.
"""
from __future__ import annotations

import asyncio
import os
import uuid

import psycopg
import pytest

from app.rag.ingest import chunk_text, reindex_unit
from app.rag.retriever import retrieve

ADMIN = os.environ.get("DATABASE_ADMIN_URL", "postgres://xenia:xenia@localhost:5442/xenia")


def _db_available() -> bool:
    try:
        with psycopg.connect(ADMIN, connect_timeout=2):
            return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _db_available(), reason="Postgres not reachable")


def test_chunk_text_splits_long_text_on_boundaries():
    text = "sentence number %d. " % 0 + ("word " * 400)
    chunks = chunk_text(text, max_chars=500, overlap=60)
    assert len(chunks) > 1
    assert all(len(c) <= 500 for c in chunks)
    assert all(chunks)  # no empties


def test_short_text_is_one_chunk():
    assert chunk_text("just a little text") == ["just a little text"]
    assert chunk_text("   ") == []


def _seed() -> tuple[str, str]:
    """Insert an org + unit + facts + a document as the admin role. Returns ids."""
    suffix = uuid.uuid4().hex[:8]
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute(
            "INSERT INTO organizations (name, slug) VALUES (%s, %s) RETURNING id",
            (f"Ingest Test {suffix}", f"ingest-{suffix}"),
        )
        org_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO properties (org_id, name) VALUES (%s, %s) RETURNING id",
            (org_id, "Test House"),
        )
        property_id = cur.fetchone()[0]
        cur.execute(
            "INSERT INTO units (org_id, property_id, name) VALUES (%s, %s, %s) RETURNING id",
            (org_id, property_id, "Test Suite"),
        )
        unit_id = cur.fetchone()[0]
        cur.executemany(
            "INSERT INTO property_facts (org_id, unit_id, category, key, value) VALUES (%s,%s,%s,%s,%s)",
            [
                (org_id, unit_id, "wifi", "password", "sunset2024"),
                (org_id, unit_id, "parking", "info", "Free lot 80m uphill, spot 4."),
                (org_id, unit_id, "checkin", "time", "from 15:00"),
            ],
        )
        cur.execute(
            "INSERT INTO kb_documents (org_id, unit_id, title, content) VALUES (%s,%s,%s,%s)",
            (
                org_id,
                unit_id,
                "House Manual",
                "The boiler switch is in the hallway closet. Hot water takes about ten minutes. "
                "Quiet hours are 23:00 to 08:00.",
            ),
        )
        conn.commit()
    return str(org_id), str(unit_id)


def _cleanup(org_id: str) -> None:
    with psycopg.connect(ADMIN) as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM organizations WHERE id = %s", (org_id,))
        conn.commit()


def test_reindex_then_retrieve_returns_stored_knowledge():
    org_id, unit_id = _seed()
    try:
        # WRITE side: build the index.
        count = asyncio.run(reindex_unit(org_id, unit_id))
        assert count >= 4  # 3 facts + >=1 document chunk

        # READ side: the knowledge is now retrievable and scoped to the unit.
        results = asyncio.run(retrieve(org_id, unit_id, "what is the wifi password", k=50))
        blob = " ".join(r["content"] for r in results)
        assert "sunset2024" in blob  # the wifi fact made it into searchable chunks
        assert "boiler" in blob  # the document was chunked + stored too

        # Idempotent: reindexing again yields the same chunk count (no dupes).
        count2 = asyncio.run(reindex_unit(org_id, unit_id))
        assert count2 == count
    finally:
        _cleanup(org_id)


def test_retrieval_is_tenant_scoped():
    org_a, unit_a = _seed()
    org_b, unit_b = _seed()
    try:
        asyncio.run(reindex_unit(org_a, unit_a))
        # Org B asking about org A's unit gets nothing (RLS + explicit filter).
        cross = asyncio.run(retrieve(org_b, unit_a, "wifi password", k=50))
        assert cross == []
    finally:
        _cleanup(org_a)
        _cleanup(org_b)
