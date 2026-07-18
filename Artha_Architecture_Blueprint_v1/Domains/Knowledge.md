# Knowledge Domain

## Purpose

A reference layer of general financial/product knowledge (bank
products, loan product terms, tax rules, financial concepts) that other
domains could draw on — e.g. a Credit Card product catalogue, or
plain-language explanations of financial concepts surfaced alongside
recommendations. Not built today; described here per `Artha.md`'s
vision, not as a shipped capability.

## Scope

None — confirmed via repo-wide search: no `knowledge`-related table,
route, or component exists anywhere in the codebase.

## Out of Scope

Everything, since nothing exists. If built: this would be read-only
reference data (per `00-Project-Constitution.md`'s Reference Data vs.
User Data vs. Calculated Data principle) — never a place where user data
lives, and never editable through the normal entity CRUD flow.

## Business Objectives

If built: reduce the need for a user to look things up elsewhere for
common questions ("what's a good ROI threshold for prepaying," "what
does this loan term mean"), and give the Credit Cards domain a real
backing product catalogue instead of the hardcoded `PRESETS` array
currently embedded directly in `CreditCards.tsx` (see
`Domains/Credit-Cards.md`) or the dead `reward_programs` schema cluster
(see `05-Database-Architecture.md`) that references a never-created
`financial_products` table.

## Data Model

None exists. If built, this is the most natural home for the
`card_variants`/`reward_programs`/`reward_partners`-style reference data
that today either doesn't exist or exists as dead schema — see
`05-Database-Architecture.md`'s note that `reward_programs` currently
references a `financial_products` table that was never created. Fixing
that gap (creating `financial_products` and wiring the reward-schema
cluster to it) is arguably where a Knowledge domain would start, rather
than inventing an unrelated new schema from scratch.

## Database Schema

None functioning. The closest existing schema
(`reward_programs`/`reward_rules`/`reward_partners`/`reward_ledger`/
`reward_redemptions`) is unreachable dead code today — see
`05-Database-Architecture.md`.

## Business Rules

None.

## Configuration

None.

## UI Structure

None — the closest existing thing is `CreditCards.tsx`'s hardcoded
`PRESETS` array of real card templates (HDFC Infinia, Axis Magnus, SBI
Card ELITE, etc.), which is exactly the shape a Knowledge-domain-backed
Card Library would replace, per `Domains/Credit-Cards.md`.

## API Contracts

None.

## AI Responsibilities

None exist today (see `07-AI-Architecture.md`). If built, a Knowledge
domain is the most natural data source for an "explain" AI feature to
draw on (per the explain-vs-calculate boundary), since it would be
read-only reference text rather than a user's private financial data.

## Reports

None.

## Future Enhancements

A real Card Library / product catalogue (fixing the dead
`reward_programs`/`financial_products` schema gap), general financial
concept explainers, loan/tax product reference data. This overlaps
significantly with the "Card Library" scope already described in
`Domains/Credit-Cards.md`'s Future Enhancements — if both are pursued,
coordinate so the same reference schema serves both rather than building
two overlapping catalogues.
