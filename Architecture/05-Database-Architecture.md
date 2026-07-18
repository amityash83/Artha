# Database Architecture

ER model, table strategy, reference data vs user data vs calculated
data, migrations, indexing.

---

> Full schema inventory grounded against `backend/db.py` (1064 lines) as
> of 2026-07. See `04-Financial-Data-Model.md` for the conceptual/entity
> view; this doc is the physical schema.

## Table Strategy

Artha uses a **metadata-driven generic ledger** strategy, not a table
per financial instrument:

- `assets` holds every investment, property, and insurance policy;
  `liabilities` holds every loan and credit card. A `category_id` FK
  into `categories` is the only discriminator.
- `categories.fields_definition` (JSON) lets a category declare extra
  fields without a schema change; values fold into that row's
  `metadata_json` blob.
- A dedicated **satellite table** (1:1, via the entity's PK as its own
  PK) is added only when a category's shape genuinely can't fit the
  shared columns: `credit_card_details` (Credit Card liabilities),
  `insurance_details` (Insurance assets, carries the `policy_type`
  sub-discriminator). A 1:many satellite (`holding_lots`) exists for
  Stock/Mutual Fund purchase-lot tracking.
- Many-to-many relationships get a plain junction table:
  `goal_holdings` (goal ↔ asset, weighted), `portfolio_holdings`
  (portfolio ↔ asset).

**When to add a new table** (per `00-Project-Constitution.md`): default
to a new `categories` row + `fields_definition` first. Add a satellite
table only when fields don't fit the shared shape at all (the Credit
Card / Insurance / Holdings precedent). Do not add a table per financial
product just because a new instrument type is introduced.

## Full Table Inventory

**Metadata/reference:**
- `categories` — `id`, `entity_type`, `name` (UNIQUE), `fields_definition`,
  `monthly_budget` (migration-added, default 0.0 — used by budget
  planning, see `Domains/Income.md`).
- `institutions` — `id`, `name` (UNIQUE), `type` (migration-added,
  default `'Bank'`).
- `financial_rules` — `id`, `rule_key` (UNIQUE), `rule_name`,
  `description`, `value`, `category` (migration-added, default
  `'General'`), `is_enabled`.
- `people` — `id`, `name`, `role` CHECK IN (`Primary Owner`, `Spouse`,
  `Dependent`).
- `relationships` — `id`, `person_id` → `people`, `institution_id` →
  `institutions`, `customer_identifier`, UNIQUE(person_id,
  institution_id, customer_identifier). Created but not seeded or
  migrated into by anything in `db.py` — verify it's actually read/
  written by a route before relying on it.

**Core ledgers:**
- `accounts` — `id`, `name`, `institution_id` (NOT NULL FK), `owner_id`
  (NOT NULL FK → `people`), `status` CHECK IN (`Active`,`Closed`),
  `currency` (default `'INR'`), UNIQUE(name, institution_id, owner_id).
  **No balance column** — see Calculated Fields below.
- `assets` — `id`, `name`, `category_id` (NOT NULL FK), `institution_id`,
  `purchase_date`, `current_value`, `quantity` (default 1.0),
  `cost_price`, `market_value`, `expected_return`, `compounding`
  (default `'Monthly'`), `liquidity` (default `'High'`), `tax_category`,
  `risk_level` (default `'Medium'`), `linked_account_id` → `accounts`,
  `metadata_json`.
- `liabilities` — `id`, `name`, `category_id` (NOT NULL FK),
  `lender_institution_id`, `interest_rate`, `emi`, `outstanding`,
  `tenure_months`, `compounding` (default `'Monthly'`), `linked_asset_id`
  → `assets`, `tax_benefit` (default `'None'`), `metadata_json`,
  `liability_kind` (migration-added, default `'loan'`;
  `'revolving_credit'` for Credit Cards).
- `income` — `id`, `name`, `category_id` (NOT NULL FK), `amount`,
  `frequency` (default `'Monthly'`), `growth_rate`, `taxable` (default
  1), `source`, `metadata_json`.
- `expenses` — `id`, `name`, `category_id` (NOT NULL FK), `amount`,
  `frequency` (default `'Monthly'`), `linked_liability_id` →
  `liabilities`, `parent_category_id` → `expenses` (self-referential,
  nested categories), `metadata_json`.
- `goals` — `id`, `name` (UNIQUE), `target_amount`, `current_amount`,
  `monthly_contribution`, `target_date`, `priority` (default
  `'Medium'`), `expected_return`, `inflation` (default 6.0),
  `funding_sources_json`.
- `transactions` — `id`, `source_ref_type` CHECK IN (`Account`,`Asset`,
  `None`), `source_ref_id`, `dest_ref_type` CHECK IN (`Account`,`Asset`,
  `None`), `dest_ref_id`, `type` CHECK IN (`Credit`,`Debit`,`Transfer`,
  `Buy`,`Sell`,`Investment`,`Redemption`), `amount` CHECK (> 0.0),
  `transaction_date` (NOT NULL), `notes`, `linked_goal_id` → `goals`.
  This is a genuine double-entry model: every transaction has a
  polymorphic source and destination (each either an Account, an Asset,
  or None), not a single `account_id` + a loosely-typed "related entity."

**Satellite tables:**
- `credit_card_details` — `liability_id` (PK, FK → `liabilities`, ON
  DELETE CASCADE), `credit_limit`, `statement_balance`, `statement_date`,
  `due_date`, `annual_fee`, `reward_points` (placeholder, not computed
  against), `point_value` (default 0.25).
- `insurance_details` — `asset_id` (PK, FK → `assets`, ON DELETE
  CASCADE), `policy_type` (default `'Life'`), `policy_number`,
  `premium`, `frequency` (default `'Yearly'`), `renewal_date`,
  `sum_assured`, `surrender_value`, `sum_insured`, `claims_made`,
  `claims_amount`, `idv`, `vehicle_registration`.
- `holding_lots` — `id`, `asset_id` (NOT NULL FK → `assets`, ON DELETE
  CASCADE), `purchase_date` (NOT NULL), `quantity` (NOT NULL),
  `price_per_unit` (NOT NULL), `notes`. Indexed on `asset_id`.

**Junction tables:**
- `portfolios` — `id`, `name`, `owner_id` (NOT NULL FK → `people`),
  UNIQUE(name, owner_id).
- `portfolio_holdings` — composite PK (`portfolio_id`, `asset_id`), both
  NOT NULL FKs.
- `goal_holdings` — composite PK (`goal_id`, `asset_id`), both NOT NULL
  FKs, plus `allocation_weight` (default 1.0).

**Legacy/backward-compatibility (per explicit code comment):**
- `snapshots` — `id`, `month` (UNIQUE), `net_worth`, `liquid_funds`,
  `total_assets`, `total_liabilities`, `snapshot_data`.
- `monthly_cash_flows` — `id`, `month` (UNIQUE), `net_salary`,
  `other_income`, `household_expenses`, `emi`, `insurance_premium`,
  `investments`, `one_time_expenses`, `notes`.

**Dead/unreachable (see `04-Financial-Data-Model.md` for the "why"):**
`reward_programs`, `reward_rules`, `reward_partners`, `reward_ledger`,
`reward_redemptions` — `reward_programs.product_id` references a
`financial_products` table that does not exist anywhere in `db.py`.

## Calculated Fields — Read, Not Stored

`accounts` carries no balance column at all. `/api/init`'s accounts
query computes it inline per row:

```sql
SELECT a.*, i.name as institution_name,
  (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t
   WHERE t.dest_ref_type = 'Account' AND t.dest_ref_id = a.id)
  -
  (SELECT COALESCE(SUM(t.amount), 0.0) FROM transactions t
   WHERE t.source_ref_type = 'Account' AND t.source_ref_id = a.id)
  AS current_balance
FROM accounts a LEFT JOIN institutions i ON a.institution_id = i.id
```

By contrast, `assets.current_value` and `liabilities.outstanding` **are**
stored columns, directly mutated by `adjust_double_entry_balances()`
when a transaction of type `Investment`/`Redemption`/`Buy`/`Sell` (assets)
or `emi`/`prepayment` (liabilities) is created/updated/deleted. So the
two halves of the ledger use different consistency strategies for the
same underlying idea (asset holds a computed present value; account
holds a computed cash balance) — one is derived-on-read every time, the
other is mutated-on-write and stored. This asymmetry is intentional
(accounts change on every transaction and a running total would be
error-prone to keep in sync manually; assets/liabilities change less
often and their "current value" isn't purely transaction-derived — a
Stock's `current_value` also changes from market movement, which isn't a
transaction at all) but is worth knowing explicitly rather than assuming
both work the same way.

`holding_lots` similarly drives derived fields: `assets.quantity` and
`assets.cost_price` for Stock/Mutual Fund rows are recomputed
(sum of quantities; weighted-average price) whenever a lot is
added/edited/removed, and become effectively read-only on the asset row
itself once lots exist.

## Migrations

All migrations run inside `init_db()`, which executes on **every backend
startup** — so every migration must be idempotent (safe to run
repeatedly with no effect after the first successful run). The pattern,
consistently applied:

1. **Column-existence check migrations** (simplest, most common):
   `PRAGMA table_info(table)`, check if a column is present, `ALTER
   TABLE ... ADD COLUMN` if not. Used for `financial_rules.category`,
   `categories.monthly_budget`, `institutions.type`,
   `liabilities.liability_kind`.
2. **Rename-rebuild-copy-drop** (for a structural reshape of a table
   that already has data): rename the old table to `*_old` or `*_temp`,
   `CREATE TABLE` the new shape under the original name, copy rows
   across with any needed transformation, then drop the temp/old table.
   Used for the `accounts` and `transactions` restructures (to the
   normalized owner/double-entry shape) and the `goals` restructure (to
   add `target_date`).
3. **Legacy-table promotion** (for pre-metadata-driven per-domain
   tables): detect an old standalone table (`investments`, `properties`,
   `insurance`, `loans`, `credit_cards`), migrate each row into the
   generic `assets`/`liabilities` table with domain-specific fields
   folded into `metadata_json`, then rename the old table to `*_old`
   (kept, not dropped, except for the accounts/goals rebuilds above
   which do drop their intermediate table).
4. **Satellite-table backfill** (newest pattern): create the satellite
   table if missing, then for every base-table row in the matching
   category not yet present in the satellite table (`NOT IN (SELECT ...
   FROM satellite_table)`), parse its `metadata_json` and insert a
   corresponding satellite row. Used for `credit_card_details`,
   `insurance_details`, `holding_lots`.
5. **One-time sync guarded by "table is currently empty"** (weakest
   idempotency guarantee): `goal_holdings` is synced from
   `assets.metadata_json`'s legacy `goal_mapping` key only if
   `goal_holdings` has zero rows. This means if a user manually clears
   `goal_holdings`, the next startup will re-run the sync — usually
   harmless, but worth knowing this isn't a per-row idempotency check
   like pattern 4.

Every migration block is wrapped in its own `try/except`, so one
migration failing doesn't block the others or crash startup — failures
print a `[Migration Warning]` and the app continues.

`is_new_db` (computed once, `not os.path.exists(db_path)`, before the
connection opens) gates exactly one thing: whether `default_institutions`
gets seeded. `default_categories` and `default_rules` seed unconditionally
via `INSERT OR IGNORE` on every startup (harmless no-op after the first
run, since names are UNIQUE).

## Indexing

Only one explicit index exists: `idx_holding_lots_asset` on
`holding_lots(asset_id)`. Every other lookup relies on `PRIMARY KEY`/
`UNIQUE` constraints (which SQLite auto-indexes) or full-table scans —
acceptable at the scale of a single user's personal finance data, but
not something to assume scales to a large `transactions` table without
revisiting.

## Database Path Resolution

See `CLAUDE.md` for the full resolution order (`~/.financeos/
settings.json` → `FINANCE_DB_DIR` env var → dev fallback). Not
repeated here to avoid two sources of truth on the same operational
detail — `CLAUDE.md` is authoritative for this specific mechanism.
