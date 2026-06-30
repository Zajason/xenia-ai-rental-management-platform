-- HNSW index for fast approximate nearest-neighbour search over KB chunk
-- embeddings. Cosine distance matches how we normalise embeddings. Retrieval is
-- always additionally filtered by unit_id/org_id (in the query + via RLS) so a
-- guest can never retrieve another unit's knowledge.
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_hnsw
  ON kb_chunks
  USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS kb_chunks_unit_idx ON kb_chunks (unit_id);
