# Domain Driven Design

Core domains, aggregates, entities, value objects, repositories,
services and bounded contexts.

---

## This is a documentation structure, not an implemented pattern

Despite the title, Artha's codebase does **not** implement Domain-Driven
Design in the classical sense — there are no aggregates, no repository
interfaces, no domain services, no bounded-context module boundaries in
`backend/` or `frontend/src/`. This was proposed once (in the legacy
`Architecture/Legacy/Artha_Credit_Card_Architecture_v1.md` draft, which laid out
a `domain/entities/`, `application/usecases/`, `infrastructure/
repositories/` folder tree) and deliberately not adopted — see
`00-Project-Constitution.md`'s Decision Records. The actual shape is a
flat FastAPI app (see `02-System-Architecture.md`).

This document uses DDD vocabulary loosely, as a way to talk about
concepts, not as a description of code structure. Read `Domains/*.md`
for what each "domain" actually is in code.

## What plays the role of an "Entity"

The closest thing to a DDD Entity is a row in one of the generic
ledger tables: `accounts`, `assets`, `liabilities`, `income`,
`expenses`, `goals`, `transactions`. Each has an `id` and persists
across requests, which is entity-like, but there is no in-memory object
model, no invariant-enforcing constructor, and no behavior attached to
these rows beyond what SQL and Pydantic request schemas provide.

## What plays the role of a "Value Object"

`categories.fields_definition` (a JSON schema describing a category's
extra fields) and a satellite table row (`insurance_details`,
`credit_card_details`, one `holding_lots` row) are the closest analogues
— data that's meaningful attached to an entity but not independently
identity-bearing in the UI. They are still plain dicts/rows in practice,
not typed value objects in either Python or TypeScript.

## What plays the role of "Aggregates"

None, formally. The closest pattern is: a `liabilities` or `assets` row
plus its 1:1 satellite table row (credit card details, insurance
details) are always read and written together by `/api/init` and the
satellite CRUD routes — that's an aggregate-like consistency boundary in
practice, but it's enforced by convention in `main.py`'s route bodies,
not by any structural guarantee.

## What plays the role of "Repository"

The `get_db_connection()` function in `backend/db.py` plus raw
`cursor.execute()` SQL inline in each route function in `main.py` — there
is no repository abstraction/interface. Every route talks to SQLite
directly.

## What plays the role of "Domain Service"

`backend/calculations.py` (pure financial math: EMI, XIRR, amortization,
tenure projections — no DB access) and `backend/decision_engine.py`
(reads `financial_rules` + entities via a raw cursor, returns
recommendation dicts) are the closest things to domain services. Both
are plain function modules, not classes/interfaces.

## Bounded Contexts

See `02-System-Architecture.md`'s Bounded Contexts section — the 13
`Domains/*.md` files are the bounded-context boundary that exists today,
and it exists only in documentation, not in code namespacing. Most
"domains" share the same two physical tables (`assets`, `liabilities`).

## When would introducing real DDD patterns make sense?

Only if the app outgrows a single-user, single-SQLite-file scope — e.g.
multi-tenant/advisor mode, or a plugin ecosystem needing enforced module
boundaries (see `12-Plugin-Architecture.md`). Until then, per
`00-Project-Constitution.md`, do not introduce a domain/application/
repository layering — it adds indirection with no corresponding benefit
at the current scale.
