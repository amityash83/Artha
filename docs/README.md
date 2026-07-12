# Financial Operating System (FOS) Specification Suite

Welcome to the official, authoritative specification repository for the Financial Operating System (FOS) / Artha.

## Project Vision
FOS is a localized, secure, and metadata-driven personal wealth manager, budget planner, and reward optimization calculator. It provides a cohesive, unified dashboard of net worth, cash flow trajectories, asset allocation, loan reduction strategies, and rewards maximization.

## Core Architectural Strategy
The system is built on a **local-first paradigm** using an SQLite database, a Python FastAPI sidecar backend, and a modern TypeScript React frontend. Rather than maintaining rigid SQL schemas for every bank's custom fields, the system uses a **metadata-driven design** where extra columns and variables are serialized into a single `metadata_json` text column, which is deserialized dynamically on the frontend.

## Documentation Structure
The documentation is organized in a modular structure where each file has a single responsibility. Follow the files below to understand the specification:

*   **[Vision](file:///d:/AI/Antigravity/Artha/docs/00-Vision.md):** Business vision, target audience, long-term goals.
*   **[Architecture](file:///d:/AI/Antigravity/Artha/docs/01-Architecture.md):** Layered design, domain division, coding standards.
*   **[Domain Model](file:///d:/AI/Antigravity/Artha/docs/02-Domain-Model.md):** Detailed business entities, fields, and relationships.
*   **[Business Rules](file:///d:/AI/Antigravity/Artha/docs/03-Business-Rules.md):** Salary allocations, loan amortization, and rewards yield mathematics.
*   **[Database](file:///d:/AI/Antigravity/Artha/docs/04-Database.md):** SQLite schemas, table constraints, indices.
*   **[API](file:///d:/AI/Antigravity/Artha/docs/05-API.md):** FastAPI REST endpoints, request/response models.
*   **[UI Design](file:///d:/AI/Antigravity/Artha/docs/06-UI-Design.md):** Layout templates, dynamic forms, menu routing, UX rules.
*   **[AI Architecture](file:///d:/AI/Antigravity/Artha/docs/07-AI-Architecture.md):** System prompt guidelines and context templates.
*   **[Integrations](file:///d:/AI/Antigravity/Artha/docs/08-Integrations.md):** SMS parsing, CSV formats, MMEX import spec.
*   **[Security](file:///d:/AI/Antigravity/Artha/docs/09-Security.md):** Backup, restore, local encryption policies.
*   **[Reward Engine](file:///d:/AI/Antigravity/Artha/docs/10-Reward-Engine.md):** Points multipliers, milestones, and redemption yields.
*   **[Loan Engine](file:///d:/AI/Antigravity/Artha/docs/11-Loan-Engine.md):** Amortization, prepayment effects, virtual loan simulations.
*   **[Investment Engine](file:///d:/AI/Antigravity/Artha/docs/12-Investment-Engine.md):** SIP/SWP models, XIRR equations.
*   **[Bucket Engine](file:///d:/AI/Antigravity/Artha/docs/13-Bucket-Engine.md):** Cash reserve and salary-driven funding rules.
*   **[Reporting Engine](file:///d:/AI/Antigravity/Artha/docs/14-Reporting-Engine.md):** Net worth projections and cash flow logs.
*   **[Roadmap](file:///d:/AI/Antigravity/Artha/docs/15-Roadmap.md):** Release plans, milestones.
*   **[TODO](file:///d:/AI/Antigravity/Artha/docs/16-TODO.md):** Actionable priorities list.
*   **[Decision Log](file:///d:/AI/Antigravity/Artha/docs/17-Decision-Log.md):** Records of key technical trade-offs.
*   **[Test Cases](file:///d:/AI/Antigravity/Artha/docs/18-Test-Cases.md):** Verifications suite.
*   **[Changelog](file:///d:/AI/Antigravity/Artha/docs/19-Changelog.md):** Historical modification log.
*   **[Memory](file:///d:/AI/Antigravity/Artha/docs/memory.md):** Persistent lessons-learned context log.

