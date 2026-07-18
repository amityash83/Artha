# Business Rules Engine

Deterministic calculation engine, configurable rules, tax rules, loan
rules, projections.

---

## Deterministic, Not AI

Every recommendation and calculation in Artha today is plain Python —
no model calls, no probabilistic reasoning. Two modules carry this:

- **`backend/calculations.py`** — pure math functions (no DB access):
  `calculate_remaining_tenure`, `calculate_remaining_interest`,
  `calculate_loan_progress`, `calculate_interest_saved_after_prepayment`,
  `calculate_goal_expected_completion`, `calculate_xirr` (**dead code —
  defined but never called from any route or component**),
  `calculate_advanced_emi_schedule`, `simulate_multi_loan_payoff`,
  `calculate_monthly_emi`.
- **`backend/decision_engine.py`** — `generate_recommendations(conn)`,
  called once per `/api/init` request. Reads `financial_rules` +
  accounts/liabilities/goals/insurance_details via raw SQL, returns a
  list of recommendation dicts (`category`, `title`, `message`,
  `status`, `action_type`, `suggested_amount`). Recomputed fresh on
  every load — nothing is cached or triggered on write.

## The Configurable Rule Set (`financial_rules` table)

Eight rules ship today, each with a hardcoded Python fallback used if
the row is missing or `is_enabled = 0`:

| rule_key | Default value | Read by |
|---|---|---|
| `min_emergency_fund` | ₹15,00,000 | `decision_engine.py` emergency fund check |
| `insurance_reserve_target` | ₹3,00,000 | `decision_engine.py` insurance reserve check |
| `debt_free_liquidity_target` | ₹30,00,000 | `decision_engine.py` post-debt liquidity check |
| `no_villa_equity` | 1.0 (boolean flag) | Stored only — **not read/enforced by any code**, see below |
| `high_interest_roi_threshold` | 7.5% | `decision_engine.py` loan prepayment flagging |
| `prepayment_min_liquid_buffer` | ₹50,000 | `decision_engine.py` prepayment recommendation gating |
| `insurance_renewal_alert_days` | 30 days | `decision_engine.py` insurance renewal reminder |
| `target_savings_rate` | 35% | Dashboard cash-flow indicator |

All eight are editable via `PUT /api/rules` (see
`10-Configuration-Architecture.md`). `no_villa_equity` is a genuine gap:
it's stored, user-editable, and documented as a real policy ("Do not
invest Villa funds into equity markets"), but no code path anywhere
checks it against actual goal/asset data — it's a rule that exists in
the database but has no enforcement logic, distinct from the
hardcoded-with-fallback rules which do get read.

## Hardcoded Business Rules (not in `financial_rules`, by design)

These are structural/mathematical, not policy preferences a typical user
would want to tune per `01-Vision-and-Principles.md`'s configuration
philosophy:

- Prepayment amount suggestion formula: `min(free_liquid * 0.5,
  loan_outstanding)` — an algorithmic choice, not a tunable threshold.
- Monthly compounding convention (12 intervals/year) throughout
  `calculations.py`'s projection math.
- Multi-loan payoff simulation cap: 360 months (30 years), to bound
  simulation loops, not a financial policy.
- Future Wealth Sliders bounds (ROI 5%–25%, monthly SIP ₹0–₹2,00,000,
  horizon 5–35 years) — UI input constraints, not decision thresholds.
- Financial ratio health-meter bands (Savings Rate/Investment Rate/Debt
  Burden/Expense Ratio/Liquidity Buffer green-yellow-red cutoffs) are
  hardcoded in the **frontend** (`CashFlowPlanning.tsx`), not backed by
  `financial_rules` at all — these can't be tuned via `/api/rules` today
  even though they're policy-like judgment calls, unlike the emergency
  fund/loan ROI rules which are backend-configurable.

`hardcoded_vs_dynamic.md` is the older, now partially stale version of
this classification (it still references pre-rename Windows dev paths
and predates the satellite tables) — this section supersedes it for
rule-level classification; that file is a candidate for retirement or a
refresh pass, not a second source of truth to keep maintaining in
parallel.

## Tax Rules

None exist. No `financial_rules` category, no code path, no schema. See
`Domains/Taxation.md` — this is pure roadmap.

## Loan Rules

See `Domains/Loans.md` for the full breakdown: high-interest flagging,
prepayment recommendation gating and amount suggestion, EMI/amortization
math, multi-loan payoff optimization (Snowball/Avalanche/Baseline via
`simulate_multi_loan_payoff`).

## Projections

`calculate_goal_expected_completion` (goal funding timeline),
`calculate_advanced_emi_schedule` (EMI amortization with mid-month
pro-rata prepayments), `simulate_multi_loan_payoff` (multi-loan payoff
curves under different strategies), and the Future Wealth sandbox
(compounding growth projection, hardcoded slider bounds) are the
projection surfaces that exist today. All are deterministic — no
probabilistic/Monte-Carlo modeling, no external forecast/market data.
