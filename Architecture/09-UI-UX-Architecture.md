# UI/UX Architecture

Navigation, layouts, design system, accessibility, responsive behavior.

---

## Navigation

A single fixed left sidebar (`App.tsx`) with a flat list of tabs
(no nested navigation, no breadcrumbs): Dashboard, Snapshot, Cash Flow,
Transactions, Budget Planner, Financial Calendar, Accounts, Assets,
Liabilities, Credit Cards, Goals, Simulations, EMI Calculator, Loan
Optimizer, Reports. `activeTab` is plain component state — no router
library (no React Router), no deep-linkable URLs, no browser back/
forward support. Switching tabs is a full component swap, not a route
transition.

## Layout

Two-region layout: fixed sidebar + main content area, both rendered from
one top-level `App.tsx` after the `/api/init` payload loads (see
`02-System-Architecture.md`'s startup sequence). No responsive
breakpoints exist in `frontend/src/index.css` (zero `@media` queries found) — the
app assumes a desktop-class window. Electron's `BrowserWindow` is
created at a fixed `1440×900` with `autoHideMenuBar: true`; it's
resizable by the OS window manager but the UI itself doesn't adapt
layout at different widths.

## Design System

CSS custom properties in `frontend/src/index.css` define the token set: a dark
"Glassmorphism" theme (`--bg-primary: #07090e`, `--bg-glass: rgba(13,
17, 29, 0.7)`), a purple/pink accent gradient (`--accent: #8b5cf6` →
`--accent-gradient: linear-gradient(135deg, #8b5cf6, #ec4899)`), and
semantic status colors (`--success`, `--warning`, `--danger`, `--info`,
each with a paired `-bg` translucent variant used for
recommendation/status badges). There is no light theme — dark mode is
the only mode, not a toggle.

Two generic components carry almost the entire CRUD UI:
`EntityGrid.tsx` (data table + category tabs + search + add/edit/delete
actions) and `DynamicForm.tsx` (the add/edit modal, category-aware field
rendering). See `10-Configuration-Architecture.md` for how the
metadata-driven field/column resolution works. Everything else
(`Dashboard.tsx`, `Reports.tsx`, `CreditCards.tsx`, `EmiCalculator.tsx`,
`Simulations.tsx`, `CashFlowPlanning.tsx`, etc.) is a bespoke,
purpose-built screen, not a generic-component instance — Artha's "one
generic form/grid for everything" pattern applies to the simpler
domains (Accounts, Assets, Liabilities-as-loans, Goals), not to the
more elaborate ones (Credit Cards, Reports/Settings, Simulations).

Charts are rendered via Chart.js (`react-chartjs-2`) —
`Dashboard.tsx` (net worth trend, asset allocation), `LoanOptimizer.tsx`
and `Simulations.tsx` (payoff/projection curves).

## Accessibility

A first hardening pass has been done, scoped to shared-pattern fixes
rather than an exhaustive per-screen audit:

- **Modal/dialog semantics**: all 6 overlay call sites across the app
  (`AIExplainButton.tsx`, `InfoTooltip.tsx`, `TransactionsLedger.tsx`,
  `CreditCards.tsx`, `EntityGrid.tsx`, `creditcards/CardLibraryTab.tsx`)
  use a shared `useModalA11y` hook (`frontend/src/hooks/useModalA11y.ts`) that adds
  Escape-to-close, a Tab/Shift+Tab focus trap, and focus restore to the
  previously-focused element on close, plus `role="dialog"`,
  `aria-modal="true"`, and `aria-labelledby`/`aria-label` on each
  overlay's content panel. This was a deliberate hook rather than a
  shared `<Modal>` component — the 6 call sites have different enough
  visual shells that consolidating them into one component's prop
  contract would have been a bigger restructure than the accessibility
  fix itself required.
- **Sidebar navigation**: all `App.tsx` sidebar items carry
  `aria-current="page"` on the active tab, alongside the existing
  className-based active-state styling.
- **Form labels**: `<label>`/`<input>` pairing via `htmlFor`/`id` was
  swept across every static form field in `DynamicForm.tsx`,
  `Settings.tsx`, `Taxation.tsx`, `CreditCards.tsx`, and
  `creditcards/CardLibraryTab.tsx`. Looped/repeated row editors
  (`HoldingLotsEditor.tsx`, `TaxDeductionsEditor.tsx`,
  `InsuranceClaimsEditor.tsx`, `InsurancePremiumPaymentsEditor.tsx`,
  `PropertyRentalLedgerEditor.tsx`) use per-row `aria-label`s instead,
  since their inputs rely on `placeholder` text with no visible
  `<label>` to pair — adding one would have been a visual change beyond
  an accessibility-only fix.
- **Focus/motion**: a global `:focus-visible` outline rule was added to
  `frontend/src/index.css` (keyboard-only, so mouse clicks don't get a
  distracting ring) alongside a `prefers-reduced-motion` media query
  that collapses all animations/transitions to near-zero duration.

Known gaps still open, deliberately out of scope for this pass: no
Chart.js canvas accessible-description work (`Dashboard.tsx`,
`LoanOptimizer.tsx`, `Simulations.tsx` charts remain opaque to screen
readers), no `role="tablist"`/`role="tab"` conversion of in-page tab
switchers, no conversion of the sidebar's clickable `<div>` items to
native `<button>` elements (they already work via `onClick` and now
carry `aria-current`, but lack native keyboard activation semantics —
a real gap, just not one of the fixes made here), and no automated
accessibility testing/CI integration (no test suite exists in this repo
at all). Treat this as "meaningfully improved," not "audited/complete."

## Responsive Behavior

Not implemented, by design (see `Layout` above) — this is a desktop
application built for a fixed-size window, not a responsive web layout.
The web/Docker deployment path (`08-Technology-Architecture.md`) serves
the identical, non-responsive frontend build in a browser tab; it does
not add responsive breakpoints for narrower viewports (e.g. mobile
browser access is not a supported use case today).

## Toast/Feedback Pattern

Several screens accept an optional `showToast(msg, type)` callback
(`'success' | 'error' | 'info'`) threaded down from `App.tsx` for
non-blocking feedback on save/delete actions, falling back to a native
`window.alert()`/`window.confirm()` where `showToast` isn't wired
through (an inconsistency worth normalizing — some newer screens use
toast, some older/simpler ones still use browser-native dialogs).
