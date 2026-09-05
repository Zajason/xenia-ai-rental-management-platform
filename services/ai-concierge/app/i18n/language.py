"""
FEATURE: multi-language concierge.

The guest's language is detected from their message (or taken from the stored
guest preference), the agent is instructed to reply in it, and the knowledge base
is retrieved cross-lingually and translated at generation time. English is the
fallback. This module keeps detection swappable — a heuristic now, a fast Haiku
classification or a langid model later.
"""
from __future__ import annotations

import re

SUPPORTED = {"en", "el", "fr", "de", "it", "es", "pt", "nl"}
DEFAULT = "en"

# Tiny stop-word heuristic for offline/dev use. Replace with a real detector
# (langid / a fast model). Multi-word hints are more specific and ranked first
# so a whole-word "wo" (German) never wins over an actual French/etc. phrase.
_HINTS = {
    "el": ["καλημέρα", "ευχαριστώ", "παρακαλώ", "πού"],
    "fr": ["bonjour", "merci", "où", "s'il", "s'il vous plaît"],
    "de": ["hallo", "danke", "wo", "bitte"],
    "it": ["ciao", "grazie", "dove", "per favore"],
    "es": ["hola", "gracias", "dónde", "por favor"],
    "pt": ["olá", "obrigado", "onde"],
    "nl": ["hallo", "dank", "waar", "alstublieft"],
}


def detect_language(text: str) -> str:
    """Heuristic detection with WHOLE-WORD matching.

    Word boundaries are essential: a naive substring check matched "wo" (German)
    inside the English word "pass·wo·rd" and answered guests in German.
    """
    lowered = text.lower()
    for lang, hints in _HINTS.items():
        for hint in hints:
            if re.search(rf"(?<!\w){re.escape(hint)}(?!\w)", lowered):
                return lang
    return DEFAULT


def normalize(code: str | None) -> str:
    if not code:
        return DEFAULT
    base = code[:2].lower()
    return base if base in SUPPORTED else DEFAULT
