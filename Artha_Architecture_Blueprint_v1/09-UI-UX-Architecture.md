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
breakpoints exist in `src/index.css` (zero `@media` queries found) — the
app assumes a desktop-class window. Electron's `BrowserWindow` is
created at a fixed `1440×900` with `autoHideMenuBar: true`; it's
resizable by the OS window manager but the UI itself doesn't adapt
layout at different widths.

## Design System

CSS custom properties in `src/index.css` define the token set: a dark
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

Not implemented. Confirmed via grep: zero `aria-*` attributes, zero
explicit `role=` attributes, anywhere in `src/`. No keyboard-navigation
handling beyond native browser/OS behavior for standard form elements
(`<input>`, `<select>`, `<button>`). This should be treated as a known
gap, not assumed to be "probably fine" — a genuine accessibility pass
has not been done.

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
