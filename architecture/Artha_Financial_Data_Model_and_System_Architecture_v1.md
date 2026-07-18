# Artha Financial Data Model & System Architecture (Draft v1.0)

> This document defines the long-term architecture of Artha before
> implementation. Principle: Model the financial domain first, then
> build modules on top of it.

------------------------------------------------------------------------

# 1. Product Vision

Artha is a Financial Intelligence Platform.

It is **not**: - A payroll application - An accounting system - A reward
optimization engine - A portfolio tracker replacing specialist tools

Instead, Artha consumes financial information from trusted sources and
provides planning, decision support, projections and insights.

MMEx remains the system of record for day-to-day accounting.

------------------------------------------------------------------------

# 2. Design Principles

1.  Single Source of Truth
2.  Domain-Driven Design
3.  Configuration over hardcoding
4.  AI assists, deterministic rules calculate
5.  Monthly maintenance under 15 minutes
6.  Modular architecture
7.  Read-only reference knowledge separated from user data

------------------------------------------------------------------------

# 3. Financial Domain Model

> Shipped vs. aspirational (2026-07): Income, Assets, Liabilities,
> Insurance, Goals, and the Decision Engine below are implemented today
> in `backend/db.py` (`income`, `assets`, `liabilities`, `goals` tables +
> `insurance_details` satellite) and `backend/decision_engine.py`.
> Financial Profile (Person/Family/Risk Profile), Taxes, and Knowledge
> Base have no schema or code yet — they are roadmap items, not
> current state. Don't assume a reader can `grep` for these and find
> them; check `backend/db.py`'s `init_db()` for the authoritative list
> of what tables actually exist.

Financial Profile - Person - Family - Goals - Risk Profile

Income - Salary History - Bonus - Variable Pay - Rental Income -
Interest - Dividend - Other Income

Assets - Bank Accounts - Investments - Properties - Gold - Cash

Liabilities - Home Loans - Vehicle Loans - Personal Loans - Overdraft

Investments - EPF - PPF - NPS - Mutual Funds - Stocks - Bonds - Gold

Insurance - Life - Health - Vehicle - Property

Taxes - Old Regime - New Regime - Tax Projection - Deductions - Refunds

Knowledge Base - Banks - Credit Cards - Loan Products - Tax Rules -
Financial Concepts

Decision Engine - Recommendations - Simulations - Annual Reviews

------------------------------------------------------------------------

# 4. Suggested Module Structure

Dashboard Financial Profile Banking Credit Cards Loans Investments
Insurance Properties Goals Documents Financial Calendar Knowledge Base
Reports Settings AI Assistant

------------------------------------------------------------------------

# 5. Salary Tracking

Track monthly salary snapshots only.

Recommended fields: - Month - Employer - Gross Salary - Net Salary -
Variable Pay - Bonus - Other Income

No payroll calculations.

------------------------------------------------------------------------

# 6. Investment Accounts

> Correction (2026-07): the shipped schema does **not** model investments
> as an Account Type. `accounts` is reserved for liquid/bank accounts
> (`current_balance`); investments are rows in the generic `assets`
> table, distinguished by `category_id` (EPF, PPF, NPS, Mutual Fund,
> Stock, Bond, Gold, Fixed Deposit are all existing seeded `categories`
> with `entity_type = 'Asset'` — see `backend/db.py`'s
> `default_categories`). Recurring Deposit and NPS Tier I/II are not yet
> seeded categories but would follow the same pattern.
>
> Mutual Fund/Stock additionally have a `holding_lots` satellite table
> (one row per purchase lot: date, quantity, price) so `assets.quantity`
> and `assets.cost_price` are derived/cached rather than hand-typed —
> this is what makes real per-holding return calculation possible later.

No account type/category should be hardcoded into the schema — adding a
new investment kind means adding a `categories` row + `fields_definition`
(and, only if its shape genuinely diverges like Stock/MF did, a new
satellite table), not a new top-level table.

------------------------------------------------------------------------

# 7. Tax Domain

Store: - Financial Year - Regime (Old/New) - Estimated Tax - Actual
Tax - Deductions - Capital Gains - Employer TDS - Refund

Tax calculations should be implemented as configurable business rules.

------------------------------------------------------------------------

# 8. Data Ownership

> Shipped vs. aspirational: `institutions` (banks/lenders) and
> `categories`/`financial_rules` are the only reference tables that
> exist today. A Credit Card *product* catalogue, Tax Rules, and Reward
> Programs are not yet built (see `Artha_Credit_Card_Architecture_v1.md`
> section 6 for how that should be added without breaking the generic
> ledger). "Credit Cards" as *user data* already exists — a user's own
> card is a `liabilities` row + `credit_card_details`, not reference
> data; only a future card-product library would be reference data.

Reference Data - Banks (`institutions`) - Categories/Rules - [future:
Card Product Library, Tax Rules, Reward Programs]

User Data - Salary - Investments - Loans - Insurance - Notes - a user's
own Credit Cards

Calculated Data - Net Worth - Retirement - Loan Simulations -
Recommendations

Never mix these layers.

------------------------------------------------------------------------

# 9. AI Boundaries

AI CAN: - Explain - Compare - Recommend - Summarize

AI MUST NOT: - Modify schema - Change deterministic calculations -
Rewrite architecture

------------------------------------------------------------------------

# 10. Roadmap

Phase 1 - Financial Profile - Banking - Loans - Investments - Dashboard

Phase 2 - Credit Cards - Insurance - Taxes - Goals

Phase 3 - AI Decision Engine - Simulations - Automation
