# tests/ai-eval

The AI evaluation dataset + runner. `dataset.example.json` shows the case shape:
question, language, whether it should escalate, the expected tool. The runner
(uses `services/ai-concierge/app/eval/harness.py`) scores groundedness, retrieval
hit-rate, escalation precision/recall, and tool-choice accuracy, writes results to
`eval_runs`, and gates merges in CI. Grow the dataset from the simulated guest
personas.
