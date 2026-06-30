"""
FEATURE: multi-language concierge.

The guest's language is detected from their message (or taken from the stored
guest preference), the agent is instructed to reply in it, and the knowledge base
is retrieved cross-lingually and translated at generation time. English is the
fallback. This module keeps detection swappable — a heuristic now, a fast Haiku
classification or a langid model later.
"""
from __future__ import annotations

SUPPORTED = {"en", "el", "fr", "de", "it", "es", "pt", "nl"}
DEFAULT = "en"

# Tiny stop-word heuristic for offline/dev use. Replace with a real detector.
_HINTS = {
    "el": ["καλημέρα", "ευχαριστώ", "παρακαλώ", "πού"],
    "fr": ["bonjour", "merci", "où", "s'il"],
    "de": ["hallo", "danke", "wo", "bitte"],
    "it": ["ciao", "grazie", "dove", "per favore"],
    "es": ["hola", "gracias", "dónde", "por favor"],
    "pt": ["olá", "obrigado", "onde"],
    "nl": ["hallo", "dank", "waar", "alstublieft"],
}


def detect_language(text: str) -> str:
    lowered = text.lower()
    for lang, hints in _HINTS.items():
        if any(h in lowered for h in hints):
            return lang
    return DEFAULT


def normalize(code: str | None) -> str:
    if not code:
        return DEFAULT
    base = code[:2].lower()
    return base if base in SUPPORTED else DEFAULT
