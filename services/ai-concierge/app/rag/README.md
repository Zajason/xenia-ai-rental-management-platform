# rag

Retrieval-augmented generation over per-unit knowledge.

- `embeddings.py` — Voyage AI embeddings (no local ML); deterministic stub when
  no key is set so dev/tests run offline.
- `retriever.py` — pgvector nearest-neighbour search, **always filtered by
  org_id + unit_id** so a guest can only ever retrieve their own unit's knowledge.

Knowledge is derived from structured `property_facts` plus unstructured
`kb_documents`, chunked and embedded into `kb_chunks` (HNSW index). A
`property.fact.updated` event re-embeds the affected chunks.
