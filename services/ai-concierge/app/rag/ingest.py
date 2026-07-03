"""
KB ingestion — the WRITE side of RAG.

Turns the owner's knowledge into searchable vectors:
  sources (property_facts + kb_documents) → chunk → embed → store in kb_chunks

Runs on registration and on every edit (delete-then-insert = idempotent
re-index). Embeddings are computed here, once per reindex, NOT per guest
message — that's what keeps it cheap. The retriever (retriever.py) is the read
side that queries what this writes.

Connects as the app role (xenia_app), so every statement runs inside a tenant
context (`app.current_org`) and RLS scopes it.
"""
from __future__ import annotations

import json

import psycopg
from pgvector.psycopg import register_vector_async

from ..config import settings
from .embeddings import embed


def chunk_text(text: str, max_chars: int = 500, overlap: int = 60) -> list[str]:
    """Split long free-text into overlapping passages on word boundaries."""
    text = " ".join(text.split())
    if len(text) <= max_chars:
        return [text] if text else []
    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + max_chars, len(text))
        if end < len(text):
            brk = text.rfind(" ", start, end)
            if brk > start:
                end = brk
        piece = text[start:end].strip()
        if piece:
            chunks.append(piece)
        if end >= len(text):
            break
        start = max(end - overlap, start + 1)
    return chunks


async def _gather(conn: psycopg.AsyncConnection, unit_id: str | None) -> list[dict]:
    """Collect (content, document_id, metadata) records for a unit (or shared)."""
    records: list[dict] = []
    unit_pred = "unit_id = %s" if unit_id else "unit_id IS NULL"
    params: tuple = (unit_id,) if unit_id else ()

    # Structured facts → one focused chunk each.
    async with conn.cursor() as cur:
        await cur.execute(
            f"SELECT id, category, key, value FROM property_facts WHERE {unit_pred}", params
        )
        for fid, category, key, value in await cur.fetchall():
            label = key.replace("_", " ")
            records.append(
                {
                    "content": f"{label} ({category}): {value}",
                    "document_id": None,
                    "metadata": {"source": "fact", "factId": str(fid), "category": category},
                }
            )

    # Free-text documents → split into passages.
    async with conn.cursor() as cur:
        await cur.execute(
            f"SELECT id, title, content FROM kb_documents WHERE {unit_pred}", params
        )
        for did, title, content in await cur.fetchall():
            for piece in chunk_text(content):
                records.append(
                    {
                        "content": f"{title}: {piece}" if title else piece,
                        "document_id": str(did),
                        "metadata": {"source": "document", "title": title},
                    }
                )
    return records


async def _reindex_scope(org_id: str, unit_id: str | None) -> int:
    """Rebuild kb_chunks for one unit (unit_id set) or the org's shared docs (None)."""
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        await register_vector_async(conn)
        await conn.execute("SELECT set_config('app.current_org', %s, true)", (org_id,))

        records = await _gather(conn, unit_id)
        vectors = embed([r["content"] for r in records]) if records else []

        async with conn.cursor() as cur:
            if unit_id:
                await cur.execute("DELETE FROM kb_chunks WHERE unit_id = %s", (unit_id,))
            else:
                await cur.execute("DELETE FROM kb_chunks WHERE unit_id IS NULL")
            for rec, vec in zip(records, vectors):
                await cur.execute(
                    """
                    INSERT INTO kb_chunks (org_id, unit_id, document_id, content, embedding, metadata)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    """,
                    (org_id, unit_id, rec["document_id"], rec["content"], vec, json.dumps(rec["metadata"])),
                )
        await conn.commit()
    return len(records)


async def reindex_unit(org_id: str, unit_id: str) -> int:
    """Re-embed and store all knowledge for one unit. Returns the chunk count."""
    return await _reindex_scope(org_id, unit_id)


async def reindex_org(org_id: str) -> dict:
    """Re-embed every unit in the org + the org's shared (unit-less) documents."""
    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        await conn.execute("SELECT set_config('app.current_org', %s, true)", (org_id,))
        async with conn.cursor() as cur:
            await cur.execute("SELECT id FROM units")
            unit_ids = [str(r[0]) for r in await cur.fetchall()]

    total = 0
    per_unit: dict[str, int] = {}
    for uid in unit_ids:
        n = await reindex_unit(org_id, uid)
        per_unit[uid] = n
        total += n
    shared = await _reindex_scope(org_id, None)
    total += shared
    return {"units": len(unit_ids), "chunks": total, "shared": shared, "perUnit": per_unit}
