# Insurance Domain

## Purpose

Insurance tracks policy coverage (Life, Term, Health, Vehicle) as part of Artha's Financial Intelligence Layer, so protection cover and premium obligations are visible alongside the rest of the user's finances rather than managed in a separate app. Its core value beyond simple record-keeping is surfacing renewal deadlines and reserve-adequacy checks so premiums don't lapse and the user maintains a minimum self-insured buffer.

## Scope

- CRUD for insurance policies as rows in the generic `assets` table under the `Insurance` category.
- A dedicated `insurance_details` satellite table (1:1 with `assets`) carrying the `policy_type` discriminator (Life/Term/Health/Vehicle) and all policy-specific fields.
- Type-reactive data entry: the fields shown/collected change based on the selected `policy_type`.
- Premium renewal reminders: both a dashboard recommendation (`decision_engine.py`) and calendar events (`/api/calendar`) surface upcoming premium due dates, gated by a configurable alert window.
- An "Insurance Reserve" rule check comparing a dedicated Insurance goal's current amount against a configurable target.

## Out of Scope

- No claims workflow — `claims_made`/`claims_amount` on Health policies are simple counters/totals entered by the user, not a claim submission, status-tracking, or approval process.
- No document/policy PDF upload or storage.
- No premium payment history log — only a single `renewal_date` (next due date) and `frequency` are stored; there is no ledger of past premium payments actually made (distinct from the generic `transactions` table, which is not wired to insurance premiums).
- No automatic premium deduction/transaction creation when a premium comes due — the calendar/recommendation surfaces are reminders only, they don't create a transaction or adjust any balance.
- No underwriting, sum-assured adequacy modeling (e.g. "you need 10x income in term cover"), or premium-vs-market-rate comparison.

## Business Objectives

- Ensure the user never misses a premium payment by surfacing renewals inside a configurable alert window, both as a dashboard recommendation and as calendar events over the next 12 months.
- Maintain visibility into total insurance protection (sum assured/insured) as part of overall financial planning, distinct from investment assets.
- Enforce a minimum "Insurance Reserve" — a self-funded buffer for insurance-related contingencies — via a dedicated rule check against a goal.
- Support the four common policy types (Life, Term, Health, Vehicle) with the fields relevant to each, without needing separate tables per type.

## Data Model

An Insurance policy is a row in the generic `assets` table with `category_id` pointing at the `Insurance` category (`entity_type = 'Asset'`), plus a required 1:1 satellite row in `insurance_details` keyed by `asset_id`. Unlike Property, Insurance's type-specific data lives in real typed columns in a satellite table rather than in `metadata_json` — this was a deliberate promotion done in a schema redesign (backfill migration, `init_db()` section G) that moved data out of ad hoc JSON into first-class columns.

The `policy_type` column on `insurance_details` acts as a sub-discriminator within the `Insurance` category, driving which of the type-specific columns are semantically meaningful for a given row:
- **Life**: `sum_assured`, `surrender_value`
- **Term**: `sum_assured` only
- **Health**: `sum_insured`, `claims_made`, `claims_amount`
- **Vehicle**: `idv` (Insured Declared Value), `vehicle_registration`

All four types share `policy_number`, `premium`, `frequency`, and `renewal_date`. The `Insurance` category's `fields_definition` in `categories` is intentionally `NULL` — none of the policy fields are declared there anymore; they live entirely in `insurance_details` instead (a migration guard nulls out any stale pre-redesign `fields_definition` still containing `"policy_number"`).

## Database Schema

`assets` table (shared, relevant columns for Insurance): `id`, `name`, `category_id` (→ `Insurance` category), `institution_id` (the insurer), `current_value`, `metadata_json` (only for any field outside the fixed set, rare for Insurance since most fields now live in `insurance_details`).

`insurance_details` (satellite, 1:1 with `assets`, `ON DELETE CASCADE`):
- `asset_id` (PK, FK → `assets.id`)
- `policy_type` TEXT, default `'Life'`
- `policy_number` TEXT
- `premium` REAL, default 0.0
- `frequency` TEXT, default `'Yearly'`
- `renewal_date` TEXT
- `sum_assured` REAL, default 0.0
- `surrender_value` REAL, default 0.0
- `sum_insured` REAL, default 0.0
- `claims_made` INTEGER, default 0
- `claims_amount` REAL, default 0.0
- `idv` REAL, default 0.0
- `vehicle_registration` TEXT

Legacy: `init_db()` contains a one-way migration that promotes any pre-existing `insurance` table into `assets` rows (renamed `insurance_old`), and a separate backfill (section G) that populates `insurance_details` from the legacy `metadata_json` blob for any Insurance asset created before the satellite table existed, normalizing the old free-text `insurance_type` string into one of the four `policy_type` values via keyword matching (`'health'` → Health, `'term'` → Term, `'vehicle'`/`'motor'`/`'car'` → Vehicle, else Life).

## Business Rules

- **Insurance Reserve Target** (`insurance_reserve_target` rule, default ₹3,00,000 / 3 Lakhs, category `Insurance`, enabled by default): `decision_engine.py` looks for a goal whose name contains "insurance"; if found, compares that goal's `current_amount` against its own `target_amount`, otherwise falls back to comparing `0.0` against the rule's target value. Produces a "danger" recommendation if under target, "success" if met.
- **Insurance Renewal Alert Window** (`insurance_renewal_alert_days` rule, default 30 days, category `Insurance`, enabled by default): `decision_engine.py` joins every Insurance asset to its `insurance_details` row; for each policy with a `renewal_date`, if days-until-renewal falls between 0 and the configured window, emits a "danger" recommendation naming the insurer and premium amount due.
- Both rules fall back to their hardcoded defaults (₹3,00,000 and 30 days respectively) if the `financial_rules` row is absent or `is_enabled = 0`.

## Configuration

- DB-editable via `/api/rules` (`financial_rules` table): `insurance_reserve_target` (default 300000.0) and `insurance_renewal_alert_days` (default 30.0), both in the `Insurance` category, both enabled by default.
- Hardcoded fallbacks in `decision_engine.py`: ₹3,00,000 reserve target, 30-day renewal alert window — used only if the corresponding rule row is missing or disabled.
- The four `policy_type` values (Life/Term/Health/Vehicle) and their field mappings (`INSURANCE_TYPE_FIELDS`) are hardcoded in the frontend (`DynamicForm.tsx`), not DB-driven — adding a fifth policy type would require a code change, not just a data change.

## UI Structure

- `frontend/src/components/DynamicForm.tsx` — `isInsurance` branch (`entityType === 'assets' && categoryName === 'Insurance'`). Renders a `policy_type` selector plus institution, policy number, premium, frequency, renewal date, status, and owner; then dynamically appends the type-specific fields from `INSURANCE_TYPE_FIELDS[policyType]` (e.g. selecting Health adds `sum_insured`, `claims_made`, `claims_amount`; selecting Vehicle swaps in `idv` and `vehicle_registration` as text/number inputs respectively).
- `frontend/src/components/EntityGrid.tsx` — `CATEGORY_COLUMNS['Insurance']` adds "Policy Type" and "Premium" columns to the assets grid. `dispatchSatelliteData()` handles the Insurance branch: on save, PUTs the full `insurance_details` payload (`policy_type`, `policy_number`, `premium`, `frequency`, `renewal_date`, and all type-specific fields, sending zero/empty defaults for fields not relevant to the selected type) to `/api/assets/{id}/insurance-details`.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/assets` — generic CRUD for the parent asset row (name, institution, category, current_value), shared with Investments and Properties.
- `GET /api/assets/{id}/insurance-details` — fetch the satellite row for a policy; returns `null` if none exists yet.
- `PUT /api/assets/{id}/insurance-details` — upsert (checks for existing row by `asset_id`, then UPDATE or INSERT accordingly) with body `{policy_type, policy_number, premium, frequency, renewal_date, sum_assured, surrender_value, sum_insured, claims_made, claims_amount, idv, vehicle_registration}` (`InsuranceDetailsSchema`).
- `GET /api/init` — for each asset whose `category_name == "Insurance"`, attaches both an `insurance_details` object and flattens its keys (except `asset_id`) directly onto the asset object in the response.
- `GET /api/calendar` — includes an "Insurance" event block: joins `insurance_details` to institutions, and for each policy with a `renewal_date`, projects due dates over the next 12 months based on `frequency` (Monthly/Quarterly/Semi-Annually/Annually), emitting `{title, amount, type: "Insurance", date, details}` events.

## AI Responsibilities

None. No AI/LLM feature exists for Insurance (or any domain) in the current codebase. Renewal reminders and the reserve check are deterministic rule evaluations in `decision_engine.py`, not model-generated.

## Reports

- `frontend/src/components/Reports.tsx`: `exportInsuranceCSV()` filters `data.assets` to `category_name === 'Insurance'` and exports name, policy number, coverage, premium, frequency, nominee, and renewal date. Note this references `coverage` and `nominee` fields that are legacy `metadata_json` keys from the pre-redesign schema, not columns that exist on the current `insurance_details` table (`sum_assured`/`sum_insured` and no `nominee` field) — for policies created after the satellite-table redesign, these two CSV columns would be blank.
- The markdown report's "Assets Registry" section lists Insurance policies alongside every other asset type with only name, category, current value, and invested amount — no policy-specific fields.
- `/api/calendar`'s Insurance events are the primary way renewal/premium information reaches the user proactively, though that is a calendar feature rather than a formal report/export.

## Future Enhancements

The following are NOT YET BUILT — reasonable roadmap ideas only:
- Claims tracking workflow (submission, status, settlement) beyond the current simple `claims_made`/`claims_amount` counters on Health policies.
- Premium payment history log (a ledger of premiums actually paid over time, not just the next `renewal_date`).
- Policy document upload/attachment.
- Fixing `exportInsuranceCSV()` to reference the actual `insurance_details` columns (`sum_assured`/`sum_insured`) instead of the stale `coverage`/`nominee` metadata keys.
- Sum-assured adequacy guidance (e.g. flag under-insurance relative to income or dependents) as a new decision-engine rule.
