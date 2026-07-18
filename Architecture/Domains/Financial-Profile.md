# Financial-Profile Domain

## Purpose

A first-class representation of who the financial data belongs to —
the user themself, a spouse, dependents — and their goals/risk profile,
so multi-person households can be modeled accurately (e.g. whose
account is whose, whose goal is whose). Partially seeded in the schema,
not exposed anywhere in the product yet.

## Scope

A `people` table exists (`id`, `name`, `role` CHECK IN `'Primary Owner'`/
`'Spouse'`/`'Dependent'`) and `accounts.owner_id` / `portfolios.owner_id`
are NOT NULL FKs into it — so ownership attribution is structurally
present in the schema. **However, there is no CRUD route for `people`
anywhere in `backend/main.py`, and no UI to view, add, or edit a
person.** The only way a `people` row gets created today is a migration
default: the accounts-restructure migration seeds exactly one row
(`id=1`, name `'Amit'`, role `'Primary Owner'`) via `INSERT OR IGNORE`,
and force-assigns every pre-existing account to that one person. In
practice, every user of this app today has exactly one, hardcoded
"Amit"/Primary Owner person row, regardless of their actual name — this
is a real, verifiable gap worth flagging directly: the schema implies
multi-person support that doesn't functionally exist yet.

A `relationships` table also exists (`person_id`, `institution_id`,
`customer_identifier`) but is never seeded, migrated into, or referenced
by any route — fully inert schema today.

## Out of Scope

Risk Profile as a concept has no schema or code anywhere — it's
mentioned in `Artha.md`'s domain model list but nothing backs it. Family/
household-level aggregation (e.g. combined net worth across a Primary
Owner + Spouse) doesn't exist even though the `owner_id` FK would make
per-person filtering technically possible — no query in `main.py`
filters by `owner_id` today; every `/api/init` query returns all rows
regardless of owner.

## Business Objectives

If fully built: let a household track whose asset/account/goal is
whose, and see both individual and combined net worth. Today this is a
schema-level placeholder for that future, not a working feature — don't
assume "the schema has `owner_id`" means "multi-person tracking works,"
since no UI or query surfaces that dimension anywhere.

## Data Model

`people` (id, name, role) is the only real table. `role` is constrained
to exactly three values via a CHECK constraint — no custom roles.
`relationships` (person ↔ institution, with a customer identifier — e.g.
a bank's internal customer ID) is schema-only, unused.

## Database Schema

See `05-Database-Architecture.md`'s full inventory — `people` and
`relationships` table definitions are listed there under
Metadata/reference tables.

## Business Rules

None reference `people`/`role` at all — `decision_engine.py` treats all
accounts/assets/liabilities as belonging to one undifferentiated pool
regardless of `owner_id`.

## Configuration

None.

## UI Structure

None. No screen anywhere lets a user view or manage `people` rows —
the hardcoded "Amit"/Primary Owner seed is invisible to the user unless
they inspect the database directly.

## API Contracts

None — no `/api/entities/people` or equivalent route exists; `people`
is not in the generic entity router's allowed-table list.

## AI Responsibilities

None (see `07-AI-Architecture.md`).

## Reports

None — no per-person breakdown exists in any export or dashboard view.

## Future Enhancements

Real CRUD for `people` (add/edit a household member, not just the
migration-seeded default), UI to assign `owner_id` when creating an
account/asset, per-person and combined net-worth views, wiring
`relationships` to something meaningful (or removing it if it's not
going anywhere), and a genuine Risk Profile concept (currently
nonexistent) tied to Goals' existing `priority`/`expected_return`
fields.
