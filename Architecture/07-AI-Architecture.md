# AI Architecture

AI boundaries, prompts, orchestration, explain vs calculate, guardrails.

---

## Current State: No AI Exists

Despite Artha.md describing it as "AI-powered" and listing an "AI
Assistant" module and "AI Engine" layer in the product vision, **there is
no AI/LLM integration anywhere in the shipped codebase** — confirmed by
grep across `backend/` and `src/`: no LLM API client, no prompt template,
no embeddings, no model call of any kind. Every "recommendation" a user
sees comes from `decision_engine.py`'s deterministic rule checks (see
`06-Business-Rules-Engine.md`), not from an AI. This document defines
the boundaries an AI feature would have to respect **if and when one is
built** — it is a guardrail spec for future work, not a description of
a working system.

## Explain vs. Calculate — the Core Boundary

The dividing line, per `Artha.md` and `00-Project-Constitution.md`:

- **Calculate** = deterministic, auditable, reproducible. Owned by
  `calculations.py`/`decision_engine.py`. An AI must never replace this
  — a user's EMI schedule or net worth must be the same number every
  time, computed the same way, not subject to model variance.
- **Explain** = natural-language framing of a number that's already
  been calculated deterministically. This is the only role an AI
  feature should play: "explain why this recommendation fired," "compare
  these two scenarios in plain language," "summarize this month's
  changes" — always working from numbers `decision_engine.py`/
  `calculations.py` already produced, never computing its own.

## AI Boundaries (guardrails for future implementation)

**AI MAY:**
- Explain an existing recommendation or calculated figure in plain
  language.
- Compare pre-computed scenarios (e.g. two `/api/simulations/run`
  outputs) and summarize the difference.
- Recommend, in the sense of surfacing which existing
  `decision_engine.py` output is most relevant to a user's question —
  not inventing a new recommendation from scratch.
- Summarize trends across `/api/snapshots` or `/api/calendar` data.

**AI MUST NOT:**
- Modify the database schema.
- Change or override a deterministic calculation (EMI, XIRR, net worth,
  goal completion date) — these must always come from
  `calculations.py`, never be recomputed or "corrected" by a model.
- Silently change a `financial_rules` value. If an AI ever proposes a
  rule change, it must go through the same reviewed path a human editing
  `/api/rules` would — a proposal, not an autonomous write.
- Rewrite architecture or introduce new tables/routes on its own
  initiative.

## Orchestration

Not designed yet — there is no agent loop, no tool-calling framework, no
conversation state anywhere in the codebase to build on top of. If this
is scoped in the future, it should be treated as a genuinely new
subsystem (likely a new `backend/ai/` module calling out to
`calculations.py`/`decision_engine.py` as read-only tools), not
retrofitted into `decision_engine.py` itself, to preserve the
explain-vs-calculate boundary structurally, not just by convention.

## Prompts

None exist. Nothing to document.

## Relationship to `Artha.md`'s "AI Engine" Layer

`Artha.md`'s architecture diagram lists an "AI Engine" alongside the
"Financial Engine" and "Analytics Engine" as a peer layer. As of this
writing, only the Financial Engine (`calculations.py`/
`decision_engine.py`) exists; the Analytics Engine and AI Engine are
aspirational — see `15-Roadmap.md`.
