# eval

The AI evaluation harness. Scores agent responses on groundedness, retrieval
hit-rate, escalation precision/recall, and tool-choice accuracy over a labeled
dataset; writes results to `eval_runs` and gates merges in CI. The dataset lives
in `tests/ai-eval`. Online signals (handoff rate, guest thumbs, resolution rate)
complement these offline scores.
