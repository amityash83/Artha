# 15-Roadmap - Release Milestones & Roadmap

## Purpose
This document details current product versions, future releases, functional milestones, and scheduled enhancements for FOS.

## Scope
Covers short-term and long-term release milestones.

## Definitions
*   **Version 1.0:** The core system with basic account, asset, liability tracking.
*   **Version 2.0:** The advanced edition introducing reward simulations, step-ups, and automated loan optimization.

## Design Decisions
*   **Sequential Implementation Phases:** Development is divided into logical phases (e.g. database schema migrations first, frontend widgets next, mathematical validation calculators last) to prevent code regressions.

---

## Release Milestones

### Phase 1: Core Asset / Debt Ledger (v1.0.0) [Completed]
*   Basic CRUD operations for accounts, categories, assets, and liabilities.
*   Monthly cash flows logger.
*   Local database settings and backup mechanisms.

### Phase 2: Optimization Engines (v2.0.0) [Active]
*   Redesigned credit card engine with presets (Infinia, Magnus, Elite).
*   Detailed card metrics grids (lounges, waiver progress, points values).
*   Mathematical transaction simulators comparing redemption strategies.
*   Alphabetical sorting across bank dropdowns.

### Phase 3: AI Conversational Helper (v3.0.0) [Future]
*   Local quantized LLM parsing statement uploads.
*   Voice-command transaction logging.

---

## Examples
*   *Adding a Preset:* Integrating SBI Elite presets into Phase 2 active release milestones.

## Future Enhancements
*   Cross-platform mobile wrapper build targets.

## Open Questions
*   Should we prioritize SMS transaction scraping in Phase 3, or move it to a later phase?
