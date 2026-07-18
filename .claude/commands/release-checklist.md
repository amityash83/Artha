---
description: Pre-packaging verification pass for Artha — typecheck, backend tests, version consistency, and a reminder of what CI does and does not verify before cutting a release
allowed-tools: Bash(npx tsc:*), Bash(pytest:*), Bash(git tag:*), Bash(git log:*), Bash(git status:*)
---

## Context

- Current version in package.json: !`grep -m1 '"version"' package.json`
- Existing git tags: !`git tag --sort=-creatordate | head -5`
- Working tree status: !`git status --short`

## Your task

Run through this checklist before the user cuts a `vX.Y.Z` release tag or does a manual package build. Report each step's pass/fail plainly; do not silently skip a step.

1. **Working tree is clean** (or the user has explicitly said uncommitted changes are expected). Uncommitted changes at release time is worth flagging, not blocking.
2. **Frontend typecheck**: `npx tsc --noEmit` (or `npm run build:frontend` if a full build is wanted) — must pass with zero errors.
3. **Backend tests**: `pytest` from repo root — must pass. Note in the report that this suite is not yet comprehensive (see CLAUDE.md) — passing tests is necessary, not sufficient.
4. **Version consistency**: the version in `package.json` should match the tag about to be pushed (e.g. `package.json` says `1.0.4` → tag should be `v1.0.4`). Flag a mismatch rather than silently proceeding.
5. **Known-provisional CI legs**: remind the user that per CLAUDE.md, the macOS/Linux legs of `build-and-publish.yml` were last known to be provisional until confirmed green by an actual Actions run — check recent Actions run history if `gh` is available (`gh run list --workflow=build-and-publish.yml --limit 5`) and report their actual status rather than assuming.
6. **Docker image pipeline**: if this release should also refresh the GHCR images, note that `docker-build.yml` triggers automatically on the same tag push — no separate manual step needed, but worth confirming after the push that it ran (`gh run list --workflow=docker-build.yml --limit 3`).
7. **Do not push the tag yourself.** This command verifies readiness only — creating/pushing a `v*` tag is a release action the user should trigger explicitly, per this repo's standing rule of confirming before actions with real, hard-to-reverse consequences (a pushed tag triggers a public-ish GitHub Release + Docker image publish).

Summarize as a short punch list: what passed, what failed, what's unverified/provisional, and what the user still needs to decide (mainly: push the tag or not).
