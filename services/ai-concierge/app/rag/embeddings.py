"""
Embeddings via Voyage AI (Anthropic's recommended embedding provider) — no local
torch/sentence-transformers, so the service stays light. Falls back to a
deterministic stub when no API key is set, so dev/tests run offline.
"""
from __future__ import annotations

import hashlib

from ..config import settings

try:
    import voyageai  # type: ignore
except ImportError:  # pragma: no cover
    voyageai = None


def embed(texts: list[str]) -> list[list[float]]:
    if settings.voyage_api_key and voyageai is not None:
        client = voyageai.Client(api_key=settings.voyage_api_key)
        result = client.embed(texts, model=settings.voyage_embed_model, input_type="document")
        return result.embeddings
    return [_stub_embedding(t) for t in texts]


def embed_query(text: str) -> list[float]:
    if settings.voyage_api_key and voyageai is not None:
        client = voyageai.Client(api_key=settings.voyage_api_key)
        return client.embed([text], model=settings.voyage_embed_model, input_type="query").embeddings[0]
    return _stub_embedding(text)


def _stub_embedding(text: str) -> list[float]:
    """Deterministic pseudo-embedding so retrieval is runnable without a key."""
    dim = settings.embed_dim
    digest = hashlib.sha256(text.encode()).digest()
    raw = [digest[i % len(digest)] / 255.0 for i in range(dim)]
    norm = sum(v * v for v in raw) ** 0.5 or 1.0
    return [v / norm for v in raw]
