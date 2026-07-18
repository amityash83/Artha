# Credit-Cards Domain

## Purpose

Credit Cards gives the user a single place to track owned cards as revolving-credit liabilities and to actively optimize how they use them — not just log a balance, but simulate reward yield across category-based multipliers, milestone step-ups, and mileage-transfer redemptions, plus track lounge access and fee-waiver progress. Per the legacy design note preserved from `architecture/Artha_Credit_Card_Architecture_v1.md`, the intent is decision support ("should I keep paying this card, is my utilization healthy, which card should I swipe for this purchase"), not transaction-level accounting — Artha is a Financial Intelligence Layer on top of the user's data, not a bookkeeping tool. Unlike the rest of this document set, Credit Cards today already has a substantial, shipped reward-optimization surface, not just balance tracking.

## Scope

- Credit Card tracking as a `category` of the shared `liabilities` table (`category_name = 'Credit Card'`, `liability_kind = 'revolving_credit'`), not a separate `owned_cards` table
- A dedicated, shipped screen — `src/components/CreditCards.tsx` (~1400 lines), wired into `App.tsx` as its own `credit-cards` tab, separate from the generic `liabilities` tab — with three sub-tabs: **Card Inventory**, **Waivers & Milestones**, and **Smart Rewards Simulator**
- **Card Inventory**: a visual card-face grid per card (network badge, masked number, holder name/remarks), outstanding vs. available limit, limit utilization bar, current statement spend, reward points balance and cash value, and a quick lounge-quota readout
- **Reward optimization engine** (real, shipped, not a mockup): per-card `CategoryMultiplierRule`s (spend-category point multipliers with optional monthly point caps and category exclusions), `MilestoneThresholdRule`s (step-up bonus point rates once cumulative statement spend crosses a threshold), and `RedemptionPartnerRatio`s (airline/hotel transfer partners with named transfer ratios, e.g. 5:4, 5:2) — all user-configured per card, no fixed catalogue
- **Smart Rewards Simulator** (the "calculator" sub-tab): given a hypothetical spend amount + category + redemption strategy (cash vs. miles), computes and ranks estimated reward yield across all registered cards, applying category exclusions, multiplier resolution, milestone step-up detection, monthly point caps, and best-partner mileage transfer value
- **Lounge access tracking**: domestic/international visit limits and used-counts per card, surfaced in both Inventory and the Waivers & Milestones tab
- **Fee-waiver / spend-milestone tracking**: a target spend amount + current progress + renewal date per card, with a computed "required daily spend rate" to hit the waiver target before renewal
- Built-in `PRESETS` — starter templates for real Indian premium cards (HDFC Infinia, Axis Magnus, SBI Card ELITE) that pre-fill the reward-engine configuration fields when registering a new card
- A **second, independent** basic-fields editing path via the generic `liabilities` tab (`EntityGrid`/`DynamicForm`), which writes `credit_limit`/`statement_balance`/`statement_date`/`due_date`/`annual_fee`/`reward_points`/`point_value` to the `credit_card_details` satellite table (see Data Model for why this coexists separately from the path above)
- Statement-balance and due-date reminders on the shared Financial Calendar (separate "Billed" vs. "Unbilled" balance events), sourced from `credit_card_details`, not from `CreditCards.tsx`'s `metadata_json` fields

## Out of Scope

- **No card product reference library/catalogue.** `PRESETS` in `CreditCards.tsx` are hardcoded starter values copied into a new card's *editable* fields when registering it — not a maintained, database-backed catalogue of published card terms. There is no `card_variants` table and no workflow to add/update reference card products independent of a user's own registered card.
- **No Compare Cards or Annual Review decision engine.** These are named, described screens in the legacy architecture doc (side-by-side weighted scoring, keep/close/upgrade/downgrade recommendations) but have no implementation anywhere in `src/` or `backend/`.
- **No reward-points accrual/reconciliation from real transactions.** The Smart Rewards Simulator estimates *hypothetical* reward yield from a user-entered spend amount; it does not read actual `transactions` rows, and nothing automatically increments `reward_points`/`current_statement_spend` when a real credit-card expense transaction is posted. Point balances, current statement spend, and milestone progress are all manually entered/edited by the user.
- **No annual-fee waiver *rule engine*.** The Waivers & Milestones tab computes a required daily spend rate against a manually-entered target/current/renewal date, but this is display-only arithmetic in the component — `decision_engine.py` has no Credit-Card-specific checks and does not surface fee-waiver risk as a recommendation.
- **The `reward_programs`, `reward_rules`, `reward_partners`, `reward_ledger`, and `reward_redemptions` tables in `backend/db.py` are dead schema, unrelated to the reward engine above.** They are never read from or written to by any route in `backend/main.py`, and `reward_programs` even references a `financial_products` table that is never created anywhere in `init_db()`. The real, shipped reward-rule data (category multipliers, milestones, redemption partners) lives entirely as JSON blobs inside `liabilities.metadata_json`, not in these dedicated tables — a genuine architectural mismatch worth resolving (see Future Enhancements).
- No dedicated `/api/decision-engine`-style recommendations for credit cards — `generate_recommendations()` only ever inspects loans, insurance, goals, and liquidity, never credit card data from either persistence path.

## Business Objectives

- Let the user see, at a glance, how much of each card's limit is used, when the next payment is due, and whether a card is a "low yield" drag (annual fee exceeding its accumulated reward value)
- Help the user decide which card to use for a given purchase category by simulating reward yield across all registered cards before swiping, accounting for category multipliers, milestone step-ups, and redemption strategy
- Track progress toward annual-fee waiver spend targets so the user can see, in concrete daily-spend terms, whether they're on pace to justify a card's fee before renewal
- Track lounge-visit entitlements so unused benefits aren't wasted
- Keep credit card debt visible in net-worth and total-liabilities calculations exactly like any other liability, without requiring a special-cased data model for the base balance/due-date tracking

## Data Model

Conceptually, a Credit Card is a **Liability** (the same generic entity type used for Loans) with a category discriminator of `Credit Card` and a `liability_kind` of `revolving_credit` — not a loan-shaped amortizing debt. Its loan-only columns (`interest_rate`, `emi`, `tenure_months`) are explicitly zeroed out rather than removed, for schema uniformity across all liability rows.

**Important architectural fact: a Credit Card liability today has two coexisting, independent persistence paths for what looks like overlapping data**, because two separate UIs write to it differently:

1. **`credit_card_details` satellite table** (1:1 via `liability_id`) — holds `credit_limit`, `statement_balance`, `statement_date`, `due_date`, `annual_fee`, `reward_points`, `point_value`. Written only via `PUT /api/liabilities/{id}/credit-card-details`, which is called exclusively from `EntityGrid.tsx`'s `dispatchSatelliteData()` when a card is added/edited through the **generic `liabilities` tab** (`DynamicForm.tsx`'s `isCreditCard` field branch). This is also the only source the Financial Calendar reads from for due-date/statement-balance reminders.
2. **`liabilities.metadata_json`** — holds a much larger set of fields written by the **dedicated `CreditCards.tsx` screen** (the `credit-cards` tab): `credit_limit`, `statement_date`, `due_date`, `annual_fee`, `reward_points`, `point_value` again (duplicated, but as loose JSON keys, not satellite columns), plus `network`, `renewal_date`, `remarks`, `lounge_visits_limit/used`, `lounge_int_limit/used`, `milestone_spend_target/current`, `milestone_reward_desc`, `base_points`, `base_spend`, `current_statement_spend`, and three JSON-stringified rule arrays: `category_rules_json` (`CategoryMultiplierRule[]`), `milestone_rules_json` (`MilestoneThresholdRule[]`), `redemption_partners_json` (`RedemptionPartnerRatio[]`). This is written via the plain generic `POST/PUT /api/entities/liabilities`, which folds any non-column field into `metadata_json` per `serialize_entity_payload()` — `CreditCards.tsx` never calls the `credit-card-details` satellite route at all. Notably, `CreditCards.tsx` has no field for `statement_balance` — that value only exists in path 1.

Because `GET /api/init` merges both the `credit_card_details` join *and* the parsed `metadata_json` onto the same returned liability object (with `metadata_json`'s keys applied via `d.update(...)` after the satellite fields), whichever was written most recently for an overlapping key (e.g. `credit_limit`) wins in the merged object, and the two screens can silently drift out of sync with each other for a single real-world card.

- **Liability** (base row): name, category, lender/issuing institution, outstanding balance, `liability_kind = 'revolving_credit'`, `metadata_json`. `interest_rate`/`emi`/`tenure_months` are forced to 0 by the satellite-table PUT route (path 1); `CreditCards.tsx` also sends them as 0 directly in its own generic entity payload (path 2).
- **CreditCardDetails** (satellite, path 1 only): credit limit, statement balance, statement date, due date, annual fee, and the two "placeholder" reward fields as originally designed.
- **Institution**: shared reference entity (the issuing bank), same table used by loans, accounts, and insurance.
- **Category**: `Credit Card`'s `fields_definition` is `NULL` — the satellite table was the intended design for card-specific fields, but `CreditCards.tsx`'s richer reward-engine fields bypass both `fields_definition` and the satellite table, landing in `metadata_json` instead.

## Database Schema

From `backend/db.py`'s `init_db()`:

```sql
CREATE TABLE IF NOT EXISTS liabilities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    lender_institution_id INTEGER REFERENCES institutions(id),
    interest_rate REAL DEFAULT 0.0,     -- forced to 0 for credit cards
    emi REAL DEFAULT 0.0,               -- forced to 0 for credit cards
    outstanding REAL DEFAULT 0.0,
    tenure_months INTEGER DEFAULT 0,    -- forced to 0 for credit cards
    compounding TEXT DEFAULT 'Monthly',
    linked_asset_id INTEGER REFERENCES assets(id),
    tax_benefit TEXT DEFAULT 'None',
    metadata_json TEXT,                 -- carries CreditCards.tsx's whole reward-engine config
    liability_kind TEXT DEFAULT 'loan'  -- 'revolving_credit' for credit cards
)

CREATE TABLE IF NOT EXISTS credit_card_details (
    liability_id INTEGER PRIMARY KEY REFERENCES liabilities(id) ON DELETE CASCADE,
    credit_limit REAL DEFAULT 0.0,
    statement_balance REAL DEFAULT 0.0,
    statement_date INTEGER,
    due_date INTEGER,
    annual_fee REAL DEFAULT 0.0,
    reward_points REAL DEFAULT 0.0,
    point_value REAL DEFAULT 0.25
)
```

Seeded category row: `('Liability', 'Credit Card', None)` — `fields_definition` is `NULL`.

Legacy migration path: a pre-existing `credit_cards` table (with `issuer`, `credit_limit`, `outstanding`, `remarks`, etc.) is migrated into `liabilities` + `metadata_json` and renamed to `credit_cards_old` on startup if found. A separate idempotent backfill step then reads any Credit-Card liability's `metadata_json` and populates `credit_card_details` from it (for installs predating the satellite table), then zeroes the loan-only columns and sets `liability_kind = 'revolving_credit'`. This backfill only runs once per liability (guarded by "not already in `credit_card_details`"), so it does not keep the two paths in sync going forward — new edits from `CreditCards.tsx` after that point only update `metadata_json`, not the satellite row.

`CreditCards.tsx`'s reward-engine fields inside `metadata_json` (not columns anywhere): `network`, `renewal_date`, `remarks`, `lounge_visits_limit`, `lounge_visits_used`, `lounge_int_limit`, `lounge_int_used`, `milestone_spend_target`, `milestone_spend_current`, `milestone_reward_desc`, `base_points`, `base_spend`, `current_statement_spend`, `category_rules_json`, `milestone_rules_json`, `redemption_partners_json`.

Unused/dead schema present in `db.py` but not wired to any route (distinct from the working `metadata_json`-based reward engine described above): `reward_programs` (references a non-existent `financial_products` table), `reward_rules`, `reward_partners`, `reward_ledger`, `reward_redemptions`.

## Business Rules

There are no rules specific to Credit Cards in `decision_engine.py` or `financial_rules` — `generate_recommendations()` never inspects `credit_card_details` or Credit-Card liabilities at all (no utilization warning, no fee-waiver risk flag, no minimum-payment risk). What does exist is client-side computed logic inside `CreditCards.tsx` itself, evaluated live in the browser from user-entered configuration, not stored as rule outputs:

- **Reward yield resolution** (`calculatorRecommendations`, the Smart Rewards Simulator): for a hypothetical spend amount/category, checks category exclusion first; if not excluded, resolves a multiplier from `category_rules_json` (defaulting to 1.0x if no matching category rule); checks whether projected total spend (`current_statement_spend + hypothetical amount`) crosses the highest applicable `milestone_rules_json` threshold, and if so substitutes that milestone's bonus points-rate/spend-block instead of the base rate; computes raw points as `(amount / spend_block) * points_rate * multiplier`; applies a monthly point cap from the category rule if set; converts to INR either at `point_value` (cash strategy) or via the best-ratio redemption partner assuming ₹1/mile (miles strategy)
- **"Low yield" flag**: a card is flagged in Inventory if `annual_fee > 0` and its accumulated `reward_points * point_value` is less than the annual fee — pure display logic, not a stored recommendation
- **Fee-waiver pacing**: `required daily rate = (milestone_spend_target - milestone_spend_current) / days_until_renewal_date` — again computed live in the component, not persisted or exposed via any API
- The only backend-side "rule-like" behavior is structural: `PUT /api/liabilities/{id}/credit-card-details` unconditionally forces `interest_rate = 0, emi = 0, tenure_months = 0` and sets `liability_kind = 'revolving_credit'` on the parent liability — a data-integrity side effect, not a financial business rule, and one that only fires along path 1 (the generic `liabilities` tab), not when a card is edited through `CreditCards.tsx`.

Because Credit Cards deliberately are not amortizing debt, none of `calculations.py`'s loan math (`calculate_remaining_tenure`, `calculate_remaining_interest`, `calculate_loan_progress`, `calculate_interest_saved_after_prepayment`, `calculate_advanced_emi_schedule`, `simulate_multi_loan_payoff`, `calculate_monthly_emi`) applies to them — confirmed by `/api/init`'s liability-enrichment logic, which only computes `remaining_tenure`/`remaining_interest`/`progress` when `interest_rate > 0 and emi > 0`, so Credit Card rows always get `remaining_tenure = -1`, `remaining_interest = 0.0`, `progress = 100.0`.

## Configuration

Per `hardcoded_vs_dynamic.md`, there is nothing Credit-Card-specific in the `financial_rules` table. All Credit-Card "configuration" is per-card, user-entered data, not global system rules:

- The 7 fixed fields on `credit_card_details`, editable per-card through the generic entity form (hardcoded field list in `DynamicForm.tsx`'s `isCreditCard` branch)
- The full reward-engine configuration in `CreditCards.tsx` — category multiplier rules, milestone thresholds, redemption partner ratios, lounge limits, base points/spend rate, fee-waiver target — all per-card user input stored in that card's `metadata_json`, not a global rule
- `PRESETS` (HDFC Infinia, Axis Magnus, SBI Card ELITE) are hardcoded starting values in the component source, only used to pre-fill the add-card form; editing a preset's values afterward only changes that one card's `metadata_json`, never the preset itself

## UI Structure

Two genuinely separate screens can edit a Credit Card liability:

- **Generic path** — `App.tsx`'s `liabilities` tab renders `EntityGrid.tsx` + `DynamicForm.tsx` for all liability categories. For `category_name === 'Credit Card'`, `EntityGrid` adds two `CATEGORY_COLUMNS`: Credit Limit and Due Date. `DynamicForm`'s `isCreditCard` branch drops `interest_rate`/`emi`/`tenure_months` and shows `lender_institution_id`, `outstanding`, `credit_limit`, `statement_balance`, `statement_date`, `due_date`, `annual_fee`, `status`, `owner`. On save, `EntityGrid.dispatchSatelliteData()` PUTs these to `/api/liabilities/{id}/credit-card-details` (the satellite table) — this is the *only* UI path that writes `credit_card_details`.
- **Dedicated path** — `App.tsx`'s `credit-cards` tab renders `CreditCards.tsx` directly (not through `EntityGrid`/`DynamicForm` at all). It has its own inventory grid (stylized card faces), its own multi-tab add/edit modal (`activeModalTab`: `general`, `rates`, `categories`, `milestones`, `partners`), and three page-level sub-tabs: **Card Inventory**, **Waivers & Milestones** (fee-waiver progress bars + lounge quota trackers), and **Smart Rewards Simulator** (category/amount/strategy inputs ranking all cards by estimated yield). Every save here goes through the plain generic `POST/PUT /api/entities/liabilities` with all card-specific data folded into `metadata_json` — it never calls the `credit-card-details` satellite endpoints.

Both tabs read from the same `data.liabilities` array (from `GET /api/init`), which contains the merged result of both persistence paths, so both UIs display a plausible-looking card, but each only writes the subset of fields its own form covers, and a value edited in one screen is invisible to (and can be silently overwritten by a later save from) the other.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/liabilities` — generic CRUD used by *both* UI paths. `GET /api/init` and `GET /api/entities/liabilities` join in `credit_card_details` for any liability whose `category_name == 'Credit Card'` and flatten those fields onto the returned object, then additionally parse and spread `metadata_json` onto the same object — so the final API response for a credit card is a merge of both persistence paths, with `metadata_json` fields applied after (and so taking precedence for any overlapping key name)
- `GET /api/liabilities/{id}/credit-card-details` — returns the satellite row for a given liability id, or `null` if none exists yet. Not called by `CreditCards.tsx`.
- `PUT /api/liabilities/{id}/credit-card-details` — upserts the satellite row (`CreditCardDetailsSchema`: `credit_limit`, `statement_balance`, `statement_date`, `due_date`, `annual_fee`, `reward_points`, `point_value`); as a side effect, always sets the parent liability's `liability_kind = 'revolving_credit'` and zeroes `interest_rate`/`emi`/`tenure_months`. Called only from `EntityGrid.tsx`.
- `GET /api/calendar` — generates two kinds of Credit Card events per card per month over the next 12 months: `"{name} Payment Due (Billed)"` for the statement balance, and `"{name} Payment Due (Unbilled)"` for `max(outstanding - statement_balance, 0)`, both anchored to `credit_card_details.due_date`. This reads exclusively from the `credit_card_details` satellite table (via a SQL join), so a card only edited through `CreditCards.tsx` (path 2) and never through the generic liabilities tab will have no `credit_card_details` row and will not appear on the calendar at all, or will show stale values from whenever the satellite row was last backfilled/written.
- No dedicated `/api/calculations/*` endpoint exists for credit card rewards (contrast with Loans' `advanced-emi` and `loan-optimizer` endpoints) — the entire Smart Rewards Simulator computation happens client-side in `CreditCards.tsx`'s `calculatorRecommendations` memo, with no backend round-trip
- `PUT /api/rules` exists generically but has no Credit-Card rule_keys to target (see Business Rules)

## AI Responsibilities

None currently exist. There is no AI/ML assistant implemented anywhere in Artha — no LLM integration, no natural-language interface, nothing that reads or writes Credit Card data autonomously today. The legacy architecture doc's "AI Scope" section (AI may explain/recommend/compare/summarize; AI must not modify reference data, calculations, schema, or business rules) is a forward-looking design boundary for a not-yet-built assistant, not a description of an existing feature. `CreditCards.tsx`'s reward-yield calculator is deterministic arithmetic evaluated in React, not AI/ML, despite computing something that *feels* like a recommendation ("this card gives you the best yield for this purchase"). `decision_engine.py`'s rule-based recommendations (which power Loans/Insurance/Goals/Liquidity checks) are the closest adjacent capability but still do not cover Credit Cards at all — there is no proactive warning today for a maxed-out card, a card carrying revolving interest, or a missed fee-waiver deadline; the user must open the Waivers & Milestones tab themselves to see that.

## Reports

No dedicated Credit Card export/report exists today. There is no Excel/PDF export analogous to Loans' amortization-schedule export, and no "annual card review" or "utilization history" report. Credit Card balances and due dates feed into the shared Financial Calendar (from the `credit_card_details` path only) and into the overall net-worth/total-liabilities figures on the dashboard, and reward-yield estimates are viewable live in the Smart Rewards Simulator — but none of these are exportable/printable reports.

## Future Enhancements

Pulled from `architecture/Artha_Credit_Card_Architecture_v1.md`'s forward-looking sections, plus one internal-consistency item surfaced while documenting this domain. **None of the following are built**; each needs an explicit product decision, and per that doc's guidance, should extend the existing generic tables rather than introduce a parallel domain module or repository layer:

- **Reconcile the two persistence paths.** The most concrete near-term fix: either retire the `credit_card_details` satellite table and the generic-tab editing path in favor of `CreditCards.tsx`'s richer `metadata_json` model, or extend `credit_card_details` with the reward-engine columns and make `CreditCards.tsx` write through the satellite route instead of raw `metadata_json`. Today a user can edit a card in one screen and have it look unchanged (or get overwritten) in the other — this needs a decision, not just documentation.
- **Wire the reward engine to real transactions.** `category_rules_json`/`milestone_rules_json`/`redemption_partners_json` already model a genuine reward system; the missing piece is accruing `reward_points` and `current_statement_spend` automatically from posted `transactions` rows instead of manual entry.
- **Decide the fate of `reward_programs`/`reward_rules`/`reward_partners`/`reward_ledger`/`reward_redemptions`.** These pre-date (or were designed in parallel with) `CreditCards.tsx`'s `metadata_json`-based reward engine and now duplicate its purpose while being completely unused. Either wire them up properly (fixing the dangling `financial_products` FK first) and migrate `CreditCards.tsx` to use them, or remove them.
- **Card Library**: a genuine, maintained reference catalogue of card products (bank, network, published fees/rewards/eligibility/lounge access/merchant offers), distinct from a user's own editable `PRESETS`-seeded card — would warrant new reference tables (`card_variants`, `travel_partners`, `merchant_offers`) separate from both existing persistence paths
- **Compare Cards**: side-by-side weighted scoring across 2-5 registered cards (fee, rewards, acceptance, ecosystem, travel, simplicity, stability) — no persistence needed if built, purely computed on demand
- **Annual Review decision engine**: a `decision_engine.py`-style function outputting Keep/Close/Upgrade/Downgrade/Replace plus a "worth the fee?" verdict and next review date — natural home for turning the existing client-side "low yield"/fee-waiver-pacing arithmetic into an actual proactive recommendation
- **Offer/merchant intelligence and portfolio-level reward optimization** — explicitly labeled Phase 2/3 ideas in the legacy doc, no design work done yet beyond the phase list itself
