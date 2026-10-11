# Goals Domain

## Purpose

Goals translate a raw net-worth number into progress toward specific outcomes the user cares about (retirement, a child's education, a villa, an emergency fund) — the "financial intelligence" framing from Artha.md ("understand it, optimize it, act on it") rather than just displaying balances. A goal tracks a target, a funding mechanism (which assets count toward it), and a projected completion date computed from the user's actual contribution rate.

## Scope

- CRUD for goals via the generic entity API (`goals` table): name, target amount, monthly contribution, target date, priority, expected return, inflation assumption.
- Goal funding via `goal_holdings` — a many-to-many mapping of goals to specific assets with an `allocation_weight`, used to derive `current_amount` live from the linked assets' current values (rather than storing it directly).
- Automatic expected-completion projection (`calculate_goal_expected_completion` in calculations.py): gap, months remaining, expected completion date, and a Green/Yellow/Red status.
- Special-cased decision-engine checks that look for specific goals by name substring match: an "emergency" goal, an "insurance" goal, and a "villa" goal (see Business Rules — this is a real, fragile pattern in the current code).
- A `no_villa_equity` financial rule (rule_key, boolean-as-float) expressing a policy that villa-goal funds should not be invested in equity — currently a stored preference flag, not an enforced constraint (see Business Rules).

## Out of Scope

- No goal-vs-actual variance charting/analytics UI — the dashboard doesn't visualize how a goal's trajectory has drifted over time, only its current point-in-time gap/status.
- No enforcement of the `no_villa_equity` rule — it exists as a `financial_rules` row but nothing in `decision_engine.py` or the asset-allocation code actually checks it or blocks a villa-tagged asset from being an equity instrument.
- No generic goal-name-based extensibility — the "emergency"/"insurance"/"villa" special cases only work if the user names their goals containing those exact substrings; a goal named "Retirement" or "Kids Education" gets none of this special handling, just the generic expected-completion math.
- No goal templates/wizards (e.g. a guided "set up your emergency fund goal" flow) — goal creation is a raw form.
- No partial/percentage funding UI beyond the `allocation_weight` field on `goal_holdings`, which is not exposed anywhere in the frontend forms read.

## Business Objectives

- Give the user a concrete, date-stamped answer to "will I hit this goal, and when?" driven by their actual current contribution rate, not a generic calculator.
- Surface funding shortfalls early (Villa Fund shortfall recommendation, Emergency Fund deficit/building/healthy states) so the user can course-correct before a target date arrives.
- Let a goal be funded by more than one asset (via `goal_holdings` with weights) rather than forcing a rigid one-goal-one-account mapping.

## Data Model

- **Goal** — target_amount, current_amount (derived), monthly_contribution, target_date, priority, expected_return, inflation assumption, and a `funding_sources_json` blob for any non-column custom fields.
- **goal_holdings** — join table (goal_id, asset_id, allocation_weight, composite PK) that is the actual current funding mechanism: `current_amount` for a goal is computed as `SUM(asset.current_value * allocation_weight)` over its linked assets, not stored.
- A legacy `funding_sources_json` column still exists on `goals` and is parsed/exposed by the API, but the live current_amount calculation reads from `goal_holdings`, not from this JSON blob — these are two parallel funding representations from different schema eras coexisting in the same table.
- Linking an asset to a goal happens implicitly: `assets` CRUD accepts a `goal_mapping` field (goal name, not id) in its payload; `create_entity`/`update_entity` resolve that name to a goal id and upsert into `goal_holdings` with `allocation_weight=1.0`. There's a one-way legacy migration (`init_db()` step I) that backfills `goal_holdings` from any pre-existing `assets.metadata_json.goal_mapping` values.
- `transactions.linked_goal_id` (FK → goals) exists on the transactions table but is not populated or read by any route in main.py that was inspected — it appears to be a schema placeholder for a feature not yet wired up.

## Database Schema

`goals` table (backend/db.py): `id`, `name` (UNIQUE), `target_amount`, `current_amount` (DEFAULT 0.0 — legacy column, overridden by the derived SELECT everywhere the API reads goals), `monthly_contribution`, `target_date`, `priority` (default 'Medium'), `expected_return` (default 0.0), `inflation` (default 6.0), `funding_sources_json`.

`goal_holdings` table: `goal_id` (FK → goals), `asset_id` (FK → assets), `allocation_weight` (default 1.0), composite PRIMARY KEY(goal_id, asset_id).

`categories` has no `entity_type='Goal'` seed rows in the current `default_categories` list — goals do not currently have a `category_id` FK or category-driven custom fields the way assets/liabilities/income/expenses do.

## Business Rules

- `no_villa_equity` (financial_rules, category "Goals", default value 1.0/true): "Do not invest Villa funds into equity markets." Present in the rules table and editable via `/api/rules`, but not read or enforced by any code in `decision_engine.py` or `calculations.py` — a policy statement without a corresponding check.
- Name-substring goal matching in `decision_engine.py` (`generate_recommendations`): `next((g for g in goals if "emergency" in g["name"].lower()), None)`, same pattern for `"insurance"` and `"villa"`. This is a genuinely fragile implementation detail — goal identification is done by lowercase substring match on the free-text `name` field, not by a stable type/tag column, so renaming a goal (e.g. "Emergency Fund" → "Rainy Day Fund") silently drops it out of the Emergency Fund rule and the fallback path (`curr_emergency = total_liquid`) kicks in instead.
- Villa Fund shortfall recommendation: if a goal matching "villa" exists and `target_amount > current_amount`, emits a warning recommendation citing the gap and the goal's computed expected completion date.
- Goal expected-completion status logic (`calculate_goal_expected_completion` in calculations.py): if the target is already met, status is "Green" with 0 months remaining; if `monthly_contribution <= 0`, status is "Red" and `expected_date` is the literal string `"Never"`; otherwise status is "Green" whenever `monthly_contribution > 0` (there is no intermediate "Yellow" branch actually reachable in the current code, despite Yellow being described in the function's docstring/comments as "slow but contributing").

- **Funding rules** (`decision_engine.py` checks 5b and 5c). A goal can exclude whole kinds of asset (`goal_funding_constraints`, "Never count these kinds of asset towards this goal"), and/or be set to **Only low-risk holdings** (`low_risk_only` in the goal's `funding_sources_json` blob, exposed on the goal by `/api/init`). The low-risk check uses each holding's *effective risk* (`backend/risk.py`, also exposed as `assets[].effective_risk`): a mutual fund's fund type (liquid/debt low, hybrid/other medium, equity high), else a risk level set to Low or High, else the usual risk of that kind of asset (FD, PPF, EPF, bonds, insurance low; stocks high). A liquid fund can therefore back a reserve goal while an equity fund linked to it is flagged, which a category exclusion on "Mutual Fund" could not express.

## Configuration

- DB-editable via `/api/rules`: `no_villa_equity` (unenforced, see above).
- Hardcoded, not DB-driven: the "emergency"/"insurance"/"villa" name-substring matching logic itself; the Green/Red-only goal status thresholds in `calculate_goal_expected_completion`; the `priority` field's allowed values (rendered via a `select_priority` UI control in DynamicForm.tsx, not backed by a DB-configurable list).
- `hardcoded_vs_dynamic.md` does not carry a dedicated Goals section beyond the `no_villa_equity` rule and the general Emergency Fund / Insurance Reserve targets that goals can substitute for.

## UI Structure

- `frontend/src/components/EntityGrid.tsx` — `COMMON_COLUMNS['goals']`: Goal Name, Target Amount, Current Amount, Monthly SIP (`monthly_contribution`), Expected Date (`expected_completion`).
- `frontend/src/components/DynamicForm.tsx` — goals branch sets standard fields `target_amount`, `current_amount`, `monthly_contribution` (all `number`), `target_date` (`date`), `priority` (`select_priority`); no category-driven custom fields since goals have no `category_id`.
- Goal funding (linking an asset to a goal) is edited from the **asset's** form via a `goal_mapping` field, not from the goal's own form — there is no dedicated "manage this goal's funding sources" screen showing/editing `goal_holdings` weights directly.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/goals` (and `/goals/{id}`) — generic CRUD, entity_type in the shared hardcoded allow-list. GET has a goals-specific branch in `get_entities()` that computes `current_amount` via `SUM(assets.current_value * goal_holdings.allocation_weight)` rather than returning the raw column. POST/PUT both special-case goals: if `target_amount`/`current_amount`/`monthly_contribution` are all present in the payload, the server computes `expected_completion` server-side via `calc.calculate_goal_expected_completion` and stores it (note: this writes to a column named `expected_completion`, which does not appear in the `goals` CREATE TABLE DDL — it lands in `funding_sources_json` via `serialize_entity_payload`'s "unknown column → JSON blob" fallback).
- `GET /api/init` — returns `goals` with derived `current_amount`, parsed `funding_sources` (from `funding_sources_json`), and the full `calculate_goal_expected_completion` result (`gap`, `months_remaining`, `expected_date`, `status`) merged onto each goal object.
- Deleting or updating an `assets` row cleans up its `goal_holdings` row(s) (`DELETE FROM goal_holdings WHERE asset_id = ?`) before/along with the asset CRUD operation.

## AI Responsibilities

None exist yet. There is no AI/LLM integration for goal planning, funding recommendations, or natural-language goal creation ("save for a villa by 2030") — everything is a manual form plus deterministic arithmetic in `calculations.py`/`decision_engine.py`.

## Reports

- No dedicated Goals export/report exists in Reports.tsx's export center (which covers Accounts, Loans, Investments, Insurance CSV exports, but not Goals specifically).
- Goals appear in the Snapshot feature's frozen monthly `snapshot_data` blob (via `data.goals` in Snapshot.tsx), so historical goal state is preserved snapshot-to-snapshot, but there's no dedicated goal-progress report or chart surfaced anywhere.

## Future Enhancements

NOT YET BUILT — reasonable next steps:
- Replace name-substring matching ("emergency"/"insurance"/"villa") in `decision_engine.py` with a stable `goal_type`/`tag` column, so recommendations survive a goal rename.
- Enforce `no_villa_equity` by checking the category/type of any asset added to a villa-tagged goal's `goal_holdings`.
- A dedicated goal-funding management screen (edit `goal_holdings` weights directly, link multiple assets with partial allocations) instead of the current one-asset-at-a-time `goal_mapping` field on the asset form.
- Goal-vs-actual variance/trend charting using the Snapshot history.
- Introduce a real "Yellow" (on-track-but-slow) status band in `calculate_goal_expected_completion`, since the code currently only ever returns Green or Red.
