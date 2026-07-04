"""
Embedding-side lifecycle: what happens to the searchable index as the OWNER
manages their property. Mirrors the API triggers (create → reindex,
addFact → reindex, doc edit/delete → reindex). Offline (stub embeddings), so we
assert the index CONTENTS change correctly — not ranking quality.
"""
from __future__ import annotations

import asyncio

from app.rag.ingest import reindex_unit
from app.rag.retriever import retrieve
from dbutil import (
    add_fact,
    cleanup,
    count_chunks,
    create_org_unit,
    delete_documents,
    requires_db,
    update_fact,
)

pytestmark = requires_db


def _reindex(org_id, unit_id):
    return asyncio.run(reindex_unit(org_id, unit_id))


def _search_blob(org_id, unit_id, query="everything"):
    results = asyncio.run(retrieve(org_id, unit_id, query, k=50))
    return " ".join(r["content"] for r in results)


def test_new_property_with_info_gets_indexed():
    """Owner creates a unit + adds facts/doc → reindex builds searchable chunks."""
    org_id, unit_id = create_org_unit(facts=True, doc=True)
    try:
        assert count_chunks(unit_id) == 0  # nothing indexed yet
        n = _reindex(org_id, unit_id)
        assert n == 3  # 2 facts + 1 doc chunk
        assert count_chunks(unit_id) == 3
        blob = _search_blob(org_id, unit_id)
        assert "sunset2024" in blob and "Quiet hours" in blob
    finally:
        cleanup(org_id)


def test_adding_info_later_expands_the_index():
    """Owner adds a NEW fact after setup → reindex picks it up."""
    org_id, unit_id = create_org_unit(facts=True, doc=False)
    try:
        _reindex(org_id, unit_id)
        before = count_chunks(unit_id)
        add_fact(org_id, unit_id, "checkin", "time", "from 15:00")
        _reindex(org_id, unit_id)
        assert count_chunks(unit_id) == before + 1
        assert "from 15:00" in _search_blob(org_id, unit_id)
    finally:
        cleanup(org_id)


def test_editing_a_fact_reembeds_new_value_and_drops_old():
    """Owner edits the wifi password → old value gone, new value searchable."""
    org_id, unit_id = create_org_unit(facts=True, doc=False)
    try:
        _reindex(org_id, unit_id)
        assert "sunset2024" in _search_blob(org_id, unit_id)

        update_fact(unit_id, "password", "winter2025")
        _reindex(org_id, unit_id)

        blob = _search_blob(org_id, unit_id)
        assert "winter2025" in blob
        assert "sunset2024" not in blob  # stale chunk was replaced
        assert count_chunks(unit_id) == 2  # still 2 facts, no duplicates
    finally:
        cleanup(org_id)


def test_deleting_a_document_removes_its_chunks():
    """Owner deletes a doc → reindex drops its chunks."""
    org_id, unit_id = create_org_unit(facts=True, doc=True)
    try:
        _reindex(org_id, unit_id)
        assert "Quiet hours" in _search_blob(org_id, unit_id)

        delete_documents(unit_id)
        _reindex(org_id, unit_id)

        blob = _search_blob(org_id, unit_id)
        assert "Quiet hours" not in blob
        assert "sunset2024" in blob  # facts untouched
    finally:
        cleanup(org_id)
