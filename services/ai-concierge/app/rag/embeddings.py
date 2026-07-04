"""
Embeddings behind a provider switch (EMBEDDING_PROVIDER):
  - voyage (default): Voyage AI, Anthropic's recommended embedding provider
  - openai:           text-embedding-3-small with dimensions=embed_dim (1024),
                      which matches the kb_chunks.embedding column exactly

Independent of the chat provider. Falls back to a deterministic stub when the
selected provider has no key, so dev/tests run offline (stub vectors rank
randomly — fine for plumbing, not for quality).

IMPORTANT: use the SAME provider+model to ingest and to search, or the vectors
won't line up.
"""
from __future__ import annotations

import hashlib

from ..config import settings

try:
    import voyageai  # type: ignore
except ImportError:  # pragma: no cover
    voyageai = None

try:
    from openai import OpenAI  # type: ignore
except ImportError:  # pragma: no cover
    OpenAI = None


def _provider() -> str:
    p = settings.embedding_provider.lower()
    if p == "openai" and settings.openai_api_key and OpenAI is not None:
        return "openai"
    if p == "voyage" and settings.voyage_api_key and voyageai is not None:
        return "voyage"
    return "stub"


def embed(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    provider = _provider()
    if provider == "openai":
        return _openai_embed(texts)
    if provider == "voyage":
        client = voyageai.Client(api_key=settings.voyage_api_key)
        return client.embed(texts, model=settings.voyage_embed_model, input_type="document").embeddings
    return [_stub_embedding(t) for t in texts]


def embed_query(text: str) -> list[float]:
    provider = _provider()
    if provider == "openai":
        return _openai_embed([text])[0]
    if provider == "voyage":
        client = voyageai.Client(api_key=settings.voyage_api_key)
        return client.embed([text], model=settings.voyage_embed_model, input_type="query").embeddings[0]
    return _stub_embedding(text)


def _openai_embed(texts: list[str]) -> list[list[float]]:
    client = OpenAI(api_key=settings.openai_api_key)
    # `dimensions` reduces text-embedding-3-* output to match our vector column.
    resp = client.embeddings.create(
        model=settings.openai_embed_model, input=texts, dimensions=settings.embed_dim
    )
    return [d.embedding for d in resp.data]


def _stub_embedding(text: str) -> list[float]:
    """Deterministic pseudo-embedding so retrieval is runnable without a key."""
    dim = settings.embed_dim
    digest = hashlib.sha256(text.encode()).digest()
    raw = [digest[i % len(digest)] / 255.0 for i in range(dim)]
    norm = sum(v * v for v in raw) ** 0.5 or 1.0
    return [v / norm for v in raw]
