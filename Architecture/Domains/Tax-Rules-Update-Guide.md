# Updating Tax Rules for a New Financial Year

Tax figures (slabs, rebates, surcharge, cess, deduction limits, HRA cities) live in versioned rule sets, never in code. There are two ways to update them.

## Option A: in the app, without code (users)

Use this to model a Budget proposal early, or to correct a figure before an official file ships.

1. **Taxation → Tax Rules**: find the latest official set and click **Copy**.
2. Choose **Financial year → (draft next year)**. Every value in the copy starts as an *assumption* (it was only confirmed for the earlier year).
3. **Edit** the copy: slab tables, limits, city lists, each item's source, sections and note. Unsaved changes are listed before you save; each save is a new version, and changed values are automatically tagged *user-entered*.
4. **Use for FY 20XX-YY** to make the planner and estimates use it for that year. Clicking **Use for FY 20XX-YY** on the official set switches back.
5. Saved scenarios keep the exact version they were computed with; **Recalculate** on a scenario re-runs it under whatever rules now apply.

## Option B: ship a new official rule file (developers)

1. **Copy the latest file**: `backend/tax/rules/IN-TY2026-27.json` → `IN-TY2027-28.json` (any file name works; `financial_year` inside must be unique across files).
2. **Update the header**: `rule_set_id`, `version` (start at 1), `financial_year`, `assessment_year`, `act`, `effective_from`/`effective_to`, `status_note`, and `sources` (official sources first, with `accessed` dates and `"official": true`).
3. **Update each item** that changed. For every item set:
   - `value`: the figure (brackets are `[upper_bound, rate_pct]` pairs, last upper bound `null`; surcharge tiers are `[threshold, rate_pct]`, ascending);
   - `verification`: `verified` only when confirmed against an official text (the Act, Finance Act, Rules, or incometax.gov.in / PIB); `secondary_source` when consistent across reputable secondary sources; `unverified` or `assumption` otherwise. Never `user_entered` (the loader rejects it in shipped files);
   - `legacy_section` / `act_2025_section` and `source` (an id from `sources`), plus a `note` for anything subtle.
4. **Check items carried over unchanged**: if not re-confirmed for the new year, downgrade their verification honestly.
5. **Run the tests**: `pytest backend/tests/test_tax_rules.py` validates every rule file (required items, ascending slabs, known source ids) and that no thresholds crept into code. Add hand-computed expectations for the new year to `test_tax_engine.py` (at least: a rebate edge, a surcharge threshold with marginal relief, an old-regime case).
6. **Packaging**: nothing to do. `backend/tax/rules/` is already bundled by the `build:backend*` scripts (`--add-data`); the app lists the new year automatically.

## Optional items

`advance_tax` (threshold, instalment dates and cumulative %, safe harbours, interest rates and rounding) and `return_due_date` are optional, so older rule sets and users' copies stay valid; the Advance Tax tab says when a year's set lacks them. Check both each year: return due dates are often extended.

## What the engine reads

See the item list in `backend/tax/rules_loader.py` (`REQUIRED_TOP_LEVEL`, `REQUIRED_REGIME_ITEMS`) and how each is used in `backend/tax/engine.py`. If a new kind of rule is needed (a new deduction, a new cap), add the item to the rule files and the logic to the engine together, with tests; the generic rule editor in the app will show the new item without UI changes.
