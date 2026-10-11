# Properties Domain

## Purpose

Properties lets the user track real-estate holdings (a home, a rental flat, land) as part of the same "Financial Intelligence Layer" that covers every other asset class — not as a dedicated property-management tool. Its distinguishing job, beyond being just another asset row, is representing the real-world link between a property and the home loan that financed it, so net worth, EMI burden, and payoff simulations can reason about them together.

## Scope

- CRUD for property holdings as rows in the generic `assets` table under the `Property` category.
- Category-specific fields `rental_income` and `maintenance_expenses`, defined in `categories.fields_definition` and stored in the asset's `metadata_json`.
- A first-class cross-table link from a `Home Loan` liability to the property it financed, via `liabilities.linked_asset_id` (FK → `assets.id`).
- Link maintenance from both sides in the UI: the Property form has a "Loans on this property" checklist (any number of Home Loans, e.g. a home loan plus a top-up), and the Home Loan form picks one Property. Both land in the same `liabilities.linked_asset_id` column. From the Property side the links are written through `PUT /api/liabilities/{id}/property`, which changes only that column (`test_loan_property_link.py`).
- Aggregation of property value separately from other investments in dashboard summaries (`total_properties`) and in simulations (`sim_properties`).

## Out of Scope

- No rental income cash-flow ledger or history — `rental_income` is a single flat field on the asset's metadata, not a time series of actual rent receipts/transactions.
- No property document or lease management (no file/document attachment exists for any entity in the current schema).
- No property appreciation modeling or valuation history — `current_value` is a single user-entered number, updated manually over time, with no snapshot-over-time view specific to properties (only the generic monthly `snapshots` table exists, and it stores net-worth-level aggregates, not per-asset history).
- No support for one loan split across several properties: `linked_asset_id` is a single FK per liability row. (Several loans on one property is supported: each points at it.)
- No property tax, stamp duty, or capital-gains-on-sale tax computation.
- No maintenance-expense tracking beyond the single `maintenance_expenses` metadata field (no recurring expense ledger tied to the property, though the general-purpose `expenses` table exists independently).

## Business Objectives

- Represent real estate as part of total net worth alongside liquid funds and financial investments, while keeping it distinguishable in aggregates (`total_properties` vs `total_investments`).
- Make the Property↔Home Loan relationship explicit and queryable, so a user can see "this loan financed that asset" and simulations (e.g. prepayment) can reason about a property's associated debt.
- Capture rental income and maintenance cost as basic inputs, feeding cash-flow auto-fill elsewhere in the app (per `hardcoded_vs_dynamic.md`, rental properties' income dynamically feeds Cash Flow auto-fill inputs).

## Data Model

A Property is not a separate entity/table — it is a row in the generic `assets` table with `category_id` pointing at the `Property` category (`entity_type = 'Asset'`). This is the simplest of the three domains covered here: unlike Insurance and Stock/Mutual Fund, Property has **no satellite table** at all.

- Fixed columns (`current_value`, `purchase_date`, `institution_id`, etc.) are used as for any asset.
- The two Property-specific fields (`rental_income`, `maintenance_expenses`) are declared in `categories.fields_definition` for the `Property` category and fold into `assets.metadata_json` via `serialize_entity_payload()` — same mechanism as every other category-specific field.
- The only structural relationship unique to Property is the one owned by the **liabilities** side: `liabilities.linked_asset_id` is a nullable FK to `assets.id`, used exclusively (by convention) to point a `Home Loan` liability at the `Property` asset it financed. There is no `linked_liability_id` column on `assets` — the frontend's `linked_liability_id` form field is a UI-only convenience that, on save, is translated into a write against the liability's `linked_asset_id`, not a new asset column.

## Database Schema

`assets` table (shared, relevant columns for Properties):
- `id`, `name`, `category_id` (FK → `categories`, resolves to `Property`), `institution_id`
- `purchase_date`, `current_value`, `quantity` (unused/defaults to 1 for properties), `cost_price`, `market_value`
- `metadata_json` — holds `rental_income`, `maintenance_expenses`, and any other non-fixed fields submitted.

`liabilities` table (relevant column): `linked_asset_id INTEGER REFERENCES assets(id)` — set on the `Home Loan` liability row to point at its financed Property.

`categories` seed row: `('Asset', 'Property', fields_definition = [{"name": "rental_income", ...}, {"name": "maintenance_expenses", ...}])`.

Legacy: `init_db()` contains a one-way migration that promotes any pre-existing `properties` table into `assets` rows (mapping `purchase_price` → `cost_price`, and `rental_income`/`expenses`/`remarks` into `metadata_json`), renaming the old table to `properties_old`.

## Business Rules

- No Properties-specific hardcoded thresholds exist in `decision_engine.py`. Property values are not separately gated by any rule in the recommendation engine.
- Property value is excluded from `total_investments` and reported separately as `total_properties` in both `/api/init`'s summary block (`category_name == "Property"` filter) and `/api/simulations/run`'s scenario state — this is a structural/aggregation rule in `main.py`, not a `financial_rules` entry.
- The Home Loan attached to a property is subject to the same loan-level rules as any other liability (e.g. `high_interest_roi_threshold` = 7.5% for prepayment flags), but nothing in `decision_engine.py` currently special-cases a Home-Loan-with-linked-property differently from any other loan.

## Configuration

- Nothing Properties-specific is DB-configurable via `/api/rules` — no `financial_rules` row targets Properties.
- Hardcoded: the `Property` category name string used for filtering (`category_name == "Property"`) is hardcoded in `main.py` wherever properties are aggregated separately from other investments; the `rental_income`/`maintenance_expenses` field definitions are seeded in code (`default_categories` in `backend/db.py`), editable afterward only via direct category `fields_definition` edits.

## UI Structure

- `frontend/src/components/DynamicForm.tsx` — `isProperty` branch (`entityType === 'assets' && categoryName === 'Property'`) uses the standard asset fields (institution, current value, invested amount, acquisition date, status, owner) plus an extra `linked_liability_id: 'home_loan_select'` field. A code comment in the component explicitly documents that this is a form-only convenience field with no backing column on `assets` — `liabilities.linked_asset_id` is the single source of truth. The dropdown is populated from Home Loan liabilities that are either unlinked or already linked to this property (`initialData?.id`).
- `frontend/src/components/EntityGrid.tsx` — `CATEGORY_COLUMNS['Property']` adds a "Rental Income" column (key `rental_income`) to the assets grid when the Property category is selected. `dispatchSatelliteData()` contains the bidirectional link-writing logic: if a Property form submits `linked_liability_id`, it PUTs `{linked_asset_id: entityId}` to that liability; if a Home Loan form submits `linked_asset_id`, it PUTs `{linked_liability_id: entityId}` to that asset (note: this second PUT targets a nonexistent `assets.linked_liability_id` column — since `assets` has no such fixed column, it would fall into `metadata_json` as an extra field rather than establishing any real relationship, making the Home-Loan-side write effectively inert/cosmetic; the Property-side write to `liabilities.linked_asset_id` is the one that actually persists the relationship).

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/assets` — generic CRUD, shared with Investments and Insurance; Property rows are created/edited/deleted through this one handler with `category_id` set to the `Property` category.
- `PUT /api/liabilities/{id}/property` (`{asset_id}` or `{asset_id: null}`) — sets or clears only `liabilities.linked_asset_id`; the Property form uses it to link and unlink its loans. Not the generic `PUT /api/entities/liabilities/{id}`, which rebuilds `metadata_json` from the payload and so would wipe a loan's other stored fields on a partial save. The Home Loan form still sets `linked_asset_id` as part of its full save.
- No dedicated Property satellite endpoint exists (unlike `/api/assets/{id}/insurance-details` or `/api/assets/{id}/holdings`) because Property has no satellite table.

## AI Responsibilities

None. No AI/LLM feature exists for Properties (or any domain) in the current codebase.

## Reports

- No dedicated Properties export exists in `frontend/src/components/Reports.tsx`. Property assets are included only incidentally: `exportInvestmentsCSV()` iterates all of `data.assets` (not filtered by category), so a Property row would appear there with `rental_income`/`maintenance_expenses` omitted (the CSV only writes name, category, current value, invested amount).
- The markdown report's "Assets Registry" section similarly lists Property rows alongside every other asset type, with no property-specific fields (rental income, maintenance) surfaced.

## Future Enhancements

The following are NOT YET BUILT — reasonable roadmap ideas only:
- A rental income cash-flow ledger (actual rent receipts over time) instead of the single flat `rental_income` field.
- Property document/lease attachment and management.
- A dedicated Properties report/CSV export that surfaces rental income, maintenance expenses, and linked loan details.
- Property valuation history / appreciation tracking over time, distinct from the generic net-worth `snapshots`.
- Support for multiple properties financed by a single loan, or a loan split across properties.

## What a property cost (October 2026)

- `property_costs` (one row per cost: date, kind, amount, note) with kinds in `main.PROPERTY_COST_KINDS`, each marked as counting towards the **cost for tax** (purchase price, stamp duty and registration, legal/brokerage/buying costs, improvements) or only towards the **total paid** (maintenance and repairs, loan fees, interest paid before tracking, other). Loan interest isn't entered: it's the `Interest` ledger rows of every loan linked to the property (`liabilities.linked_asset_id`), including closed or transferred ones.
- `property_cost_summary()` / `GET /api/assets/{id}/property-costs`: value today, cost for tax and the gain on it, total paid, rent less expenses from the rental ledger, and the overall gain. With no purchase entry it falls back to the property's `invested_amount`, saying so. Interest is not part of the tax cost (only arguably, when never deducted; the UI says to check with a CA). `test_property_costs_and_transfer.py`.
- **Balance transfer** (`POST /api/liabilities/{id}/transfer`): creates the new loan (same property, owner, type, use, EMI settings; new bank, rate, EMI) and records the new loan paying off the old as one loan-to-loan `Transfer` row (liability -> liability pays the old down and raises the new, by the ledger's direction rule). The old loan is marked Closed with `transferred_to`; fees go on the property's costs as a loan fee. The Ledger shows that row as "Balance transfer" and doesn't edit it (its account-transfer form would corrupt both loans); deleting it undoes both balances.
