# Decision Engine

Recommendation framework, simulations, explainability.

---

> This document covers the recommendation/simulation *framework* — how
> recommendations get produced and surfaced. See
> `06-Business-Rules-Engine.md` for the actual rule inventory and
> thresholds; the two overlap by design (one is "what the rules are,"
> this one is "how they run and reach the user").

## Recommendation Framework

`decision_engine.generate_recommendations(conn)` is the entire
recommendation system: one function, called once per `/api/init`
request, that runs a fixed sequence of checks (emergency fund, insurance
reserve, loan prepayment, debt-free liquidity, goal-specific warnings,
insurance renewal reminders) and returns a flat list of recommendation
objects:

```
{ category, title, message, status ('success'|'warning'|'danger'|'info'),
  action_type ('prepay'|'invest'|'save'|'info'), suggested_amount }
```

There is no recommendation ranking/prioritization beyond the order the
checks happen to run in, no dismissal/snooze mechanism (a recommendation
reappears on every load until the underlying condition changes), and no
per-user recommendation history — nothing is persisted about which
recommendations were shown or acted on.

## Simulations (distinct from Recommendations)

Simulations are separate, on-demand, user-initiated "what if" scenarios
— not something `decision_engine.py` produces automatically:

- `/api/simulations/run` — scenario-based (`scenario_type` +
  `params`), covering things like closing a loan early, delaying a
  goal, a salary change, receiving a bonus, a large purchase funded by
  liquid cash or a new loan. Returns a `current` vs. `simulated`
  comparison plus a recommendation string.
- `/api/simulations/debt_payoff` and `/api/simulations/net_worth_forecast`
  — additional simulation endpoints (present in the current codebase;
  verify their exact request/response shape by reading `main.py`
  directly if building against them, since they were added after this
  document's initial grounding pass and weren't independently
  re-verified line-by-line).
- `/api/calculations/loan-optimizer` — multi-loan payoff strategy
  comparison (Baseline/Avalanche/Snowball), via
  `calculations.simulate_multi_loan_payoff()`.

None of these write anything back to the database — they're pure
read-and-compute, safe to call repeatedly with no side effects.

## Explainability

Every recommendation includes a `message` string built with an f-string
in `decision_engine.py` — e.g. "Your {loan_name} loan (Lender: {lender})
has an ROI of {roi}%. Since you have surplus liquidity of ₹{...},
prepaying ₹{...} is highly recommended." This is template-based
explanation, not generated text — the "why" is baked into the Python
conditional that decided to emit the recommendation at all, then
formatted into a sentence. There is no separate explanation layer a user
could ask "why did I get this" and receive additional reasoning beyond
what's already in `message` — see `07-AI-Architecture.md` for where a
real explain-vs-calculate AI layer would attach, if built.

## Known Gaps in the Framework Itself

- `no_villa_equity` is a stored rule with zero enforcement code — a rule
  that exists but the "decision" it's supposed to gate never actually
  checks it (see `06-Business-Rules-Engine.md`).
- Goal-specific checks (emergency fund, insurance reserve, villa fund)
  match by **substring search on the goal's name** (`"emergency" in
  g["name"].lower()`) rather than a structured goal-type/category field
  — a user naming a goal anything without that exact substring gets no
  special-cased check, and this is fragile to typos/renames. This is a
  real implementation detail, not a hypothetical edge case.
- Recommendations recompute fully on every `/api/init` call — fine at
  current data volumes, but there's no caching/memoization if this ever
  becomes a performance concern with a much larger transaction/asset
  history.
