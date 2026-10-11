# Banking Domain

## Purpose

Banking is the "cash layer" of Artha's Financial Intelligence Layer: it tracks liquid holdings (savings, current, demat, retirement accounts) and the transaction ledger that moves money between them and every other domain (assets, liabilities, income, expenses, goals). Artha does not aggregate live bank feeds — it is not a bank-account-of-record — but it is the substrate every other domain's balance math (net worth, emergency fund checks, prepayment recommendations) is computed from.

## Scope

- Manual CRUD for bank/demat/retirement accounts via the generic entity API (`accounts` table).
- A double-entry transaction ledger (`transactions` table) recording Credit, Debit, Transfer, Buy, Sell, EMI, and Prepayment postings between accounts, assets, and liabilities.
- Account balances are **derived, not stored** — `current_balance` is computed live as `SUM(credits to this account) - SUM(debits from this account)` from the transactions table, for every read (`/api/init`, `/api/entities/accounts`).
- Institution metadata (`institutions` table: HDFC Bank, ICICI Bank, SBI, Groww, Zerodha, etc., with a `type` column) and person/ownership metadata (`people` table: Primary Owner / Spouse / Dependent, referenced by `accounts.owner_id`).
- Bulk account balance sync via MMex (Money Manager Ex) CSV import.
- Monthly balance archiving via the Snapshot feature (freezes a point-in-time net worth picture, not specific to banking but includes account balances).

## Out of Scope

- No live bank API / account-aggregator integration (no Plaid/Yodlee/AA-framework equivalent) — everything is manual entry or CSV import.
- No PDF/OFX statement parsing: statement import reads CSV and Excel .xlsx only (see Statement import below). Old .xls files are refused with a "save as .xlsx or CSV" message, since that would need the extra xlrd dependency.
- No multi-currency conversion logic — `accounts.currency` is stored (default `INR`) but there is no FX rate engine; cross-currency accounts are not converted for net worth aggregation.
- Recurring posting exists only for loan EMIs (auto EMI, see Loans.md); salary and other credits are entered by hand or imported from a statement.
- No account-level access control/multi-user permissions — `people`/`owner_id` model ownership for reporting purposes only, not auth.

## Business Objectives

- Give an accurate, always-current liquid net worth figure without requiring the user to manually update balances after every transaction.
- Feed the Emergency Fund and Liquidity rules in `decision_engine.py`, which depend on total liquid balance across accounts.
- Provide an auditable transaction trail so every balance change (including asset purchases, EMI payments, prepayments) is traceable to a single ledger, rather than scattered ad hoc edits.
- Support gradual onboarding from an existing MMex installation (Artha's stated "system of record" predecessor) without forcing a full manual re-entry of balances.

## Data Model

Conceptually, Banking consists of:
- **Account** — a named holding at an institution, owned by a person, with a status (Active/Closed) and currency. It does not store its own balance; balance is a derived aggregate.
- **Transaction** — a single posting with a `type` (Credit, Debit, Transfer, Buy, Sell, EMI, Prepayment... normalized internally to `Credit`/`Debit`/`Transfer`/`Buy`/`Sell` plus `EMI`/`Prepayment` variants), a `source_ref` (type + id) and `dest_ref` (type + id) that can each point at an Account, Asset, Liability, or nothing (`None`). This is the mechanism that lets one ledger cover account-to-account transfers, account-to-asset investments, asset-to-account redemptions, and account-to-liability EMI/prepayments.
- **Institution** — shared lookup table (bank/broker/insurer name + type), referenced by `accounts.institution_id` (and separately by `assets.institution_id`, `liabilities.lender_institution_id`).
- **Person** — owner/spouse/dependent, referenced by `accounts.owner_id` and `portfolios.owner_id`.

This follows the metadata-driven-entities philosophy in CLAUDE.md: there is no separate "Savings Account" or "Demat Account" table — the distinction is a `categories` row (`entity_type='Account'`) referenced conceptually via account naming/category conventions, though note the current `accounts` table itself has **no `category_id` column** (unlike `assets`/`liabilities`/`income`/`expenses`) — Account categories ('Savings Account', 'Demat Account', 'Retirement Account') exist in the `categories` seed data but are not currently wired to a FK on `accounts`.

## Database Schema

`accounts` table (backend/db.py):
- `id`, `name`, `institution_id` (FK → institutions), `owner_id` (FK → people), `status` (CHECK: Active/Closed, default Active), `currency` (default INR), UNIQUE(name, institution_id, owner_id).
- No `current_balance`, `metadata_json`, `owner`, or `tags` columns in the current schema — an earlier schema version had these (see the accounts migration block in `init_db()`, which detects a legacy `current_balance`/missing-`owner_id` shape and rewrites the table), and some frontend components (see UI Structure) still reference `owner` and `current_balance` as if they were stored columns; `current_balance` is safely supplied by the API's derived-column SELECT, but a raw `owner` text field is not present in the current schema.

`transactions` table:
- `id`, `source_ref_type`/`source_ref_id`, `dest_ref_type`/`dest_ref_id` (each ref type CHECK: Account/Asset/None), `type` (CHECK: Credit/Debit/Transfer/Buy/Sell/Investment/Redemption), `amount` (CHECK > 0), `transaction_date`, `notes`, `linked_goal_id` (FK → goals, nullable).

Supporting tables: `institutions` (id, name, type), `people` (id, name, role CHECK: Primary Owner/Spouse/Dependent), `relationships` (person ↔ institution customer identifiers, currently unused by any route read in main.py).

## Business Rules

- No Banking-specific hardcoded thresholds exist in `decision_engine.py` beyond consuming the aggregate: total liquid balance (`total_liquid`, summed from all accounts' derived `current_balance`) feeds directly into the `min_emergency_fund` (rule_key, default ₹15,00,000) and `debt_free_liquidity_target` (rule_key, default ₹30,00,000) checks.
- `adjust_double_entry_balances()` in main.py encodes the actual "business rule" of how a transaction type touches other domains: `EMI`/`Prepayment` reduce the destination liability's `outstanding`; `Buy`/`Sell` adjust the destination/source asset's `current_value`; plain `Credit`/`Debit`/`Transfer` only affect derived account balances (no column to mutate, since balance is computed from the ledger itself).
- Transaction edits/deletes are "revert-then-reapply", not a diff: updating or deleting a transaction first reverses its old balance impact via `adjust_double_entry_balances(..., operation="revert")`, then (for updates) reapplies the new payload's impact.
- Initial account balance at creation time is implemented as a synthetic seed transaction (`type='Credit'`, notes `'Initial Balance'`/`'Initial balance registration'`), not a stored column — so the ledger, not a balance field, is the single source of truth from account creation onward.

## Configuration

- DB-configurable (via `/api/rules`, `financial_rules` table): `min_emergency_fund`, `debt_free_liquidity_target` — both consume account-derived liquid balances but are general Liquidity/Emergency Fund rules, not Banking-specific rows.
- Institutions and categories are DB-editable via `/api/metadata/institutions` and `/api/metadata/categories` (Reports.tsx "Categories" tab).
- Hardcoded: the double-entry balance-adjustment logic itself (`adjust_double_entry_balances`), the transaction `type` CHECK constraint list, and the account `status` CHECK constraint list — none of these are DB-driven, all require a code change to extend.
- Backend port (127.0.0.1:8000) is hardcoded per CLAUDE.md, not banking-specific but relevant since all account/transaction reads go through it.

## UI Structure

- `frontend/src/components/TransactionsLedger.tsx` — the transaction ledger UI: searchable/filterable/sortable/paginated table of all transactions, plus a modal form that posts to `/api/entities/transactions`. The form still submits the older flat shape (`account_id`, `related_entity_type`, `related_entity_id`, `category_id`) which `create_entity`/`update_entity` in main.py translate into the current `source_ref_type`/`source_ref_id`/`dest_ref_type`/`dest_ref_id` shape — the frontend and backend remain compatible through this translation layer, but a reader comparing the TypeScript `Transaction` interface directly against the `transactions` table DDL will see a mismatch that is intentional/handled, not a bug.
- `frontend/src/components/EntityGrid.tsx` — generic grid for `accounts` (and other entity types); `COMMON_COLUMNS['accounts']` renders Name, Institution (`institution_name`), Balance (`current_balance`), Owner (`owner`), Status. Note the `owner` column key has no backing column in the current `accounts` schema (see Database Schema) — it will render blank/undefined for accounts created under the current schema unless populated via legacy migration.
- `frontend/src/components/Snapshot.tsx` — monthly snapshot tool; pre-fills each account's current derived balance into an editable form, lets the user log a point-in-time correction, and on save both PUTs any changed value to `/api/entities/accounts/{id}` (as `current_balance` in the payload — accepted by `serialize_entity_payload` but silently has no column to land in since `accounts` has no `current_balance` column, so this PUT is effectively a no-op against derived-balance accounts) and POSTs a frozen `snapshot_data` blob to `/api/snapshots`.
- `frontend/src/components/Reports.tsx` "Data" tab hosts the MMex CSV import control that touches accounts (see API Contracts).

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/accounts` (and `/accounts/{id}`) — generic CRUD via `/api/entities/{entity_type}`, entity_type restricted to a hardcoded allow-list (`accounts, assets, liabilities, income, expenses, goals, transactions`) duplicated across three route functions in main.py. GET returns each account with a derived `current_balance` subquery. POST on `accounts` accepts an optional `current_balance` field which is popped off the payload and converted into a synthetic seed `Credit` transaction (not stored on the row).
- `GET/POST/PUT/DELETE /api/entities/transactions` (and `/transactions/{id}`) — POST/PUT accept either the normalized `source_ref_type/id` + `dest_ref_type/id` + `type` shape, or the legacy flat shape (`account_id`, `type`, `related_entity_type`, `related_entity_id`) which is translated server-side. Every write triggers `adjust_double_entry_balances`.
- `GET /api/init` — returns `accounts` (with derived `current_balance` and `institution_name` joined) as part of the full dashboard payload.
- `POST /api/import/mmex` (multipart file upload) — parses a MMex-exported accounts CSV (flexible column matching on name/balance/institution), upserts `institutions` and `accounts` rows (owner_id hardcoded to `1`), and posts a synthetic `Credit` transaction per account with a positive balance, tagged `'CSV Import Initial Balance'`.
  - **Known bug (noted 2026-10-11, not fixed):** re-importing the same CSV posts another `'CSV Import Initial Balance'` credit each time, so balances grow with every import. The account upsert matches by name, but the credit is always inserted. A negative balance (an overdrawn account) is also dropped, because only `val > 0.0` is posted. A fix would set the account's balance to the CSV figure: post the difference from the current derived balance, or replace the earlier import credit. The route also still hardcodes `owner_id = 1` instead of `default_owner_id()`.
- `POST /api/snapshots` (multipart form: `month`, `snapshot_data_str`) — persists a frozen JSON blob of all accounts/assets/liabilities/goals for later trend charting; not accounts-specific but always includes account balances at save time.

## AI Responsibilities

None exist yet. There is no AI/LLM integration anywhere in the Banking domain today — no natural-language transaction entry, no anomaly detection on the ledger, no auto-categorization of imported transactions. Artha.md describes a future "AI Copilot" vision, but nothing has been built for Banking specifically.

## Statement import

Parsing and matching live in `backend/statements.py`; the routes in `main.py` are:
- `POST /api/statements/preview` (multipart `file` + `account_id`): writes nothing.
- `POST /api/statements/import`: posts the chosen lines.
- `GET /api/statements/imports`: lists past imports.
- `DELETE /api/statements/imports/{id}`: undoes an import.

The screen is `frontend/src/components/StatementImport.tsx`, opened from the Transactions Ledger.

- **Reading the file:**
  - CSV (delimiter sniffed; utf-8 / cp1252) or .xlsx (openpyxl, first sheet). The file is capped at 5 MB and 5,000 lines.
  - The header row is found by column names, not by bank. It needs a date, a description, and either withdrawal and deposit columns or an amount column (with a Dr/Cr column, a sign, or a Cr/Dr suffix). Covers the HDFC, SBI, ICICI, Axis and Kotak layouts.
  - Rows without a date and an amount (titles, opening balance, footers) are skipped and counted.
  - Dates are read day first, unless the file's numeric dates can only be month first.
- **Matching:** each line is checked against the account's existing entries, by the same direction and amount.
  - Same day: "already in Artha".
  - Within 3 days: "probably already in Artha", e.g. an EMI posted automatically on its due day and debited the next.
  - Exact matches are paired first, and each entry matches at most one line.
  - Matched lines start unticked.
- **Suggestions:**
  - An outgoing amount within ₹1 of a loan's EMI goes to that loan.
  - A card-bill narration ("CC … AUTOPAY", "credit card") goes to the card it names, or to the only card.
  - Otherwise, the category last used on this account for the same payee. The payee is the first meaningful word of the narration, after dropping UPI/NEFT/IMPS-style noise.
- **Posting:** lines become ordinary ledger entries, shaped by `statements.entry_shape`:
  - Debit or Credit (with an optional category);
  - Transfer to or from another account;
  - EMI to a loan, or Prepayment to a card (which pays it down);
  - Investment or Redemption with an asset;
  - a loan paying out into the account (source Liability).
  - The narration (and reference) become the notes. `adjust_double_entry_balances` runs per line, so loans, cards and assets move as usual.
- **Undo:** `statement_imports` holds one row per import; `statement_import_entries` links it to the transactions it posted. Undo reverts and deletes the entries that still exist; entries already deleted by hand are skipped.
- **Balance check:** the preview returns the bank's closing balance (from the last dated line with a balance) and Artha's balance on that same day (`artha_balance_then`). The screen compares them, counting the ticked lines up to that date, and says by how much they differ.

## Reports

- Reports.tsx "Data" tab exposes a "Download Accounts CSV Export" button (client-side CSV generation from already-loaded `/api/init` data, not a dedicated backend endpoint).
- Dashboard.tsx's net worth trend line chart and asset-allocation doughnut (fed by `/api/snapshots`) implicitly include banking balances in the aggregate net worth figure, but there is no banking-specific chart or report.
- No PDF export, no scheduled/emailed statements, no per-account transaction history export.

## Future Enhancements

NOT YET BUILT — reasonable next steps:
- Live bank/account-aggregator integration (Account Aggregator framework in India, or Plaid-style feeds) to remove manual entry entirely.
- PDF/OFX statements, and remembering a per-bank column mapping when detection fails.
- Recurring/scheduled transaction templates (e.g. auto-post monthly salary credit).
- Multi-currency support with live FX conversion for net worth aggregation.
- Reconciling `EntityGrid`'s `owner` column and `Snapshot.tsx`'s balance-PUT against the current schema (either add the column back or update the frontend) to remove the current silent-no-op behavior.
