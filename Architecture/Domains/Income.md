# Income Domain

## Purpose

Income capture exists so Artha can compute cash-flow health (savings rate, investment rate, debt burden) rather than just point-in-time net worth — consistent with the "Financial Intelligence Layer" framing in Artha.md ("What is my projected cash flow?"). In the current codebase this purpose is actually split across two parallel, overlapping mechanisms that coexist rather than one clean model — see Data Model below, which is the most important thing to understand about this domain today.

## Scope

- Generic CRUD for per-item income records (`income` table: Salary, Bonus, Rental, Dividend, Interest categories) via `/api/entities/income`.
- A separate, independent monthly aggregate log (`monthly_cash_flows` table) capturing one row per month with `net_salary`, `other_income`, `household_expenses`, `emi`, `insurance_premium`, `investments`, `one_time_expenses` — manually entered by the user each month.
- Cash-flow health ratios (savings rate, investment rate, debt burden, expense ratio) computed from the `monthly_cash_flows` log, plus a what-if simulator (`/api/calculations/cash-flow/simulate`) for scenario planning (salary change, bonus, new EMI, expense reduction, etc.).
- **Budget Planning** (`frontend/src/components/BudgetPlanner.tsx`, a third, distinct feature living in this same conceptual space): per-Expense-category monthly budgets vs. actual spend. This is not covered by the original blueprint's domain list at all — it's documented here because it's the closest existing domain, not because it was anticipated. See Data Model below for how it relates (loosely) to `income`/`monthly_cash_flows`.

## Out of Scope

- No payroll/salary-slip parsing or OCR — income entries are manually typed numbers.
- No tax withholding/TDS calculation — the `income.taxable` flag exists as a boolean marker but there is no tax computation engine anywhere in calculations.py or decision_engine.py.
- No automatic reconciliation between the per-item `income` table and the monthly `monthly_cash_flows` aggregate — a user can add a Salary row to `income` and separately log a different `net_salary` figure in `monthly_cash_flows` with no cross-check or warning.
- No income growth forecasting beyond the flat `growth_rate` column on `income` (stored but not read/applied by any calculation function found in calculations.py or main.py).
- No multi-year income projection tied to career stage, raises, or inflation-adjusted salary modeling.

## Business Objectives

- Establish a monthly savings/investment/debt-burden baseline the user can compare against the `target_savings_rate` rule (financial_rules, default 35%) and the hardcoded ratio-health bands documented in hardcoded_vs_dynamic.md (Savings Rate, Investment Rate, Debt Burden, Expense Ratio, Liquidity Buffer meters).
- Let the user sandbox "what if" scenarios (salary raise, bonus, new EMI, expense cut) and see the resulting surplus/savings-rate/debt-ratio delta before committing to a real decision.
- Auto-fill cash-flow planning inputs from live data elsewhere in the system (loan EMIs, rental income, insurance premiums, goal contributions) so the user isn't re-typing numbers that already exist in other domains.

## Data Model

Since 2026-10 the two tables have distinct, documented roles (the earlier "two overlapping mechanisms" seam is resolved by scoping, not merging):

1. **`income` / `expenses`: the recurring plan.** One row per expected source or commitment, per person: `owner_id` (FK → people; existing rows were assigned to the Primary Owner by an idempotent `init_db()` migration), `category_id` (Income: Salary/Bonus/Rental/Dividend/Interest; Expense categories), `amount` per period, `frequency` (Monthly / Quarterly / Half-Yearly / Yearly; matched case-insensitively for older free-text rows), `taxable` (income), `metadata_json` for custom fields. Salary's amount is **gross**; take-home is the Salary category's `net_amount` custom field (`fields_definition`, backfilled for older databases). Edited on the **Income & Expenses** screen (`frontend/src/components/IncomeExpenses.tsx`, the generic `EntityGrid`/`DynamicForm`). `/api/init` returns each row with `owner_name` and its custom fields flattened on.
2. **`monthly_cash_flows`: what actually happened each month.** One row per calendar month with household aggregates (`net_salary` = take-home, `other_income`, `household_expenses`, `emi`, `insurance_premium`, `investments`, `one_time_expenses`). `CashFlowPlanning.tsx`'s ratios and simulator use only this log. Its **Auto-Fill** pre-fills a new month from the plan and the portfolio:
   - net salary from Salary entries' take-home (naming entries without one);
   - other income from non-salary income entries (property rent only when the plan has no Rental entry, to avoid double counting);
   - household expenses from expense entries other than EMI;
   - EMIs from loans, premiums from policies, investments from goal contributions.

   The user then corrects it to the actual figures.

The Tax Planner reads the plan per person (`backend/tax/prefill.py`; the profile estimate filters income by `owner_id` too).

**A third, related mechanism**: `BudgetPlanner.tsx` adds per-category monthly budgeting on the *expense* side — it reads `categories` filtered to `entity_type = 'Expense'`, lets the user set a `monthly_budget` value per category (the `categories.monthly_budget` column, added via a migration — see `05-Database-Architecture.md`), and computes "actual spent" for the selected month by querying `/api/entities/transactions` client-side and summing `Debit`-type transactions whose `category_id` matches, filtered by `transaction_date` prefix. This is a fourth data source (transactions, filtered/aggregated in the browser) alongside `income`, `monthly_cash_flows`, and `expenses` — none of these four are reconciled with each other. A transaction categorized as a Debit against "Groceries" does not update the `expenses` table, `monthly_cash_flows.household_expenses`, or anything in `income` — it only shows up in `BudgetPlanner.tsx`'s client-computed "spent this month" figure.

## Database Schema

`income` table (backend/db.py): `id`, `name`, `category_id` (FK → categories, NOT NULL), `amount` (NOT NULL), `frequency` (default 'Monthly'), `growth_rate` (default 0.0), `taxable` (default 1), `source`, `metadata_json`.

`monthly_cash_flows` table: `id`, `month` (NOT NULL, UNIQUE), `net_salary`, `other_income`, `household_expenses`, `emi`, `insurance_premium`, `investments`, `one_time_expenses` (all REAL, default 0.0), `notes`. Explicitly kept "for backward compatibility / historical logs" per the code comment in `init_db()`.

`categories` seed rows for `entity_type='Income'`: Salary, Bonus, Rental, Dividend, Interest (all with `fields_definition = NULL`, i.e. no category-specific custom fields defined for any income category today).

`categories.monthly_budget` (REAL, default 0.0, migration-added column on the shared `categories` table, not a new table) — set per Expense-type category via `BudgetPlanner.tsx`, read back the same way. "Actual spent" for a month is not stored anywhere; it's computed client-side from `transactions` on each page load.

## Business Rules

- `target_savings_rate` (financial_rules, category "Cash Flow", default 35.0%) — "checked on the dashboard indicator" per its description; consumed as a threshold comparison in the cash-flow UI, not in `decision_engine.py`.
- **Savings rate** is the share of income not spent: (left over + invested) ÷ income, where left over = income − household and one-off spending − EMIs − premiums − investments. Money invested counts as saved (as the rule's Knowledge article defines it), so investing more never lowers it; EMIs and premiums are commitments and don't count. The page (`CashFlowPlanning.tsx`) and the simulator compute it the same way (`test_cash_flow_simulate.py`). Before October 2026 both excluded investments, so a higher SIP showed as a lower savings rate.
- Hardcoded bands in `CashFlowPlanning.tsx` (not DB-configurable): savings rate "On target" at or above `target_savings_rate`, amber from 70% of it, red below; EMI share of income comfortable up to 30%, worth watching to 40%, heavy above. Cash in accounts is shown as months of spending plus EMIs, with no band (the Dashboard's emergency-fund card owns that judgement).
- `/api/calculations/cash-flow/simulate` hardcodes its own recommendation thresholds independently of the rules above: flags "debt burden ratio exceeds 40%" and "savings rate below 20%" as separate literal cutoffs baked directly into the endpoint's Python code (not the same 30/50 or 15/30 bands used by the dashboard meters, and not read from `financial_rules`).
- No enforcement or validation ties the `income` table's `growth_rate`/`taxable` fields into any downstream calculation that was found — they are captured but currently inert.

## Configuration

- DB-editable via `/api/rules`: `target_savings_rate` only.
- Hardcoded (per hardcoded_vs_dynamic.md and confirmed in `CashFlowPlanning.tsx`/main.py): the five ratio-health color bands, and the 40%/20% cutoffs inside `/api/calculations/cash-flow/simulate`'s recommendation text logic.
- The `income` table's category set (Salary/Bonus/Rental/Dividend/Interest) is DB-editable via `/api/metadata/categories` like any other entity_type, but has no category-specific `fields_definition` schemas defined today, so there are no configurable custom fields per income category yet.

## UI Structure

- `frontend/src/components/CashFlowPlanning.tsx` — the actual cash-flow domain UI: monthly log table/history (backed by `monthly_cash_flows`), ratio health meters, an auto-fill mechanism that pulls current EMIs from `liabilities`, rental income from Property-category `assets`, and goal contributions from `goals` into a new monthly log entry, plus the salary/bonus/EMI/expense scenario simulator.
- `frontend/src/components/EntityGrid.tsx` / `DynamicForm.tsx` — generic entity grid/form covering the separate `income` table; the `'income' || 'expenses'` branch in DynamicForm sets standard fields `amount` (number), `frequency` (text), `status` (select) — note `status` is not an actual column on the `income` table DDL, so it is captured into `metadata_json` via `serialize_entity_payload`'s fallback, same as any unrecognized field.
- There is no dedicated "Income" nav item/page distinct from the generic entity grid — a user manages `income` rows the same way they'd manage `assets` or `expenses`, while cash-flow analysis lives entirely in the separately-named `CashFlowPlanning.tsx`.
- `frontend/src/components/BudgetPlanner.tsx` — its own nav tab (`budget-planner`), separate from both of the above: month selector, a per-Expense-category budget input (persisted to `categories.monthly_budget`), and a computed "spent so far" figure per category for the selected month.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/income` (and `/income/{id}`) — generic CRUD, `income` is in the shared hardcoded allow-list alongside accounts/assets/liabilities/expenses/goals/transactions.
- `GET /api/init` — returns `income` (joined with `category_name`) as part of the dashboard payload; also separately returns `cash_flows` (the full `monthly_cash_flows` log, `ORDER BY month DESC`) — both arrays are present side by side in the same response, reinforcing that they are parallel, not merged.
- `GET /api/cash-flows` — returns `monthly_cash_flows` rows directly.
- `POST /api/cash-flows` (body: `CashFlowSchema` — month + the seven aggregate fields + notes) — upserts (updates if a row for that `month` exists, else inserts).
- `DELETE /api/cash-flows/{cf_id}` — deletes a monthly log row.
- `POST /api/calculations/cash-flow/simulate` (body: `CashFlowSimulationRequest` — current month's seven figures plus a set of optional adjustment deltas: `salary_change_pct`, `salary_change_abs`, `one_time_bonus`, `new_emi`, `emi_reduction`, `additional_investment`, `expense_reduction_pct`, `expense_reduction_abs`) — returns current vs. simulated income/expenses/surplus/savings-rate/debt-ratio/investment-rate/expense-ratio, a generated impact-summary string, and a list of recommendation strings.
- `BudgetPlanner.tsx` has no dedicated budget-specific routes — it reads/writes `categories.monthly_budget` via the existing `GET/PUT /api/metadata/categories` routes (the generic metadata endpoint, not a new one), and fetches `GET /api/entities/transactions` client-side to compute actual spend by filtering/summing in the browser.

## AI Responsibilities

None exist yet. The cash-flow simulator's "impact summary" and "recommended actions" text is template-based string concatenation in Python (`main.py`'s `simulate_cash_flow`), not an LLM call — there is no AI/LLM integration anywhere in the Income domain today.

## Reports

- No dedicated Income CSV/Excel export exists in Reports.tsx's export center (Accounts, Loans, Investments, Insurance are covered; Income and the `monthly_cash_flows` log are not).
- The `monthly_cash_flows` history table within `CashFlowPlanning.tsx` itself functions as a manually-browsable report of past months, but there is no export/download button for it.
- Income entries appear in the Snapshot feature indirectly only insofar as they're part of `/api/init`'s payload, but `Snapshot.tsx`'s frozen `snapshot_data` blob only captures `accounts`/`assets`/`liabilities`/`goals` — it does not include `income` or `monthly_cash_flows` rows.

## Future Enhancements

NOT YET BUILT — reasonable next steps:
- Reconcile the `income` table, `monthly_cash_flows` table, and `BudgetPlanner.tsx`'s transaction-derived spend figures into one consistent model — today there are four overlapping-but-disconnected ways to represent "money in/out for a period," which is more fragmentation than the domain needs.
- Server-side (not client-computed) actual-spend aggregation for Budget Planning, so it's consistent across screens and doesn't require re-fetching/re-summing all transactions in the browser on every load.
- Reconcile the `income` table and `monthly_cash_flows` table into one model, or explicitly derive one from the other (e.g. auto-sum active `income` rows into a suggested `net_salary`/`other_income` figure for the current month's log).
- Apply the stored `growth_rate` on `income` rows to actual multi-year income projections (currently captured but unused).
- Move the hardcoded 40%/20% thresholds in `/api/calculations/cash-flow/simulate` into `financial_rules` so they're consistent with (or configurably distinct from) the dashboard meter bands.
- Payroll/salary-slip import or parsing to reduce manual monthly data entry.
- Basic tax/TDS estimation using the `taxable` flag already present on `income` rows.
