# Credit-Cards Domain

## Purpose

Credit Cards gives the user a single place to track owned cards as revolving-credit liabilities and to actively optimize how they use them — not just log a balance, but simulate reward yield across category-based multipliers, caps, milestone step-ups, and mileage-transfer redemptions, track lounge access and fee-waiver progress, compare cards (owned or from a reference catalogue), and get a per-card annual Keep/Close/Downgrade/Upgrade verdict. Per the legacy design note preserved from `Architecture/Legacy/Artha_Credit_Card_Architecture_v1.md`, the intent is decision support ("should I keep paying for this card, is my utilization healthy, which card should I swipe for this purchase"), not bookkeeping — Artha is a Financial Intelligence Layer on top of the user's data. Card spend *is* now recorded transaction-by-transaction in the shared ledger, but only so reward/cap math can run against real per-category spend, not to turn Artha into a statement-reconciliation tool.

## Scope

- Credit Card tracking as a `category` of the shared `liabilities` table (`category_name = 'Credit Card'`, `liability_kind = 'revolving_credit'`), with card-specific fields in the `credit_card_details` satellite table — not a separate `owned_cards` table
- A dedicated screen — `frontend/src/components/CreditCards.tsx`, wired into `App.tsx` as its own `credit-cards` tab, separate from the generic `liabilities` tab — with six sub-tabs (`activeSubTab`): **Card Inventory**, **Waivers & Milestones**, **Smart Rewards Simulator** (`calculator`), **Card Library**, **Compare Cards**, and **Annual Review**. The last three live in `frontend/src/components/creditcards/` (`CardLibraryTab.tsx`, `CompareCardsTab.tsx`, `AnnualReviewTab.tsx`)
- **Card Inventory**: a visual card-face grid per card (network badge, masked number, holder name/remarks), outstanding vs. available limit, limit utilization bar, current-cycle statement spend, reward points balance and cash value, and a quick lounge-quota readout
- **Reward optimization engine**: per-card `CategoryMultiplierRule`s (spend-category point multipliers, category exclusions, and caps — a legacy single `monthlyCapPoints` and/or a `caps[]` array of `{capPoints, period, groupLabel?}` for banks with multiple simultaneous ceilings, e.g. daily + monthly), `MilestoneThresholdRule`s (step-up bonus point rates once cycle spend crosses a threshold), and `RedemptionPartnerRatio`s (airline/hotel transfer partners with a transfer ratio and an optional per-route `pointValue`)
- **Per-category spend ledger**: card spend is recorded as `'Spend'` transactions in the shared `transactions` ledger (`dest_ref_type = 'Liability'`, with a `category_id`), entered via the Transactions Ledger. Billing cycles are computed live from `credit_card_details.statement_date`; the current cycle's total and per-category breakdown feed the Inventory, the Simulator, milestone detection, and pooled-cap enforcement
- **Smart Rewards Simulator**: given a hypothetical spend amount + category + redemption strategy (cash vs. miles), computes and ranks estimated reward yield across all registered cards, applying category exclusions, multiplier resolution, milestone step-up detection (against real cycle spend when it exists), the tightest applicable cap, pooled-cap headroom (`groupLabel`) against real per-category spend, and best-route redemption value (`transferRatio × pointValue`)
- **Lounge access tracking**: domestic/international visit limits and used-counts per card, surfaced in Inventory and Waivers & Milestones
- **Fee-waiver / spend-milestone tracking**: a target spend amount + current progress + renewal date per card, with a computed "required daily spend rate" to hit the waiver target before renewal
- **Card Library**: a user-editable reference catalogue of card *products* (`card_variants` table) — fees, fee-waiver spend, base earn rate, point value, lounge entitlements, eligibility notes, pros/cons, and the same three rule-JSON shapes as owned cards. Ships with 10 seeded Indian cards (HDFC Infinia, Axis Magnus, SBI Card ELITE, HDFC Regalia Gold, ICICI Amazon Pay, Amex MR Gold, SBI Cashback, Axis Ace, HSBC Premier Metal, IDFC FIRST Wealth), seeded exactly once on the run that creates the table, so user deletions/renames stick. A variant can prefill a new owned card with no transformation
- **Compare Cards**: side-by-side weighted scoring of 2–5 cards, mixing owned cards and Library variants
- **Annual Review**: a backend rule function producing a Keep / Close / Downgrade / Upgrade-Candidate verdict per owned card, with "worth the fee?", milestone pace, lounge utilization, a reason string, and a next-review date
- Built-in `PRESETS` in `CreditCards.tsx` (HDFC Infinia, Axis Magnus, SBI Card ELITE) — hardcoded starter values that pre-fill the add-card form; separate from, and predating, the Card Library
- A second, narrower editing path via the generic `liabilities` tab (`EntityGrid`/`DynamicForm`), which writes 7 basic fields to the same `credit_card_details` row through the same route (see Data Model)
- Statement-balance and due-date reminders on the shared Financial Calendar (separate "Billed" vs. "Unbilled" balance events), sourced from `credit_card_details`

## Out of Scope

- **No automatic reward-points accrual.** `reward_points` (the points balance), `milestone_spend_current`, and lounge used-counts are still manually entered. Logging `'Spend'` transactions updates the derived cycle-spend figures and pooled-cap headroom, but nothing increments the points balance from them.
- **Annual Review does not use the spend ledger.** `generate_credit_card_annual_reviews()` reads only aggregate `credit_card_details` fields (points balance, fee, milestone target/current, lounge counts); its response carries an explicit `caveat` saying so. It also deliberately never names a specific replacement card — that's Compare Cards' job.
- **No proactive credit-card recommendations.** `generate_recommendations()` (the dashboard's rule-based recommendations) still inspects only loans, insurance, goals, and liquidity — no utilization warning, no fee-waiver risk flag, no minimum-payment risk. The Annual Review is pull-only (the user opens its tab).
- **No statement reconciliation or import.** Spend is entered manually in the Ledger; there's no statement/CSV import and no matching of logged spend against the card's `statement_balance`.
- **The `reward_programs`, `reward_rules`, `reward_partners`, `reward_ledger`, and `reward_redemptions` tables in `backend/db.py` are dead schema, unrelated to the reward engine above.** No route reads or writes them, and `reward_programs` references a `financial_products` table that is never created anywhere in `init_db()`. The real reward-rule data lives as JSON in `credit_card_details` (owned cards) and `card_variants` (Library).

## Business Objectives

- Let the user see, at a glance, how much of each card's limit is used, when the next payment is due, and whether a card is a "low yield" drag (annual fee exceeding its accumulated reward value)
- Help the user decide which card to use for a given purchase by simulating reward yield across all registered cards before swiping, accounting for multipliers, caps (including pooled caps already partly consumed this cycle), milestone step-ups, and redemption strategy
- Track progress toward annual-fee waiver spend targets in concrete daily-spend terms
- Track lounge-visit entitlements so unused benefits aren't wasted
- Support keep/close/switch decisions with a per-card annual verdict and a weighted comparison against other owned cards or catalogue products
- Keep credit card debt visible in net-worth and total-liabilities calculations exactly like any other liability

## Data Model

Conceptually, a Credit Card is a **Liability** (the same generic entity type used for Loans) with a category discriminator of `Credit Card` and a `liability_kind` of `revolving_credit` — not amortizing debt. Its loan-only columns (`interest_rate`, `emi`, `tenure_months`) are zeroed rather than removed, for schema uniformity across liability rows.

**`credit_card_details` is the single source of truth for all card-specific data**, including the full reward-engine config. Both UIs write it through the same route, `PUT /api/liabilities/{id}/credit-card-details`:

1. **Dedicated screen (`CreditCards.tsx`)** saves in two steps: base liability fields (name, category, issuing institution, outstanding) via the generic `POST/PUT /api/entities/liabilities`, then every card/reward field via the satellite route.
2. **Generic `liabilities` tab** (`EntityGrid.tsx`'s `dispatchSatelliteData()`) PUTs only 7 fields: `credit_limit`, `statement_balance`, `statement_date`, `due_date`, `annual_fee`, `reward_points`, `point_value`.

The satellite PUT is a **partial update** for an existing row (`exclude_unset=True`): only fields the caller sent are written. This is load-bearing — before it, a 7-field save from the generic grid filled the other ~15 fields from schema defaults and wiped the card's rule JSON. Any new caller of this route must send only the fields it means to change.

`GET /api/init` spreads `metadata_json` onto each liability first, then overlays the `credit_card_details` columns, so for any overlapping key the satellite value wins. Older installs may still carry stale reward keys in `metadata_json` from before the satellite table held them; they're harmless for overlapping keys but nothing should read reward config from `metadata_json`.

**Spend and the ledger.** A `'Spend'` transaction (`source_ref_type = 'None'`, `dest_ref_type = 'Liability'`, `dest_ref_id = <card>`, optional `category_id`) increases the card's `liabilities.outstanding` via `adjust_double_entry_balances()`; EMI/Prepayment-style payments decrease it. One exception: the **statement spend adjustment** row. The dedicated screen's "Statement Spend Adjustment" field (for spend the user hasn't logged individually this cycle) is stored as a single dated `'Spend'` transaction with `transactions.is_balance_exempt = 1`. It counts toward cycle spend but never moves `outstanding`. `is_balance_exempt` is a structural column, not caller-settable: the generic entity routes strip it from payloads and, on edit/delete, take it from the stored row. Earlier designs that identified this row by its notes text drifted across edits and were replaced; see `backend/tests/test_transaction_editing.py` for the edge cases this must keep passing.

`credit_card_details.current_statement_spend` is now **vestigial**: the satellite PUT converts any value sent for it into the adjustment transaction and always writes the column as 0. The frontend shows `real_cycle_spend_total` when `has_spend_transactions` is true and only falls back to the column for legacy rows.

- **Liability** (base row): name, category, lender/issuing institution, outstanding, `liability_kind = 'revolving_credit'`. `interest_rate`/`emi`/`tenure_months` are forced to 0 by the satellite PUT route.
- **CreditCardDetails** (satellite, 1:1 via `liability_id`): limits/dates/fee, points balance and value, network, renewal date, lounge limits/used, milestone target/current/description, remarks, base earn rate, and the three rule-JSON columns.
- **CardVariant** (`card_variants`, reference data): independent of any owned card; `UNIQUE(name, issuer)`, `is_seeded` distinguishes shipped rows from user-added ones.
- **Transaction** (`'Spend'` rows): the per-category spend ledger described above.
- **Institution**: shared reference entity (the issuing bank).
- **Category**: `Credit Card`'s `fields_definition` is `NULL` — the satellite table carries the card-specific fields instead.

## Database Schema

From `backend/db.py`'s `init_db()`:

```sql
CREATE TABLE IF NOT EXISTS credit_card_details (
    liability_id INTEGER PRIMARY KEY REFERENCES liabilities(id) ON DELETE CASCADE,
    credit_limit REAL DEFAULT 0.0,
    statement_balance REAL DEFAULT 0.0,
    statement_date INTEGER,             -- day of month; anchors the live billing-cycle computation
    due_date INTEGER,                   -- day of month; anchors calendar reminders
    annual_fee REAL DEFAULT 0.0,
    reward_points REAL DEFAULT 0.0,
    point_value REAL DEFAULT 0.25,
    renewal_date TEXT,
    network TEXT DEFAULT 'Visa',
    lounge_visits_limit REAL DEFAULT 0.0,
    lounge_visits_used REAL DEFAULT 0.0,
    lounge_int_limit REAL DEFAULT 0.0,
    lounge_int_used REAL DEFAULT 0.0,
    milestone_spend_target REAL DEFAULT 0.0,
    milestone_spend_current REAL DEFAULT 0.0,
    milestone_reward_desc TEXT,
    remarks TEXT,
    base_points REAL DEFAULT 1.0,
    base_spend REAL DEFAULT 100.0,
    current_statement_spend REAL DEFAULT 0.0,   -- vestigial, always written as 0 (see Data Model)
    category_rules_json TEXT DEFAULT '[]',
    milestone_rules_json TEXT DEFAULT '[]',
    redemption_partners_json TEXT DEFAULT '[]'
)

CREATE TABLE IF NOT EXISTS card_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    issuer TEXT NOT NULL,
    network TEXT NOT NULL DEFAULT 'Visa',
    card_tier TEXT DEFAULT 'Premium',
    joining_fee REAL DEFAULT 0.0,
    annual_fee REAL DEFAULT 0.0,
    fee_waiver_spend REAL DEFAULT 0.0,
    base_points REAL DEFAULT 1.0,
    base_spend REAL DEFAULT 100.0,
    point_value REAL DEFAULT 0.25,
    lounge_visits_domestic INTEGER DEFAULT 0,
    lounge_visits_international INTEGER DEFAULT 0,
    eligibility_notes TEXT,
    category_rules_json TEXT DEFAULT '[]',
    milestone_rules_json TEXT DEFAULT '[]',
    redemption_partners_json TEXT DEFAULT '[]',
    pros_json TEXT DEFAULT '[]',
    cons_json TEXT DEFAULT '[]',
    is_seeded INTEGER NOT NULL DEFAULT 0,
    source_notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(name, issuer)
)
```

`transactions` additions relevant here: `type` allows `'Spend'`, the ref-type columns allow `'Liability'`, plus `category_id` and `is_balance_exempt` columns (see `Architecture/05-Database-Architecture.md` for the full table).

Seeded category row: `('Liability', 'Credit Card', None)` — `fields_definition` is `NULL`.

Migrations, all idempotent, in `init_db()` order:

- A pre-existing legacy `credit_cards` table is migrated into `liabilities` + `metadata_json` and renamed to `credit_cards_old`.
- **(F)** Any Credit-Card liability without a `credit_card_details` row gets one backfilled from its `metadata_json` basic fields; loan-only columns are zeroed and `liability_kind` set.
- **(J)** The reward-engine columns are added to `credit_card_details` if missing, then backfilled once per card from `metadata_json` (for installs where `CreditCards.tsx` used to store reward config there).
- **(L)** Any non-zero legacy `current_statement_spend` is converted into a dated, `is_balance_exempt = 1` `'Spend'` adjustment transaction (dated today, so it naturally ages out of the cycle window like real spend), and the column is zeroed so the migration can't re-fire — even if the marker is later deleted via the generic Ledger.
- `card_variants` is seeded only on the run that first creates the table.

Unused/dead schema present in `db.py` but not wired to any route: `reward_programs` (references a non-existent `financial_products` table), `reward_rules`, `reward_partners`, `reward_ledger`, `reward_redemptions`.

## Business Rules

Credit-card logic is split between `backend/calculations.py`, `backend/decision_engine.py`, and client-side mirrors in `CreditCards.tsx`. Nothing here is in `financial_rules`; all inputs are per-card data.

- **Billing cycle** (`calculate_statement_cycle(statement_date, as_of)`): returns the `{start, end}` of the cycle containing `as_of`, clamping `statement_date` to each month's length (e.g. day 31 in February) and walking back a month if this month's statement day hasn't arrived. Defaults to day 15 if unset. Computed fresh on every call; there's no stored cycle anchor or scheduled reset.
- **Reward yield resolution** (`resolve_reward_rate()` in `calculations.py`, mirrored in `CreditCards.tsx`'s `calculatorRecommendations` — keep the two in sync): category exclusion → category multiplier (1.0× if no rule) → milestone step-up if `current_spend + amount` crosses a threshold (substituting that milestone's rate/spend-block for the base rate) → raw points `(amount / spend_block) × rate × multiplier` → clamp to the **tightest** of all the category's caps (`monthlyCapPoints` and every `caps[]` entry). Because each call evaluates one isolated hypothetical transaction, taking the minimum is exact with no date arithmetic.
- **Pooled caps** (`groupLabel`): a cap entry with a `groupLabel` is also a ceiling on the *combined* points of every category on the card declaring the same label. When a `category_spend_map` (real per-category spend this cycle, from `GET /api/liabilities/{id}/spend-breakdown`) is supplied, the pool's remaining headroom is added as an extra cap candidate. Siblings' already-earned points are estimated at this call's resolved rate (an approximation — there's no per-transaction points ledger). Without spend data, pooled caps degrade to ordinary per-category caps.
- **Redemption value**: cash strategy uses the card's `point_value`; miles strategy picks the partner maximizing `transferRatio × pointValue` (per-route `pointValue`, defaulting to ₹1/point when absent). This is client-side only, in `CreditCards.tsx`.
- **Compare Cards** (`normalize_card_for_comparison()` + `compare_cards()`): normalizes owned cards and Library variants to one shape, then scores five dimensions min-max-normalized *relative to the other cards in the set* (not absolute): fee (inverted), projected annual reward value at `assumed_annual_spend` (default ₹6,00,000, spend-free projection), lounge access (international weighted 1.5×), milestone ease (inverse of fee-waiver spend), and simplicity. Default weights: reward 0.4, fee 0.2, lounge 0.2, milestone 0.1, simplicity 0.1; caller-supplied weights are merged over these.
- **Annual Review** (`generate_credit_card_annual_reviews()` in `decision_engine.py`): `reward_value = reward_points × point_value`, `net = reward_value − annual_fee`. Verdict in order: no fee → Keep; net ≥ 0 → Keep; behind milestone pace (progress vs. fraction of the year elapsed before renewal) → Downgrade; lounge utilization < 25% with fee > ₹3,000 → Downgrade; otherwise Close. A Keep with a fee and net > 2× fee becomes Upgrade-Candidate.
- **"Low yield" flag** (Inventory, client-side display only): `annual_fee > 0` and `reward_points × point_value < annual_fee`.
- **Fee-waiver pacing** (Waivers & Milestones, client-side display only): `(milestone_spend_target − milestone_spend_current) / days_until_renewal_date`.
- **Structural side effects**: the satellite PUT forces `interest_rate = emi = tenure_months = 0` and `liability_kind = 'revolving_credit'` on the parent liability. `'Spend'` increases `outstanding` unless `is_balance_exempt`.

Because Credit Cards aren't amortizing debt, none of `calculations.py`'s loan math applies; `/api/init` only computes `remaining_tenure`/`remaining_interest`/`progress` when `interest_rate > 0 and emi > 0`, so card rows always get `remaining_tenure = -1`.

## Configuration

Per `hardcoded_vs_dynamic.md`, there is nothing Credit-Card-specific in the `financial_rules` table. All configuration is per-card user data or reference data:

- All `credit_card_details` fields per owned card, editable in full via the dedicated screen's multi-tab modal, or the 7 basic fields via the generic liabilities form (`DynamicForm.tsx`'s `isCreditCard` branch)
- Card Library entries (`card_variants`) — seeded starter rows plus user additions, fully editable
- `PRESETS` in `CreditCards.tsx` — hardcoded add-form starting values; editing a card created from one never changes the preset
- Hardcoded constants in code: Compare Cards' default weights and default assumed annual spend, the Annual Review's thresholds (25% lounge utilization, ₹3,000 fee, 2× net-value upgrade), and the day-15 default statement date

## UI Structure

- **Dedicated path** — `App.tsx`'s `credit-cards` tab renders `CreditCards.tsx` directly. It has its own inventory grid (stylized card faces), a multi-tab add/edit modal (`activeModalTab`: `general`, `rates`, `categories`, `milestones`, `partners`) whose General tab also shows the current cycle's real spend total and per-category breakdown, and the six page-level sub-tabs listed in Scope. On mount it fetches `spend-breakdown` for every card so the Simulator can enforce pooled caps.
- **Generic path** — `App.tsx`'s `liabilities` tab renders `EntityGrid.tsx` + `DynamicForm.tsx` for all liability categories. For Credit Cards, `EntityGrid` adds Credit Limit and Due Date columns, and `DynamicForm`'s `isCreditCard` branch drops the loan fields and shows the 7 basic card fields. Saves PUT those 7 fields to the satellite route (a partial update, so the reward config survives).
- **Transactions Ledger** (`TransactionsLedger.tsx`) — where `'Spend'` rows against a card are entered, with a category picker writing `transactions.category_id`.

Both card screens read the same `data.liabilities` array from `GET /api/init`, with `credit_card_details` columns flattened onto each card plus derived `real_cycle_spend_total`, `has_spend_transactions`, `cycle_start`, `cycle_end`, and `statement_spend_adjustment`.

## API Contracts

- `GET/POST/PUT/DELETE /api/entities/liabilities` — generic CRUD for the base liability row, used by both UIs.
- `GET /api/init` — returns each Credit Card liability with `credit_card_details` flattened on (overlaying any `metadata_json` keys) plus the derived cycle-spend fields above.
- `GET /api/liabilities/{id}/credit-card-details` — the satellite row, or `null`.
- `PUT /api/liabilities/{id}/credit-card-details` — upsert (`CreditCardDetailsSchema`). Partial update for an existing row; full insert with defaults for a new one. Maps `current_statement_spend` onto the balance-exempt adjustment transaction (create / update-and-redate only if the amount changed / delete when zeroed) and writes the column as 0. Forces the parent liability to `revolving_credit` with loan fields zeroed.
- `GET /api/liabilities/{id}/spend-breakdown` — `{cycle_start, cycle_end, total, by_category[]}` for the currently open cycle, computed live from `'Spend'` transactions. Deliberately on-demand rather than part of `/api/init`.
- `GET/POST/PUT/DELETE /api/card-variants` — Card Library CRUD.
- `POST /api/credit-cards/compare` — body: `owned_liability_ids`, `library_variant_ids` (2–5 total, else 400), optional `weights` and `assumed_annual_spend`.
- `GET /api/credit-cards/annual-review` — verdicts for all owned cards, or one via `?liability_id=`.
- `GET /api/calendar` — two Credit Card events per card per month over the next 12 months: `"{name} Payment Due (Billed)"` for `statement_balance` and `"{name} Payment Due (Unbilled)"` for `max(outstanding − statement_balance, 0)`, anchored to `credit_card_details.due_date`. Both UIs write that table, so every card with a satellite row and a due date appears.
- `/api/entities/transactions` — `'Spend'` rows are ordinary generic-ledger transactions, except that `is_balance_exempt` is stripped from payloads and preserved from the stored row.

## AI Responsibilities

The AI Assistant (`backend/ai/`, opt-in) can explain and answer questions over already-computed data. For card-related questions (`card`, `credit card` keywords), `backend/ai/context.py` includes liabilities and a sample of Card Library rows in the prompt context. It is read-only: it doesn't write card data, change rules, or produce verdicts of its own. The Simulator, Compare Cards, and Annual Review are deterministic code, not AI.

## Reports

- **Annual Review** is the closest thing to a card report: a per-card verdict list viewable in its tab. It isn't exportable.
- **Compare Cards** results are computed on demand and not persisted or exportable.
- There's no Excel/PDF export analogous to Loans' amortization export, and no utilization-history or spend-history report. Card balances and due dates feed the shared Financial Calendar and the dashboard's net-worth/total-liabilities figures.

## Future Enhancements

None of the following are built; each needs an explicit product decision, and per the legacy doc's guidance should extend the existing generic tables rather than introduce a parallel domain module:

- **Feed the spend ledger into the Annual Review** — it still uses manually-entered aggregates (its `caveat` field says so).
- **Accrue `reward_points` and `milestone_spend_current` from `'Spend'` transactions** instead of manual entry. This needs a per-transaction points record to be exact, since rates vary by milestone state at the time of each spend.
- **Surface Annual Review verdicts and utilization/fee-waiver risk in `generate_recommendations()`** so they appear proactively on the dashboard.
- **Decide the fate of the dead `reward_*` tables** — wire them up (fixing the dangling `financial_products` FK first) or remove them. The live reward engine doesn't need them.
- **Retire `PRESETS`** in favor of prefilling from Card Library variants, which already covers the same three cards.
- **Offer/merchant intelligence and portfolio-level reward optimization** — Phase 2/3 ideas in the legacy doc, no design work done beyond the phase list.
