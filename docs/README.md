# Financial Operating System (FOS) Specification Suite

Welcome to the official, authoritative specification repository for the Financial Operating System (FOS) / Artha.

## Project Vision
FOS is a localized, secure, and metadata-driven personal wealth manager, budget planner, and reward optimization calculator. It provides a cohesive, unified dashboard of net worth, cash flow trajectories, asset allocation, loan reduction strategies, and rewards maximization.

## Core Architectural Strategy
The system is built on a **local-first paradigm** using an SQLite database, a Python FastAPI sidecar backend, and a modern TypeScript React frontend. Rather than maintaining rigid SQL schemas for every bank's custom fields, the system uses a **metadata-driven design** where extra columns and variables are serialized into a single `metadata_json` text column, which is deserialized dynamically on the frontend.

## Documentation Structure
The documentation is organized strictly under the **Enterprise Design Methodology** steps:

*   **[Step 0 - Financial Concepts](file:///d:/AI/Antigravity/Artha/docs/00-Financial-Concepts.md):** Conceptual definitions, terms, and core business vocabulary.
*   **[Step 1 - Business Object Model](file:///d:/AI/Antigravity/Artha/docs/01-Business-Object-Model.md):** Object boundaries, encapsulation limits, and ownership profiles.
*   **[Step 2 - Relationship Model](file:///d:/AI/Antigravity/Artha/docs/02-Relationship-Model.md):** Connections, reference scopes, and logical diagrams.
*   **[Step 3 - Domain Model](file:///d:/AI/Antigravity/Artha/docs/03-Domain-Model.md):** Software entities, validations, lifecycles, and relational constraints.
*   **[Step 4.1 - System Business Rules](file:///d:/AI/Antigravity/Artha/docs/04-System-Business-Rules.md):** Core, un-opinionated application behaviors and transaction immutability.
*   **[Step 4.2 - Financial Policies](file:///d:/AI/Antigravity/Artha/docs/05-Financial-Policies.md):** Supported financial strategies and allocation templates.
*   **[Step 4.3 - User Configuration](file:///d:/AI/Antigravity/Artha/docs/06-User-Configuration.md):** Stores customized ratios, safety multiples, and goal limits.
*   **[Step 4.4 - Recommendation Engine](file:///d:/AI/Antigravity/Artha/docs/07-Recommendation-Engine.md):** AI advisor advisory rules, rebalancing triggers, and card spend yields.
*   **[Step 5 - Workflows](file:///d:/AI/Antigravity/Artha/docs/08-Workflows.md):** Operational execution sequences and dynamic event charts.
*   **[Step 6 - Database Design](file:///d:/AI/Antigravity/Artha/docs/09-Database.md):** Normalized SQLite tables schemas, constraints, and indices.
*   **[Step 7 - API Design](file:///d:/AI/Antigravity/Artha/docs/10-API.md):** REST API endpoints, request/response models, and validations.
*   **[Step 8.1 - User Experience](file:///d:/AI/Antigravity/Artha/docs/11-User-Experience.md):** Personas, user journeys, navigation models, and workflows.
*   **[Step 8.2 - Screen Specifications](file:///d:/AI/Antigravity/Artha/docs/12-Screen-Specifications.md):** Purpose, data displays, filters, and actions for each screen view.
*   **[Step 8.3 - UI Design System](file:///d:/AI/Antigravity/Artha/docs/13-UI-Design-System.md):** Design tokens, primary colors, typography scales, and cards styling.
*   **[Step 8.4 - Form Engine](file:///d:/AI/Antigravity/Artha/docs/14-Form-Engine.md):** Metadata-driven form validations and dynamic layout parameters.
*   **[Step 9 - AI Architecture](file:///d:/AI/Antigravity/Artha/docs/15-AI.md):** Prompt strategy, context limits, planning models, and forecasting.
*   **[Memory Log](file:///d:/AI/Antigravity/Artha/docs/memory.md):** Session learning tracker and design constraints.

### Legacy Specification Archive
The complete set of design files created in the initial session (such as vision, REST endpoints, database tables, and engines) has been moved to:
*   **[Legacy Spec Folder](file:///d:/AI/Antigravity/Artha/docs/legacy_spec/):** Retained as reference sheets during the step-by-step enterprise transition.

