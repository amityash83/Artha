# Financial Data Model

Canonical financial entities: Income, Assets, Liabilities, Investments,
Insurance, Taxes, Goals, Credit Cards, Knowledge.

---

> Grounded against `backend/db.py` as of 2026-07. This schema has moved
> significantly since earlier drafts of Artha's docs — most notably,
> `accounts.current_balance` is no longer a stored column at all, and
> `transactions` now uses a proper double-entry `source_ref`/`dest_ref`
> shape. If you're reading an older doc that describes `account_id` +
> `related_entity_id` on transactions, or a stored `current_balance` on
> accounts, that's stale — this file reflects the current shape.

## Canonical Entities

**People** (`people`): a lightweight ownership dimension — `name`,
`role` (`Primary Owner` | `Spouse` | `Dependent`). Every `accounts` and
`portfolios` row has an `owner_id` FK into this table. A default
"Primary Owner" person (id=1) is seeded by the accounts-restructure
migration for backward compatibility with pre-existing single-owner
data.

**Institutions** (`institutions`): shared reference table for
banks/lenders/AMCs — `name`, `type` (default `'Bank'`). Used by
`accounts.institution_id`, `assets.institution_id`,
`liabilities.lender_institution_id`.

**Accounts** (`accounts`): liquid/bank accounts. `name`, `institution_id`,
`owner_id`, `status` (`Active`/`Closed`), `currency`. **No stored
balance** — `current_balance` is computed live on every read as
`SUM(transactions where dest_ref = this account) − SUM(transactions
where source_ref = this account)`. See Database Architecture for the
exact query.

**Assets** (`assets`): the generic ledger for everything that grows or
holds value — Investments (Mutual Fund/Stock/Gold/EPF/PPF/NPS/Fixed
Deposit/Bond), Properties, Insurance policies. Distinguished only by
`category_id`. `current_value` and `outstanding`-adjacent fields here
*are* mutated directly by transactions (unlike accounts).

**Liabilities** (`liabilities`): the generic ledger for debt — Home/
Personal/Car Loans and Credit Cards, distinguished by `category_id` and
(for Credit Cards) `liability_kind = 'revolving_credit'`.

**Income** (`income`) / **Expenses** (`expenses`): per-item recurring
cash-flow entries, each with `category_id`, `amount`, `frequency`.
Expenses additionally support a `parent_category_id` self-reference (for
nested categories) and `linked_liability_id` (e.g. tying an EMI expense
to its loan).

**Goals** (`goals`): target-based savings objectives — `target_amount`,
`current_amount`, `monthly_contribution`, `target_date`, `priority`,
plus retirement/inflation-projection fields (`expected_return`,
`inflation`).

**Transactions** (`transactions`): the double-entry ledger — see
Database Architecture for full shape. This is the single source of truth
for account balances; it also directly mutates `assets.current_value`
and `liabilities.outstanding` for Buy/Sell/Investment/Redemption/EMI/
Prepayment transaction types.

**Portfolios** (`portfolios`, `portfolio_holdings`) and **Goal Holdings**
(`goal_holdings`): many-to-many linking tables letting one `assets` row
be grouped into a named portfolio, and/or attributed (with an
`allocation_weight`) toward one or more goals' progress.

**Insurance** — not a separate table; an `assets` row with
`category_name = 'Insurance'` plus a 1:1 `insurance_details` satellite
carrying the `policy_type` (Life/Term/Health/Vehicle) sub-discriminator
and type-specific fields.

**Credit Cards** — not a separate table; a `liabilities` row with
`category_name = 'Credit Card'` plus a 1:1 `credit_card_details`
satellite. **Caveat**: a second, independent persistence path also
exists for this same entity — see `Domains/Credit-Cards.md` for a
documented dual-write issue between the generic entity path and the
dedicated `CreditCards.tsx` screen.

**Taxes** — no schema exists. See `Domains/Taxation.md`; this is
roadmap only.

**Knowledge Base** — no schema exists. See `Domains/Knowledge.md`;
roadmap only.

## Reference Data vs. User Data vs. Calculated Data

- **Reference data**: `institutions`, `categories` (+ `fields_definition`),
  `financial_rules` (defaults, though user-editable). Genuinely
  reference/lookup, not owned by a single record.
- **User data**: every row in `accounts`, `assets`, `liabilities`,
  `income`, `expenses`, `goals`, `transactions`, `people`, `portfolios`,
  `credit_card_details`, `insurance_details`, `holding_lots`.
- **Calculated data**: `accounts.current_balance` (fully derived, not
  stored), net worth / total_assets / total_debt (computed per-request
  in `/api/init`), `holding_lots`-derived `assets.quantity`/`cost_price`
  (cached/recomputed on lot write, not independently user-editable once
  lots exist), and all `decision_engine.py` recommendations.
- **Legacy/backward-compatibility only**: `snapshots` and
  `monthly_cash_flows` are explicitly commented in `db.py` as kept for
  backward compatibility — see Database Architecture for whether they're
  still actively written.

## Dead/Unreachable Schema (documented, not hidden)

`reward_programs` → `reward_rules`/`reward_partners`/`reward_ledger`/
`reward_redemptions`: this entire 5-table cluster hinges on
`reward_programs.product_id REFERENCES financial_products(id)`, and
`financial_products` is never created anywhere in `db.py`. No seed data
populates any of these tables. This is unreachable schema today, not a
working feature — do not build against it without first deciding whether
to finish it (create `financial_products`, wire up routes) or remove it.
The credit card reward-optimization UI that does exist (`CreditCards.tsx`)
does not use these tables at all — see `Domains/Credit-Cards.md`.

`relationships` and `portfolios`/`portfolio_holdings`: created, but
`db.py` never seeds or migrates data into them (no backfill analogous to
`goal_holdings`' metadata-sync step). Whether any route in `main.py`
actively reads/writes them is a `main.py`-level question, not confirmed
here — check before assuming they're live.

## Cross-Entity Relationships

```
people ──< accounts (owner_id)
people ──< portfolios (owner_id)
institutions ──< accounts, assets, liabilities
categories ──< assets, liabilities, income, expenses
assets ──< holding_lots (Stock/Mutual Fund only)
assets ──1:1── insurance_details (Insurance only)
liabilities ──1:1── credit_card_details (Credit Card only)
liabilities.linked_asset_id ──> assets (Home Loan ←→ Property, one direction only)
expenses.linked_liability_id ──> liabilities
expenses.parent_category_id ──> expenses (self-reference, nested categories)
goals ──< goal_holdings >── assets (many-to-many, allocation_weight)
portfolios ──< portfolio_holdings >── assets (many-to-many)
transactions.source_ref / dest_ref ──> accounts OR assets (polymorphic, type-tagged)
transactions.linked_goal_id ──> goals
```
