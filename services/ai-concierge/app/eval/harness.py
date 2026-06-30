"""
The evaluation harness — what separates a serious concierge from a chatbot demo.

Runs a labeled dataset of guest questions through the agent and scores:
  - groundedness  : did the answer stick to retrieved knowledge? (LLM-judge)
  - retrieval_hit : was the gold chunk retrieved?
  - escalation    : did high-risk prompts escalate? (precision/recall)
  - tool_choice   : was the right tool selected?

Results are written to `eval_runs` and gate merges in CI (tests/ai-eval).
This module ships the scaffold + scoring shapes; wire the dataset in tests/ai-eval.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class EvalCase:
    question: str
    language: str = "en"
    gold_chunk_id: str | None = None
    expect_escalation: bool = False
    expect_tool: str | None = None


@dataclass
class EvalScores:
    groundedness: float = 0.0
    retrieval_hit: float = 0.0
    escalation_precision: float = 0.0
    escalation_recall: float = 0.0
    tool_choice_accuracy: float = 0.0
    n: int = 0
    details: list[dict] = field(default_factory=list)


def aggregate(results: list[dict]) -> EvalScores:
    """Reduce per-case results into the run-level scores stored in eval_runs."""
    n = len(results) or 1
    return EvalScores(
        groundedness=sum(r.get("groundedness", 0) for r in results) / n,
        retrieval_hit=sum(r.get("retrieval_hit", 0) for r in results) / n,
        escalation_precision=_precision(results),
        escalation_recall=_recall(results),
        tool_choice_accuracy=sum(r.get("tool_ok", 0) for r in results) / n,
        n=len(results),
        details=results,
    )


def _precision(results: list[dict]) -> float:
    tp = sum(1 for r in results if r.get("escalated") and r.get("should_escalate"))
    fp = sum(1 for r in results if r.get("escalated") and not r.get("should_escalate"))
    return tp / (tp + fp) if (tp + fp) else 1.0


def _recall(results: list[dict]) -> float:
    tp = sum(1 for r in results if r.get("escalated") and r.get("should_escalate"))
    fn = sum(1 for r in results if not r.get("escalated") and r.get("should_escalate"))
    return tp / (tp + fn) if (tp + fn) else 1.0
