"""
Retrieval over kb_chunks with pgvector.

CRITICAL: every query is filtered by org_id AND unit_id. A guest at unit A must
never retrieve unit B's door code — this is correctness and security at once. RLS
on the app role is the backstop; the explicit filter is the primary guard.
"""
from __future__ import annotations

import psycopg
from pgvector.psycopg import register_vector_async

from ..config import settings
from .embeddings import embed_query


async def retrieve(org_id: str, unit_id: str | None, query: str, k: int = 5) -> list[dict]:
    vector = embed_query(query)

    async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
        await register_vector_async(conn)
        # Scope the connection to the tenant so RLS applies.
        await conn.execute("SELECT set_config('app.current_org', %s, true)", (org_id,))
        # When a unit is given, include that unit's chunks PLUS org-shared
        # (unit-less) chunks — property-level info like a local guide.
        sql = """
            SELECT id, content, 1 - (embedding <=> %s::vector) AS score
            FROM kb_chunks
            WHERE org_id = %s
              AND (%s::uuid IS NULL OR unit_id = %s::uuid OR unit_id IS NULL)
              AND embedding IS NOT NULL
            ORDER BY embedding <=> %s::vector
            LIMIT %s
        """
        async with conn.cursor() as cur:
            await cur.execute(sql, (vector, org_id, unit_id, unit_id, vector, k))
            rows = await cur.fetchall()

    return [{"id": str(r[0]), "content": r[1], "score": float(r[2])} for r in rows]
