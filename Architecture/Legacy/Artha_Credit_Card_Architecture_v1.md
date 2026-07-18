# Artha Architecture v1.0

## Credit Card Module Architecture & Implementation Guide

> Design Goal: - Artha is a Financial Intelligence Platform. - MMEx
> remains the accounting system. - Credit Card module provides decision
> support, not transaction management.

------------------------------------------------------------------------

# 1. High-Level Architecture

``` text
Artha
│
├── Dashboard
├── Financial Profile
├── Banking
├── Credit Cards
├── Loans
├── Investments
├── Insurance
├── Properties
├── Goals
├── Documents
├── Financial Calendar
├── Knowledge Base
├── Reports
├── Settings
└── AI Assistant
```

------------------------------------------------------------------------

# 2. Credit Card Module

``` text
Credit Cards
│
├── Dashboard
├── My Cards
├── Card Library
├── Compare Cards
├── Annual Review
├── Knowledge
└── Settings
```

------------------------------------------------------------------------

# 3. Responsibilities

## Dashboard

Purpose: - Portfolio overview - Upcoming renewals - Total annual fee -
Credit utilization - Alerts

Read-only.

------------------------------------------------------------------------

## My Cards

Stores only user-owned cards.

Suggested fields:

-   Card ID
-   Bank
-   Variant
-   Credit Limit
-   Current Limit Used
-   Opening Date
-   Renewal Date
-   Annual Fee Paid
-   Fee Waiver Target
-   Renewal Status
-   Status (Active/Closed)
-   Personal Notes

No reward calculations.

------------------------------------------------------------------------

## Card Library

Reference catalogue.

Contains:

-   Basic Information
-   Eligibility
-   Fees
-   Renewal
-   Reward Structure
-   Reward Ecosystem
-   Spend Categories
-   Travel Benefits
-   Acceptance
-   Restrictions
-   Milestones
-   Merchant Offers
-   Change History

Read-only reference data.

------------------------------------------------------------------------

## Compare Cards

Features:

-   Select 2-5 cards
-   Side-by-side comparison
-   Highlight strengths
-   Weighted scoring

No persistence.

------------------------------------------------------------------------

## Annual Review

Decision engine.

Outputs:

-   Keep
-   Close
-   Upgrade
-   Downgrade
-   Replace
-   Worth fee?
-   Next review date

------------------------------------------------------------------------

# 4. Layered Architecture (as actually implemented)

> Reconciled 2026-07 against the shipped codebase. Artha does not use a
> DDD/repository layering — the actual shape is intentionally flatter,
> per `CLAUDE.md` and the "Metadata-Driven Financial OS" refactor:

``` text
React/TS frontend (src/)
    │  fetch() calls, no client-side domain layer
    ▼
FastAPI backend (backend/main.py)
    │  all routes in one file; generic CRUD for accounts/assets/liabilities
    │  + dedicated satellite routes for shapes that genuinely diverge
    ▼
SQLite (accounts / assets / liabilities + satellite tables)
```

Business rules for Credit Cards live in `backend/decision_engine.py`
(recommendation generation) and `backend/calculations.py` (pure math),
not a dedicated domain layer. This is a deliberate simplicity trade-off
for a single-user, single-file portable app — do not reintroduce a
domain/application/repository split without revisiting that trade-off
first.

------------------------------------------------------------------------

# 5. Actual Folder Structure

``` text
backend/
  main.py             — all FastAPI routes, including satellite endpoints
                         (/api/liabilities/{id}/credit-card-details, etc.)
  db.py               — schema + idempotent migrations (init_db())
  calculations.py      — pure financial math, no DB access
  decision_engine.py   — reads financial_rules + entities, returns recommendations

src/
  components/
    EntityGrid.tsx      — generic grid, category-aware columns per entityType
    DynamicForm.tsx      — generic add/edit form, category-aware fields
  types.ts               — CreditCardDetails, InsuranceDetails, HoldingLot, etc.
```

There is no `src/modules/credit-cards/` subtree and no per-domain
frontend module — Credit Cards is a `category` value inside the generic
`liabilities` entity type, rendered by the same `EntityGrid`/`DynamicForm`
every other liability category uses. A dedicated Card Library/Compare/
Annual Review UI (sections 7-9 below) would still be new screens, but
should read from the existing `/api/entities/liabilities` and
`credit_card_details` data rather than a parallel module tree.

------------------------------------------------------------------------

# 6. Database Design (as actually implemented)

Artha deliberately collapsed per-domain tables into a generic ledger —
see `CLAUDE.md`: "When adding new entity kinds, prefer adding a new
`categories` row + `fields_definition` over adding a new table." Credit
Cards are **not** a separate `owned_cards` table; they are rows in the
shared `liabilities` table (`category_name = 'Credit Card'`,
`liability_kind = 'revolving_credit'`) plus a 1:1 satellite table for the
fields that don't fit the loan-shaped base columns:

## Existing tables (shipped)

-   `liabilities` — generic ledger row: `name`, `category_id`,
    `lender_institution_id`, `outstanding`, `liability_kind`. Loan-only
    columns (`interest_rate`, `emi`, `tenure_months`) are zeroed for
    revolving credit rows, not removed (kept for schema uniformity).
-   `credit_card_details` — 1:1 satellite (`liability_id` PK/FK):
    `credit_limit`, `statement_balance`, `statement_date`, `due_date`,
    `annual_fee`, `reward_points`, `point_value`.
-   `institutions` — shared reference table for banks/lenders (not a
    credit-card-specific `banks` table).
-   `categories` — `fields_definition` JSON drives per-category custom
    fields for anything that doesn't need a dedicated satellite table.

## Reference data not yet built (Card Library scope)

The following are genuinely new scope — no schema exists for them yet.
If built, they should be **new tables added to `backend/db.py`'s
`init_db()`**, following the same idempotent `CREATE TABLE IF NOT
EXISTS` + migration pattern already used for `credit_card_details`, not
a separate schema module:

-   `card_variants` (reference: bank + network + published fee/reward
    terms — this is genuinely reference data, unlike a user's owned
    card, so a dedicated table is reasonable here)
-   `reward_programs`, `travel_partners`, `merchant_offers` (reference)

## What should stay in the existing generic tables, not new ones

-   A user's **owned card** → already `liabilities` +
    `credit_card_details`. Do not add a parallel `owned_cards` table.
-   **Renewal/fee history** → append-only log; if built, model as a
    `transactions`-style history table or extend `credit_card_details`
    with a linked history table, not a disconnected `renewal_history`
    table with no FK back to `liabilities`.
-   **Comparison scores / annual review outputs** → these are
    calculated data (per the Core Principle below) and should be
    computed on demand by `decision_engine.py`-style functions, not
    cached in new `comparison_scores`/`recommendation_cache` tables,
    unless a real performance need is measured first.

------------------------------------------------------------------------

# 7. UI Navigation

``` text
Credit Cards
│
├── Dashboard
│
├── My Cards
│      ├── Overview
│      ├── Limits
│      ├── Renewal
│      ├── Notes
│
├── Card Library
│      ├── Search
│      ├── Bank
│      ├── Network
│      ├── Premium
│      ├── Cashback
│
├── Compare
│
├── Annual Review
│
└── Settings
```

------------------------------------------------------------------------

# 8. Card Library Page

Sections

1.  Basic Information
2.  Eligibility
3.  Fees
4.  Renewal Benefits
5.  Reward System
6.  Reward Ecosystem
7.  Spend Categories
8.  Travel Benefits
9.  Acceptance
10. Restrictions
11. Milestones
12. Merchant Offers
13. Change Log
14. Pros
15. Cons

------------------------------------------------------------------------

# 9. Comparison Engine

Inputs

-   Selected cards
-   User profile
-   Annual spend
-   Travel preference
-   Reward preference

Outputs

-   Weighted score
-   Pros
-   Cons
-   Recommendation

Comparison dimensions

-   Fee
-   Renewal
-   Rewards
-   Acceptance
-   Ecosystem
-   Travel
-   Simplicity
-   Stability

------------------------------------------------------------------------

# 10. AI Scope

AI MAY

-   Explain
-   Recommend
-   Compare
-   Summarize

AI MUST NOT

-   Modify reference data
-   Change calculations
-   Update schema
-   Change business rules

------------------------------------------------------------------------

# 11. Antigravity Rules

Every prompt must preserve:

-   Database schema
-   Folder structure
-   Domain services
-   UI contracts

Never regenerate architecture because of a UI change.

------------------------------------------------------------------------

# 12. Future Expansion

Phase 1 - Card Library - My Cards - Compare - Annual Review

Phase 2 - Reward tracking - Offer tracking - Merchant intelligence

Phase 3 - AI optimization - Automatic recommendations - Portfolio
simulations

------------------------------------------------------------------------

# Core Principle

Reference Data != User Data != Calculated Data

Keeping these three layers separate prevents cascading changes and keeps
the system maintainable.
