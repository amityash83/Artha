# Investments Domain

## Purpose

Investments is one of the domains Artha's "Financial Intelligence Layer" reasons over, not a standalone accounting ledger. It gives the user a single register of every growth asset they hold — Mutual Funds, Stocks, Gold, EPF, PPF, NPS, Fixed Deposits, Bonds — with enough structure (purchase lots, cost basis, category-specific fields) to answer "what do I own, what did it cost, what is it worth now" without requiring a live market data feed. It exists so downstream features (net worth, goal funding, simulations, recommendations) can treat all investment types uniformly.

## Scope

- CRUD for investment holdings as rows in the generic `assets` table, discriminated by `category_id` (Mutual Fund, Stock, Gold, EPF, PPF, NPS, Fixed Deposit, Bond).
- Purchase-lot tracking (one row per buy transaction) for Stock and Mutual Fund categories only, via the `holding_lots` satellite table.
- Automatic recomputation of aggregate `quantity` and `cost_price` (weighted average) on an asset whenever its lots change.
- Category-specific custom fields via `categories.fields_definition` (e.g. ticker/scheme code for Stock/Mutual Fund, duration for Fixed Deposit, coupon rate for Bond) folded into `metadata_json`.
- Linking an investment asset to a `goal` via `goal_holdings` (allocation-weighted), which feeds goal progress (`current_amount`) elsewhere.
- Linking an investment asset to a `portfolio` via `portfolio_holdings`.
- Recording Buy/Sell/Investment/Redemption transactions against an asset, which adjust `assets.current_value` through `adjust_double_entry_balances()`.
- Surfacing aggregate investment value (`total_investments`) on the dashboard and in simulations.

## Out of Scope

- No live NAV/stock price feed integration — `current_value` and `market_value` are user-entered/updated, not fetched from any market data API.
- No per-holding XIRR display in the UI. `calculate_xirr()` exists in `backend/calculations.py` but is not called from anywhere in `main.py` or any frontend component — it is dead code today.
- No brokerage/demat statement import or reconciliation.
- No asset allocation or portfolio diversification analytics (e.g. equity vs debt split, sector exposure), despite `portfolios`/`portfolio_holdings` tables existing.
- No automatic SIP scheduling or reminders (SIP contributions are represented only implicitly via goals' `monthly_contribution`).
- No capital-gains/holding-period tax computation on redemption.
- Lot tracking (`holding_lots`) applies only to Stock and Mutual Fund; EPF/PPF/NPS/Gold/Fixed Deposit/Bond are single-row assets with no purchase-lot history.

## Business Objectives

- Give a single, accurate point-in-time view of total invested wealth across all instrument types, feeding net worth and the "total_investments" dashboard aggregate.
- Support goal-based investing by letting a holding be attributed (fully or partially, via `allocation_weight`) to one or more goals so goal progress reflects real assets.
- Provide the cost-basis data (weighted average cost from lots, or `cost_price` for single-row assets) needed for future return/gain calculations.
- Keep data entry category-aware — a Stock and a PPF account collect different fields — without needing separate tables or code paths per instrument type.

## Data Model

Conceptually, an "Investment" is not its own entity — it is a row in the generic `assets` table whose `category_id` points to one of the seed categories with `entity_type = 'Asset'`: Mutual Fund, Stock, Gold, EPF, PPF, NPS, Fixed Deposit, Bond. There is no per-instrument-type table.

Two tiers of extensibility apply:
- **Category-defined custom fields** (`categories.fields_definition`, a JSON schema): e.g. Mutual Fund/Stock carry a `ticker` field; Fixed Deposit carries `duration_months`; Bond carries `coupon_rate`. Values live in the asset's `metadata_json` blob (any payload key that isn't a fixed `assets` column is automatically folded in by `serialize_entity_payload()`).
- **Satellite table for Stock/Mutual Fund only**: `holding_lots`, one row per purchase lot (date, quantity, price per unit, notes). When lots are added/edited/removed, `recompute_holding_aggregates()` recalculates `assets.quantity` (sum of lot quantities) and `assets.cost_price` (weighted-average price) as derived/cached values — they are not independently editable once lots exist.

EPF, PPF, NPS, Gold, Fixed Deposit, and Bond do **not** get a satellite table or lot tracking — they are plain `assets` rows with category-specific `fields_definition` fields folded into `metadata_json`, and their `quantity`/`cost_price` are entered directly rather than derived.

Cross-domain links: an asset can be tied to one or more `goals` via `goal_holdings` (with an `allocation_weight`), and to a `portfolio` via `portfolio_holdings`.

## Database Schema

`assets` table (shared across all asset categories including Property/Insurance, relevant columns for Investments):
- `id`, `name`, `category_id` (FK → `categories`), `institution_id` (FK → `institutions`)
- `purchase_date`, `current_value`, `quantity`, `cost_price`, `market_value`
- `expected_return`, `compounding` (default `Monthly`), `liquidity` (default `High`), `tax_category`, `risk_level` (default `Medium`)
- `linked_account_id` (FK → `accounts`), `metadata_json` (catch-all for category-specific fields)

`holding_lots` (satellite, 1:many with `assets`, Stock/Mutual Fund only):
- `id`, `asset_id` (FK → `assets`, `ON DELETE CASCADE`), `purchase_date`, `quantity`, `price_per_unit`, `notes`
- Indexed on `asset_id`.

`categories` seed rows relevant here (`entity_type = 'Asset'`): `Mutual Fund` (`ticker`), `Stock` (`ticker`), `Gold` (no extra fields), `EPF` (none), `PPF` (none), `NPS` (none), `Fixed Deposit` (`duration_months`), `Bond` (`coupon_rate`).

`goal_holdings`: `goal_id`, `asset_id`, `allocation_weight` (default 1.0) — composite PK.
`portfolio_holdings`: `portfolio_id`, `asset_id` — composite PK.

Legacy: a one-way migration in `init_db()` promotes any pre-existing `investments` table into `assets` rows (category resolved/created from the old `type` column) and renames the old table to `investments_old`. A separate backfill step (`init_db()` section H) creates one synthetic "opening lot" per existing Stock/Mutual Fund asset from its `quantity`/`cost_price`, so older databases get lot history without manual re-entry.

## Business Rules

- No investment-specific hardcoded thresholds exist in `decision_engine.py` today; investments are not directly gated by a rule like the loan ROI or emergency fund checks.
- Indirect interaction: the `no_villa_equity` rule (`financial_rules`, default enabled, value `1.0`) records a policy ("Do not invest Villa funds into equity markets") but it is data-only — `decision_engine.py` does not currently enforce or check it against actual asset categories.
- Investment values feed the `min_emergency_fund` (₹15,00,000 fallback) and `debt_free_liquidity_target` (₹30,00,000 fallback) checks only indirectly, through `total_liquid` (accounts), not through `assets`.
- `compounding` defaults to `Monthly` per asset row but this is just a stored field; the compounding assumption in most calculators (`calculations.py`) is a separate hardcoded monthly-compounding convention in the projection/EMI math.

## Configuration

- DB-editable via `/api/rules` (see `financial_rules` table): none of the eight seeded rules are Investments-specific; the closest are the goal-related `no_villa_equity` flag and the generic liquidity/emergency-fund targets, which are cross-domain.
- Hardcoded (per `hardcoded_vs_dynamic.md`): Future Wealth Sliders bounds (ROI 5%–25%, monthly SIP ₹0–₹2,00,000, horizon 5–35 years) used in projection sandboxes; monthly compounding assumption (12 intervals/year) in projection math.
- Category `fields_definition` (ticker, duration_months, coupon_rate, etc.) is stored in the DB (`categories` table) and is technically editable via the categories admin UI/API, but the specific fields present for the default categories are seeded in code (`default_categories` in `backend/db.py`) and only re-applied on fresh installs or via the guarded migration block that clears stale field defs.

## UI Structure

- `src/components/EntityGrid.tsx` — generic entity list/table for `assets` (and other entity types). `CATEGORY_COLUMNS` adds category-specific columns when a single category is selected: `Stock` → Ticker + Quantity, `Mutual Fund` → Scheme Code + Units. `dispatchSatelliteData()` handles the Stock/Mutual Fund branch: diffs submitted `holding_lots` against existing ones fetched from `/api/assets/{id}/holdings`, issuing PUT/POST/DELETE per lot as needed.
- `src/components/DynamicForm.tsx` — `HOLDING_CATEGORIES = ['Stock', 'Mutual Fund']`; `isHolding` branch swaps the standard "current_value / invested_amount" fields for institution, acquisition date, current value, status, owner, and renders `<HoldingLotsEditor>` for lot entry instead of a single cost field.
- `src/components/HoldingLotsEditor.tsx` — sub-component for adding/editing/removing purchase lots (date, quantity, price per unit, notes); shows a live-computed total quantity and average cost/unit as the user edits, purely client-side (the authoritative weighted average is recomputed server-side on save).
- `src/components/Simulations.tsx` — no dedicated investment-growth scenario type exists; it references investments only via generic "increase_sip" and property-purchase scenarios in the wealth simulation sandbox, not per-holding.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/assets` — generic CRUD for all asset rows (Investments, Property, Insurance share this one handler; allowed-table list is hardcoded per route).
- `GET /api/assets/{id}/holdings` — list a Stock/Mutual Fund asset's purchase lots.
- `POST /api/assets/{id}/holdings` — create a lot (`{purchase_date, quantity, price_per_unit, notes}`); triggers `recompute_holding_aggregates()`.
- `PUT /api/holdings/{lot_id}` — update a lot; triggers recompute on the parent asset.
- `DELETE /api/holdings/{lot_id}` — remove a lot; triggers recompute on the parent asset.
- `GET /api/init` — dashboard bootstrap; for each asset row whose `category_name` is `Stock` or `Mutual Fund`, attaches `holding_lots: [...]` (ordered by `purchase_date`) onto the asset object in the response.

## AI Responsibilities

None. No AI/LLM feature exists for Investments (or any domain) in the current codebase — no model calls, no AI-generated insights or suggestions. All recommendations are deterministic rule checks in `decision_engine.py`.

## Reports

- `src/components/Reports.tsx`: `exportInvestmentsCSV()` exports all rows from `data.assets` (name, category, current value, invested amount) to CSV — note this is not filtered to exclude Property/Insurance, so it currently includes every asset category, not strictly "investments" in the narrow sense.
- The markdown report (`exportMarkdownReport()`) includes an "Assets Registry" section listing every asset's name, category, current value, and invested amount.
- No per-holding XIRR, CAGR, or realized/unrealized gain figures appear in any report — only current value and invested amount.

## Future Enhancements

The following are NOT YET BUILT — reasonable roadmap ideas only:
- Live NAV/stock price feed integration (would populate `market_value` automatically instead of manual entry).
- Per-holding XIRR display in the UI, wiring up the already-implemented but currently unused `calculate_xirr()` in `backend/calculations.py`.
- Asset allocation / diversification breakdown using the existing but unused `portfolios`/`portfolio_holdings` tables.
- Realized capital gains and holding-period (short/long-term) tax computation on Sell/Redemption transactions.
- A dedicated "Investments" CSV/report export that actually excludes Property and Insurance categories.
