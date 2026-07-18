# Plugin Architecture

Extension points, plugin lifecycle, module registration.

---

## Current State: No Plugin System Exists

Confirmed via grep: no plugin loader, no extension-point registry, no
module-registration mechanism anywhere in `backend/` or `src/`. The only
"plugin" matches in the codebase are Chart.js's own `plugins:` config
option (a Chart.js library concept, unrelated to Artha extensibility) —
not a false positive worth investigating further, just noise from the
search.

`Artha.md` lists "Modular Architecture" and "Open and Extensible" as
core principles, and separately lists aspirational future modules (Tax
Planning, Estate Planning, Business Finance, GST, Portfolio Rebalancer,
Expense Forecasting, Financial Risk Analysis). None of these have a
plugin/extension mechanism to attach to today — they would be built as
ordinary new screens/routes/categories using the existing patterns (see
below), not loaded through any plugin API, because no plugin API exists.

## What "Extensibility" Actually Means Today

Given there's no plugin system, extensibility in practice means: how
cheaply can a new financial concept be added using the existing generic
patterns, without a plugin mechanism at all.

- **Cheapest**: a new category under an existing entity type (new
  `categories` row + `fields_definition`) — no code change beyond a seed
  data addition. This is the primary "extension point" that exists.
  See `05-Database-Architecture.md`'s Table Strategy.
- **Moderate**: a new satellite table for a category whose shape
  genuinely diverges (the Credit Card/Insurance/Holdings precedent) —
  requires a schema migration + new routes + `DynamicForm`/`EntityGrid`
  branches, but follows an established, repeatable pattern.
- **Most expensive, and the actual shape of most real features today**:
  a bespoke new screen/component (like `CreditCards.tsx`,
  `BudgetPlanner.tsx`, `Simulations.tsx`) with its own state, its own API
  calls (usually still against the generic entity routes or a small
  number of new dedicated routes), added manually to `App.tsx`'s sidebar
  and tab-switch logic. This is a normal feature addition, not a
  "plugin" in any formal sense — there's no registration step beyond
  wiring it into `App.tsx` by hand.

## Module Registration

None. Every screen is imported and switched on directly in `App.tsx`
(`import { X } from './components/X'`, then
`{activeTab === 'x' && <X ... />}`). Adding a screen means editing
`App.tsx` in two places (sidebar item + content switch), not registering
it anywhere else.

## If a Real Plugin System Were Ever Built

Not scoped or designed — would be a significant new subsystem (likely
needing a manifest format, a load-order/dependency mechanism, and a
security boundary since a "plugin" with unrestricted DB access is
effectively unsandboxed code). Given the single-user, single-file
desktop-app scope, this has not been a priority, and per
`00-Project-Constitution.md`'s architecture governance, should not be
introduced speculatively — only if a genuine third-party extension use
case emerges.
