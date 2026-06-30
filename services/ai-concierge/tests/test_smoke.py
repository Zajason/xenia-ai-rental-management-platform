"""Offline smoke tests — run without any API keys."""
from app.i18n.language import detect_language, normalize
from app.rag.embeddings import embed_query
from app.config import settings


def test_language_detection():
    assert detect_language("bonjour, où est le parking?") == "fr"
    assert detect_language("hello there") == "en"
    assert normalize("EN-us") == "en"


def test_stub_embedding_is_deterministic_and_sized():
    a = embed_query("the wifi password")
    b = embed_query("the wifi password")
    assert a == b
    assert len(a) == settings.embed_dim
