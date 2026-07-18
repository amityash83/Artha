# Project Constitution

Defines the vision, principles, scope, non-scope, architecture
governance, coding philosophy, AI guardrails, and decision records.

---

## Vision

Artha is a privacy-first, offline-first Personal Financial Intelligence
Platform. It is **not** an accounting application and **not** a
replacement for Money Manager Ex (MMEx) or any other transaction ledger.
MMEx (or the user's bank/broker of record) is the system of record for
what happened; Artha is the system of intelligence that explains it,
projects it forward, and recommends what to do next. See `Artha.md` for
the full product vision.

## Core Principles

- Offline-first, privacy-first: a single portable SQLite file, no
  mandatory cloud, no telemetry.
- Single Source of Truth: one local database drives every screen; the
  same `/api/init` payload feeds Dashboard, Reports, Simulations, etc.
- Configuration over hardcoding, where it matters: financial thresholds
  that users plausibly want to tune (emergency fund target, high-interest
  ROI cutoff, insurance renewal window) live in the `financial_rules`
  table, editable via `/api/rules`, with hardcoded fallbacks if a rule is
  absent or disabled. Not everything is configurable — see
  `hardcoded_vs_dynamic.md` for the authoritative list of what is and
  isn't, and don't assume a number is DB-driven just because it could be.
- Metadata-driven entities, not a table per domain: `accounts`, `assets`,
  `liabilities`, `income`, `expenses`, `goals` are generic ledgers
  distinguished by a `categories.category_id` discriminator, not
  separate tables per financial instrument. Dedicated satellite tables
  (e.g. `credit_card_details`, `insurance_details`, `holding_lots`) are
  added only when a category's shape genuinely diverges from its
  siblings (see `05-Database-Architecture.md`) — not by default.
- AI assists, deterministic rules calculate: recommendation logic
  (`decision_engine.py`) and financial math (`calculations.py`) are
  plain Python, not model calls. No AI/LLM integration exists in the
  shipped app today (see `07-AI-Architecture.md`).
- Low maintenance: the product goal is under ~15 minutes of monthly data
  entry to keep a snapshot current.

## Scope (what Artha is, today)

A desktop app (Electron shell + FastAPI backend + SQLite) covering:
Accounts/Banking, Loans, Credit Cards, Investments, Properties,
Insurance, Goals, Income/Expenses/Budgeting, a computed Financial
Calendar, Simulations/decision-support recommendations, and data
management (backups, database switching, MMex CSV import). See
`Domains/` for the authoritative per-domain breakdown of what's actually
built versus aspirational.

## Non-Scope (explicitly, not just "not yet")

- Not a transaction-level accounting system or bookkeeping ledger
  replacement for MMEx.
- Not a reward-points/cashback optimization engine, despite a Credit
  Cards reward calculator existing in the UI — see `Domains/Credit-Cards.md`
  for exactly what is and isn't real there.
- Not a live market-data/price-feed product — investment values are
  user-entered, not fetched.
- Not a tax filing or payroll product.
- Not multi-user/multi-tenant — one SQLite file is one user's data.

## Architecture Governance

- Prefer extending the existing generic tables (`assets`/`liabilities`/
  etc.) + `categories.fields_definition` over adding a new top-level
  table for a new financial instrument. Add a dedicated satellite table
  only when a category's fields genuinely can't fit the shared shape
  (precedent: `credit_card_details`, `insurance_details`,
  `holding_lots`).
- Any schema change must ship as an idempotent migration inside
  `init_db()` (`backend/db.py`), following the existing
  detect-old-shape → migrate-data → rename-old-table pattern. `init_db()`
  runs on every backend startup, so migrations must be safe to re-run.
- Do not build a domain/application/repository layered architecture.
  The shipped shape is deliberately flat — one `backend/main.py` for
  routes, `db.py` for schema, `calculations.py` for pure math,
  `decision_engine.py` for recommendation rules. This has been proposed
  and explicitly rejected once already (see `Architecture/Legacy/`'s
  reconciliation notes) as unnecessary complexity for a single-user app.
- Before documenting or building against a table/route/component, check
  it actually exists and is wired up — this codebase has had schema
  proposed in `db.py` that was never connected to any route (see
  `Domains/Credit-Cards.md`'s "dead schema" notes on the reward tables).
  Grep before you write.

## Coding Philosophy

See `CLAUDE.md` for the canonical, current guidance on commands,
architecture, and codebase-specific gotchas (startup sequence timing,
double-entry balance adjustment on transactions, DB path resolution,
hardcoded port). This Constitution defers to `CLAUDE.md` for anything
operational; it exists to capture the higher-level "why," not duplicate
the "how."

## AI Guardrails

No AI/LLM feature is implemented today. If one is built:

- AI MAY: explain, summarize, compare, and recommend using the user's
  own data already computed by `decision_engine.py`/`calculations.py`.
- AI MUST NOT: modify schema, change deterministic calculations, rewrite
  architecture, or silently alter financial_rules values. Any AI-proposed
  change to a rule or calculation must go through the same reviewed path
  a human edit would.

## Decision Records

- **Metadata-driven refactor**: the schema was deliberately consolidated
  from per-domain tables (`loans`, `investments`, `properties`,
  `insurance`, `credit_cards`) into generic `assets`/`liabilities` tables
  with a category discriminator — see the "Refactor Artha into
  Metadata-Driven Financial OS" commit and the still-present `*_old`
  migration logic in `db.py`. Do not propose reversing this without
  discussing the trade-off explicitly.
- **Wealth-management satellite tables (2026-07)**: Credit Cards,
  Insurance, and Stock/Mutual Fund holdings each got a dedicated 1:1 or
  1:many satellite table (`credit_card_details`, `insurance_details`,
  `holding_lots`) because their fields didn't fit the shared
  asset/liability shape — this was a scoped exception, not a reversal of
  the metadata-driven principle. See `05-Database-Architecture.md`.
- **Two prior architecture proposals reconciled, not adopted verbatim**:
  `Architecture/Legacy/Artha_Credit_Card_Architecture_v1.md` and
  `Architecture/Legacy/Artha_Financial_Data_Model_and_System_Architecture_v1.md`
  proposed a DDD/repository layering and a dozen+ new per-domain
  reference tables. Their genuinely useful product/roadmap ideas were
  folded into `Domains/*.md`; their architectural proposals that
  conflicted with the shipped metadata-driven design were explicitly
  corrected, not carried forward.
