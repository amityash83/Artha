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
