# Taxation Domain

## Purpose

Help a user understand their tax position (regime choice, estimated
liability, deductions used vs. available) as an input to financial
decisions — e.g. whether a prepayment or an investment has a better
after-tax outcome. This is explicitly **not built** today; this section
describes the intended purpose per `Artha.md`'s vision, not a shipped
capability.

## Scope

None — no code, no schema, no UI exists for taxation anywhere in the
current codebase (confirmed via repo-wide search). If built, the
originally-envisioned scope (per `Artha.md` and the legacy
`architecture/` docs) was: Old vs. New regime comparison, estimated tax
computation, deductions tracking, capital gains, employer TDS, refund
tracking.

## Out of Scope

Everything — there is nothing to scope out of since nothing exists.
Explicitly, per `00-Project-Constitution.md`: Artha is not a tax-filing
product even if this domain is eventually built; it would compute
estimates for decision support, not file returns.

## Business Objectives

If built: let a user see which investments/deductions reduce their tax
liability, compare Old vs. New regime outcomes given their actual
income/investment data (which already exists in `income`/`assets`), and
factor after-tax returns into loan-vs-invest recommendations
(`decision_engine.py` today has no tax awareness at all).

## Data Model

None exists. A natural design (not committed, just a plausible starting
point) would follow the existing pattern: a `tax_profile` or similar
per-financial-year row (regime, estimated tax, deductions used), rather
than a from-scratch schema unrelated to how `financial_rules`/`assets`
already work — e.g. Section 80C-style deduction limits could plausibly
live as `financial_rules` entries (DB-configurable, since tax law
changes yearly) rather than hardcoded Python.

## Database Schema

None.

## Business Rules

None. `liabilities.tax_benefit` (default `'None'`) and
`assets.tax_category` columns already exist in the schema (see
`05-Database-Architecture.md`) but are unused placeholders — no code
reads or writes meaningful values into them today.

## Configuration

None — but if built, per `01-Vision-and-Principles.md`'s configuration
philosophy, tax slab/regime parameters that change annually are strong
candidates for `financial_rules` entries rather than hardcoded values,
since they're exactly the kind of "policy that changes and a user/admin
should be able to update without a code release" case that table was
designed for.

## UI Structure

None.

## API Contracts

None.

## AI Responsibilities

None — no AI exists in the product at all today (see
`07-AI-Architecture.md`). If a Taxation domain and an AI feature are
both eventually built, tax *estimation* must remain deterministic
(`calculations.py`-style), with AI limited to explaining the estimate in
plain language, per the explain-vs-calculate boundary in
`07-AI-Architecture.md`.

## Reports

None.

## Future Enhancements

Full domain build-out: regime comparison, deduction tracking tied to
actual `assets`/`income` data already in the system, capital gains
computation on asset redemption/sale transactions (the `transactions`
table's `Sell`/`Redemption` types already capture the event that would
need to feed this), employer TDS reconciliation, refund tracking. This
is a substantial, self-contained new domain — not a small addition to
an existing one.
