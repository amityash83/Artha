# Loans Domain

## Purpose

Loans is the amortizing-debt slice of Artha's "Financial Intelligence Layer": it tracks Home, Personal, and Car loans as reducing-balance liabilities, computes their live payoff math (remaining tenure, remaining interest, progress), and helps the user decide when and how much to prepay. It turns a raw outstanding balance + EMI into forward-looking numbers (interest saved, months shaved off, multi-loan strategy comparisons) rather than just logging installments after the fact.

## Scope

- Home Loan, Personal Loan, Car Loan tracking as rows in the shared `liabilities` table (category-discriminated, not separate tables)
- Home Loan-to-Property linkage (`liabilities.linked_asset_id` -> `assets.id`)
- Remaining tenure / remaining interest / percent-progress calculation, derived live on every `/api/init` and `/api/entities/liabilities` read (not stored)
- Standalone EMI calculation (`calculate_monthly_emi`) and an advanced amortization sandbox with mid-tenure prepayments, pro-rata interest, and Excel export (independent of any single stored loan — a "what-if" calculator)
- Prepayment interest-saved calculation for a single loan
- Multi-loan payoff optimization/simulation comparing baseline vs. avalanche (highest-ROI-first) vs. snowball (lowest-balance-first) strategies, with monthly or annual extra-payment budgets
- Rule-based prepayment recommendations from `decision_engine.py` (high-interest flag + liquidity-buffer check)
- EMI reminders on the shared Financial Calendar
- "Close Loan" and "ROI Reduction" scenario simulations in the generic what-if Simulations engine
- Loan-linked transaction types (`emi`, `prepayment`) that auto-adjust the liability's `outstanding` balance via double-entry bookkeeping

## Out of Scope

- No amortization-table persistence — the advanced EMI schedule and multi-loan simulations are computed on demand and returned to the frontend; nothing is written back to `liabilities` except via explicit CRUD or transaction postings
- No loan product comparison/marketplace (no "which bank offers the best home loan rate" feature)
- No document storage for loan sanction letters/agreements (Documents is a separate, unimplemented concern)
- No automatic EMI-date-to-transaction reconciliation — a user must manually record an `emi`/`prepayment` transaction; the calendar only reminds, it doesn't post
- No tax-benefit calculation logic — `liabilities.tax_benefit` is a stored free-text/categorical column with no computation in `calculations.py` or `decision_engine.py` today
- `emi_profiles` (named saved EMI-calculator scenarios, used by `EmiCalculator.tsx` via `/api/settings/emi-profiles`) is a calculator convenience, not part of the core Loan entity model — it has no linkage back to an actual `liabilities` row

## Business Objectives

- Give the user a clear, live view of how much interest remains and how many months are left on each loan, without manual spreadsheet amortization
- Surface high-interest debt (ROI at or above a configurable threshold) as a candidate for prepayment before the user over-invests elsewhere
- Quantify the interest saved from a specific prepayment amount, and let the user compare "pay off fastest" (snowball) vs. "pay off cheapest" (avalanche) strategies across all loans at once before committing cash
- Ensure prepayment recommendations respect a liquidity floor — the engine never suggests draining below the emergency fund or a configurable buffer above it
- Keep loan EMI due-dates visible alongside every other financial obligation (insurance, SIPs, credit card dues) on one calendar

## Data Model

Conceptually, a Loan is a **Liability** — the same generic entity used for Credit Cards, distinguished only by its `category` (Home Loan / Personal Loan / Car Loan) and by having non-zero `interest_rate`, `emi`, and `tenure_months` (Credit Cards deliberately zero these out). There is no separate `Loan` table or domain object.

- **Liability** (base row): name, category (discriminator), lender institution, interest rate, EMI, outstanding balance, original tenure in months, compounding assumption, an optional link to a financed **Asset** (used by Home Loans to point at the purchased Property), a tax-benefit label, and a `metadata_json` catch-all for any category-specific custom fields not on the fixed schema.
- **Institution**: shared reference entity (bank/lender), not loan-specific.
- **Category**: carries the `fields_definition` JSON schema for any additional custom fields a loan category might need (currently none of the three loan categories define custom fields — `fields_definition` is `NULL` for Home/Personal/Car Loan).
- A Loan has no satellite table of its own (unlike Credit Cards' `credit_card_details`) — all loan-specific fields live directly on `liabilities` because they fit its fixed columns.
- **Transaction**: a loan's outstanding balance moves only through posted transactions of type `emi` or `prepayment` (referencing the liability as the transaction's destination), not by editing `outstanding` directly through the entity form (though direct edits are technically possible via the generic CRUD form).

## Database Schema

From `backend/db.py`'s `init_db()`. The `liabilities` table (shared with Credit Cards):

```sql
CREATE TABLE IF NOT EXISTS liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    lender_institution_id INTEGER REFERENCES institutions(id),
    interest_rate REAL DEFAULT 0.0,
    emi REAL DEFAULT 0.0,
    outstanding REAL DEFAULT 0.0,
    tenure_months INTEGER DEFAULT 0,
    compounding TEXT DEFAULT 'Monthly',
    linked_asset_id INTEGER REFERENCES assets(id),
    tax_benefit TEXT DEFAULT 'None',
    metadata_json TEXT,
    liability_kind TEXT DEFAULT 'loan'  -- 'loan' vs 'revolving_credit'; added via migration
)
```

Loan rows keep `liability_kind = 'loan'` (the default). Seeded `categories` rows relevant here: `('Liability', 'Home Loan', None)`, `('Liability', 'Personal Loan', None)`, `('Liability', 'Car Loan', None)` — all with `fields_definition = NULL`, i.e. no extra custom fields beyond the fixed columns above.

There is no dedicated `loans` table in the live schema — a legacy `loans` table (with `loan_type`, `roi`, `lender`, `start_date`, `prepayment_allowed`, `processing_fee` columns) is migrated into `liabilities` + `metadata_json` (carrying `start_date`, `prepayment_allowed`, `processing_fee`) on startup if found, then renamed to `loans_old`. The Financial Calendar reads `start_date` back out of `metadata_json` to compute each month's EMI due-day.

## Business Rules

Implemented in `backend/calculations.py` (pure math, no DB access) and `backend/decision_engine.py` (reads `financial_rules` + entities):

- `calculate_remaining_tenure(outstanding, roi, emi)` — closed-form amortization formula `N = -ln(1 - Pr/E) / ln(1+r)`; returns `inf` if the EMI doesn't even cover monthly interest
- `calculate_remaining_interest` — `(remaining_tenure * emi) - outstanding`
- `calculate_loan_progress(original_tenure, remaining_months)` — percent complete, clamped 0-100
- `calculate_interest_saved_after_prepayment` — compares remaining interest before vs. after a hypothetical prepayment
- `calculate_advanced_emi_schedule` — full month-by-month amortization with pro-rata daily interest around prepayment dates, capped at a 360-month (30-year) simulation safety limit
- `simulate_multi_loan_payoff` — baseline/avalanche/snowball multi-loan simulation, also capped at 360 months
- `calculate_monthly_emi` — standard EMI formula, used for fresh "what-if" loan sizing
- `decision_engine.generate_recommendations`: flags any loan with `interest_rate >= high_interest_roi_threshold` (rule key `high_interest_roi_threshold`) as a prepayment candidate. If free liquidity (total liquid funds minus the emergency-fund target) exceeds `prepayment_min_liquid_buffer`, it recommends prepaying `min(free_liquid * 0.5, outstanding)`; otherwise it defers the recommendation until the emergency fund is stable ("Debt Reduction Opportunity" info-level message). It also raises a "Debt-Free Liquidity Target" check once all loans reach zero outstanding.

## Configuration

Per `hardcoded_vs_dynamic.md`, the loan-specific rules are DB-configurable via the `financial_rules` table (editable through `PUT /api/rules`), with hardcoded Python fallbacks if a rule row is missing or disabled:

| Rule key | Default value | Configurable? |
|---|---|---|
| `high_interest_roi_threshold` | 7.5% | Yes — `financial_rules`, fallback hardcoded in `decision_engine.py` |
| `prepayment_min_liquid_buffer` | ₹50,000 | Yes — `financial_rules`, fallback hardcoded in `decision_engine.py` |

Hardcoded, not DB-configurable at all:
- Prepayment suggestion sizing: `min(free_liquid * 0.5, outstanding)` — the 50% split is a Python constant in `decision_engine.py`
- Multi-loan/advanced-EMI simulation cap of 360 months — a safety limit in `calculations.py`, not a business rule
- Monthly compounding assumption throughout — `calculations.py` always divides annual ROI by 12
- EMI Optimizer UI slider bounds (extra monthly budget default, annual prepayment amount default) — hardcoded defaults in `LoanOptimizer.tsx` (e.g. ₹50,000/month, ₹200,000/year, March 31 as default annual prepayment date), purely frontend, not persisted rules

## UI Structure

- `EntityGrid.tsx` renders the `liabilities` entity type generically; for the `Home Loan`, `Personal Loan`, and `Car Loan` categories it adds two category-specific columns via `CATEGORY_COLUMNS`: Rate (ROI, suffixed `%`) and Monthly EMI — same column set for all three loan categories, no per-category differentiation beyond that
- `DynamicForm.tsx` renders the add/edit form: for any non-Credit-Card liability it shows lender (institution select), outstanding, interest_rate, emi, tenure_months, status, and owner. If the category is specifically `Home Loan`, it additionally shows a `linked_asset_id` "Linked Property" select populated from Properties not already linked to another Home Loan — this is the only field that differs between loan categories
- `LoanOptimizer.tsx` — dedicated screen consuming `POST /api/calculations/loan-optimizer`; filters `data.liabilities` to exclude `category_name === 'Credit Card'` (i.e., operates on all loan-shaped liabilities together, not filtered by a specific loan category), lets the user set an extra monthly or one-off annual prepayment budget, and renders baseline/avalanche/snowball payoff curves via `react-chartjs-2`
- `EmiCalculator.tsx` — a standalone "what-if" EMI sandbox (not tied to any specific stored liability by default) consuming `POST /api/calculations/advanced-emi`, with save/load of named scenarios via `/api/settings/emi-profiles` and an Excel export button hitting `/api/calculations/advanced-emi/export/excel`

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/liabilities` — generic CRUD (shared with Credit Cards and every other liability category). Payload fields not matching a fixed `liabilities` column are folded into `metadata_json` by `serialize_entity_payload()`. `GET /api/init` additionally computes and attaches `remaining_tenure`, `remaining_interest`, and `progress` per liability row when `outstanding > 0 and interest_rate > 0 and emi > 0` (Credit Card rows, having zeroed interest_rate/emi, get `remaining_tenure = -1`, `progress = 100.0` instead)
- `POST /api/calculations/advanced-emi` — body `{loan_amount, roi, tenure_months, start_date, prepayments: [{date, amount}]}`; returns `{monthly_emi, total_principal, total_interest, total_prepayments, total_payment, schedule: [...], tenure_months}`
- `POST /api/calculations/advanced-emi/export/excel` — identical request body, returns a `.xlsx` file (`StreamingResponse`) with a formatted amortization schedule sheet
- `GET/POST/DELETE /api/settings/emi-profiles` and `/api/settings/emi-profiles/{profile_id}` — CRUD for named saved EMI-calculator scenarios (`emi_profiles` table)
- `POST /api/calculations/loan-optimizer` — body `{loans: [...], extra_monthly_budget, prepayment_frequency, prepayment_amount, prepayment_month, prepayment_day}`; returns `{baseline, avalanche, snowball}`, each `{total_interest, months, schedule: [{month, interest, principal, outstanding}]}`
- `GET /api/calendar` — includes loan EMI reminder events (`type: "EMI"`) generated for the next 12 months, derived from each loan's `metadata_json.start_date` and monthly `emi`, filtered to liabilities where `outstanding > 0 and emi > 0 and interest_rate > 0`
- `POST /api/simulations/run` with `scenario_type: "close_loan"` — zeroes a specific loan's outstanding/EMI and reports interest saved (in-memory simulation only, does not write to the DB); `scenario_type: "roi_reduction"` similarly simulates a rate cut
- `PUT /api/rules` — updates a `financial_rules` row by `rule_key` (used to edit `high_interest_roi_threshold` / `prepayment_min_liquid_buffer`)
- Recommendations for loans arrive bundled inside `GET /api/init`'s `recommendations` array (no dedicated `/api/loans/recommendations` endpoint)

## AI Responsibilities

None currently exist. There is no AI/ML assistant built anywhere in Artha today — no LLM integration, no natural-language query surface, nothing that reads or writes loan data autonomously. The closest adjacent capability is `decision_engine.py`'s recommendation generator, which is deterministic rule-based logic (threshold comparisons against `financial_rules` values), not AI or machine learning. Any future AI assistant would need to be scoped and built from scratch; it should be assumed to only *read* loan data and calculation outputs, not mutate the liability record or recompute business rules, consistent with the "AI MUST NOT modify calculations/schema/business rules" boundary described for Credit Cards in the legacy architecture doc.

## Reports

- Excel export of a single loan's full amortization schedule via `POST /api/calculations/advanced-emi/export/excel` (loan amount, ROI, tenure, monthly EMI, total interest, total prepayments, and a month-by-month table) — this is the only dedicated loan report today
- No PDF export, no consolidated "all loans" report, no historical payoff-progress report over time (the `snapshots` table records net worth history generally, but nothing loan-specific beyond that)
- The Financial Calendar and dashboard recommendations surface loan obligations but are not exportable/printable reports in themselves

## Future Enhancements

Not yet built — no code exists for any of the following; these would require new product decisions before implementation:

- Persisted, versioned amortization history (currently every schedule is recomputed on demand; there is no audit trail of past EMI schedules or rate changes over time)
- Automatic reconciliation between calendar EMI reminders and actual posted `emi` transactions (currently entirely manual)
- Loan refinance/balance-transfer comparison tooling
- Tax-benefit computation using `liabilities.tax_benefit` (the column exists and is stored, but no calculation reads or projects tax savings from it)
- Linking `emi_profiles` saved scenarios back to an actual `liabilities` row, so a saved "what-if" can be promoted into a real tracked loan
- Extending `decision_engine.py`'s prepayment logic to consider strategy choice (avalanche/snowball) rather than always targeting a single highest-ROI loan with a flat 50% liquidity split

## Loan accounts in the ledger, automatic EMIs and floating rates (October 2026)

- **MMEX-style loan accounts.** Ledger rows move a loan by direction (see CLAUDE.md): an `Interest` (or `Fee`) row from outside raises the balance, an `EMI`/`Prepayment` transfer from an account lowers it, so a month of interest + EMI lowers it by the principal and mirrors the bank's statement line for line. Editing the interest row to the bank's figure reconciles the balance exactly.
- **Automatic EMIs** (`post_due_emis` in `main.py`, run on `/api/init`): per loan, metadata `auto_emi`, `emi_account_id`, `emi_day`; `auto_emi_since` (stamped when first seen on, cleared when switched off) and `auto_emi_last` make it start from the day it was switched on and never post twice. Interest is `balance × rate / 12` at the rate in force on the date; the final EMI only clears what's left. `test_auto_emi.py`.
- **Floating rates** (`loan_rate_changes`, one row per change: effective date, rate, and EMI when the bank changed it rather than the tenure). `loan_terms_on()` gives the terms in force on a date (the earliest row's `previous_rate`/`previous_emi` are the terms before any change); `apply_rate_changes()` keeps the loan's own `interest_rate`/`emi` equal to today's terms, so projections and forms follow a change once it starts; future-dated changes wait. Past ledger rows are never rewritten. Routes: `GET/POST /api/liabilities/{id}/rate-changes`, `DELETE …/{change_id}` (hands the "previous" terms on, or restores them when the last change goes). `test_rate_changes.py`.
