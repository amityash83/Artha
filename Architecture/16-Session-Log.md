# Session Log

Narrative record of notable work sessions on Artha: what was built, what
was decided (and why), and what was explicitly deferred. This
complements `15-Roadmap.md` (which tracks *what's shipped vs. planned*)
with the *reasoning* behind decisions that isn't recoverable from git
history or the code alone — git tells you what changed, this tells you
why a particular design was chosen over the alternatives that were
considered.

Entries are added retroactively at natural checkpoints, not after every
commit — this is a decision log, not a changelog.

---

## 2026-07-18 — Branding, first pytest suite, Docker CI pipeline

### Configurable branding (logo + accent color)

The repo had one AI-generated logo (`artha-logo.png`, an ornate "growth
arrows + plant + hand + bar chart" composition) that didn't fit Artha's
calm/private/offline positioning. Rather than replace it with a single
new mark, the decision was to design 3 distinct mark concepts (Balanced
A, Vault Mark, Ledger Rule) and make **both the mark choice and the
accent color** user-selectable at runtime, not just at build time.

- `src/components/branding/ArthaMark.tsx` — one parameterized component,
  `variant: 'balanced-a' | 'vault' | 'ledger-rule'`, shared 88×88 icon /
  220×76 wordmark viewBoxes so all three drop into the same layout slots.
- `presets.ts` — 5 curated accent presets, deliberately not a free color
  picker (keeps every combination looking intentional rather than
  letting users pick illegible combinations).
- `useBranding.ts` — localStorage + a custom `window` event for
  cross-instance sync. A full React Context was considered and rejected:
  there are exactly two consumers (`App.tsx` sidebar, `Settings.tsx`
  picker), so the added ceremony wasn't justified.
- `public/favicon.png` — a static, build-time-only 512×512 PNG of the
  Vault Mark. `cairosvg` (the natural SVG→PNG tool) was tried first but
  needs a system `libcairo` not available in this environment and not
  installed (would be an unrequested system-level change); the favicon
  was instead hand-rendered directly with Pillow's `ImageDraw` primitives
  (rounded rect, polygon, ellipse) — the Vault Mark's geometry is simple
  enough that this was straightforward.
- The old `artha-logo.png` was deliberately left in place at repo root
  (not deleted) — the user's explicit choice when asked, kept as a
  reference/history asset.

**Scope boundary worth remembering**: in-app branding (mark + color) is
live-configurable; the app icon/favicon baked into installers is
static/build-time-only. These are two different mechanisms by design,
not an inconsistency — a per-user favicon isn't meaningful for a
packaged desktop app icon.

### First backend pytest suite

Before writing any test code, `backend/db.py`'s `get_db_path()` was
checked and found to resolve `~/.financeos/settings.json`'s
`active_db_path` **before** the `FINANCE_DB_DIR` env var. This dev
machine's real settings file already had a stale `active_db_path` set
from earlier manual testing — meaning a naive test-isolation strategy
built only around setting `FINANCE_DB_DIR` would have silently done
nothing, and tests would have run against whatever real DB that stale
path pointed to (or errored obscurely if it no longer existed).

The fix: `backend/tests/conftest.py`'s `test_db_path` fixture
monkeypatches `backend.db.get_db_path` itself, not the env var. This is
the one fixture every future backend test needing DB isolation must use.

First slice covers `calculations.py`'s pure functions (EMI, XIRR, tax
regimes, capital gains lot-matching), `init_db()` migration idempotency
(run twice, assert no duplicate seed rows), and two `TestClient` API
smoke tests. It is intentionally not comprehensive — most routes, the
double-entry ledger, `decision_engine.py`, and the AI Assistant routes
are still only manually verified (see `CLAUDE.md`). Not yet wired into
any CI workflow.

### Docker CI pipeline

Docker deployment itself (`backend/Dockerfile`, `frontend.Dockerfile`,
`docker-compose.yml`) already existed from an earlier session and was
**re-verified working end-to-end** in this session before adding CI:
both images were built standalone, then the full stack was brought up
via `docker compose up --build -d` on non-default ports (8210/8211) to
avoid colliding with anything else running locally, and both
`/api/init` (backend) and `/` (frontend) were curled and confirmed
HTTP 200, before tearing everything down cleanly.

Decisions made explicitly with the user (not assumed):

- **Registry: GHCR**, not Docker Hub — no new secrets needed beyond the
  already-available `GITHUB_TOKEN`, and since `Artha` is a private
  GitHub repo, pushed packages inherit private visibility automatically.
- **Triggers: push to `main` + `v*` tags only, no PRs** — Docker builds
  are slower than the desktop matrix, and the user chose to keep them
  off the PR critical path rather than mirror `build-and-publish.yml`'s
  PR trigger exactly.
- **A new, separate workflow file** (`docker-build.yml`), not a
  modification of `build-and-publish.yml` — the two pipelines produce
  categorically different artifacts (container images vs. desktop
  installers) and the user's phrasing ("create *another* pipeline")
  explicitly signaled a new file was wanted.
- The pytest suite is **not** wired in as a gate on this pipeline —
  it's a backend-CI concern, not a Docker-build concern, and conflating
  them wasn't asked for. A future `test.yml` is the natural place for
  that instead, if wanted.

### Standing instruction from this session

Never add `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` (or
any Co-Authored-By trailer) to commits in this repo — stated explicitly
and emphatically, applies to every commit going forward, no exceptions.

---

## 2026-10-10 / 11 — Tax planner, app-wide redesign, money-model corrections

### Tax planner (phases 1–4) — see `Domains/Taxation.md` for the design

- **Engine in Python, rules in versioned JSON**, one file per financial
  year, each figure tagged with how well it's verified. A test forbids
  numeric thresholds in `backend/tax/*.py`, so a new year never means a
  code change. Users edit copies stored in the DB; shipped files stay
  read-only, and saved scenarios snapshot the rule set they used.
- Everything derived (NPS scenarios, payslips, the savings waterfall,
  break-even, sensitivity) **re-runs the full engine** rather than using
  per-rupee shortcuts: surcharge thresholds and marginal relief make
  shortcuts wrong exactly where the answers matter.
- The EPF wage ceiling (₹15k → ₹25k from 17 Sep 2026, S.O. 5109(E)) is a
  dated EPFO rule in `tax/metadata/epf_rules.json`, separate from income-
  tax rules, marked as secondary-source until the gazette text is checked.

### Design pass

- One visual language across the app, taken from the redesigned Settings
  (the user liked MMEX's plain, quiet look): settings-style groups and
  rows, a summary strip at the top of each page, plain-English labels,
  delete inside the edit form, ₹ inputs with Indian grouping. Pages were
  rewritten in place; save paths and data shapes were left alone unless a
  bug was found on the way (each such fix is in its commit message).
- Merged overlapping pages: EMI Tool + Loan Optimizer → **Loan planner**;
  Monthly Snapshot → a "Record this month" panel on the Dashboard.
- A top bar (+ New, Ctrl/Cmd+K Go-to, database/backup chip) and Artha's
  own desktop menu replaced Electron's default; both drive one command
  handler (`App.runCommand`).

### Money-model decisions (the "why")

- **Savings rate counts money invested.** It is (income − spending − EMIs
  − premiums) ÷ income. Before, investing more lowered it, which
  contradicted the rule's own definition and punished the behaviour the
  rule exists to encourage. EMIs and premiums stay outflows: they are
  commitments, not choices to save.
- **A holding's risk is derived, not just stored** (`backend/risk.py`): a
  mutual fund's fund type, else a Low/High set by hand, else the usual
  risk of its kind. "Medium" is the column default, so on its own it says
  nothing. This let a goal say "only low-risk holdings" — a liquid fund
  can back an insurance reserve while an equity fund is flagged — which a
  category exclusion on "Mutual Fund" could not express. The fund type
  also fixes tax: debt/liquid funds no longer get 112A harvesting advice.
- **Several loans on one property.** `liabilities.linked_asset_id` already
  allowed it; only the forms limited it. A top-up is filed as a Home Loan
  (same property, same lender, and so it sits with the property), and a
  dedicated link route was added because the generic entity PUT rebuilds
  `metadata_json` from the payload and would wipe a loan's other fields
  on a partial save.
- **A home loan's tax treatment follows what the money was used for**, not
  its type: buying/building (24(b) + 80C), repairs (24(b) only, capped by
  a rule-file item), something else (neither), optionally only a share.
  Considered and rejected: a separate "Top-up" loan type (still needs the
  same field) and unticking in the planner each year (easy to forget).
- **EPF: balances, not a ledger.** One asset per PF member account (one
  UAN, one member ID per employer). The EPFO passbook is already the
  monthly ledger; copying it would duplicate and drift. The pension (EPS)
  share is recorded but kept out of net worth — it's an entitlement, not
  a withdrawable balance — and a transferred account counts as nil so a
  merge isn't double counted.
- **No invented figures.** Several screens pre-filled made-up numbers
  (₹1.5L salary in Cash Flow, ₹50k/month prepayment in the Loan
  Optimizer). They now start from the user's own data (last logged month,
  the Income & Expenses plan, last month's left-over) or from zero.

### Deferred

- Credit Cards' Library/Compare tabs, Simulations, Reports and Ask Artha
  still use the old styling. (Taxation's outer page was done the same day:
  Profile & Deductions and Old-vs-New Estimate merged into one "Quick
  estimate", since one was only the input form for the other.)
- The payslip view could show the employer's EPF/EPS split; tax doesn't
  need it.
- Mutual fund gains realised through the ledger are still classified by
  asset category, not fund type.
