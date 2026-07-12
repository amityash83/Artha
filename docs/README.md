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
*   **[Memory Log](file:///d:/AI/Antigravity/Artha/docs/memory.md):** Session learning tracker and design constraints.

### Legacy Specification Archive
The complete set of design files created in the initial session (such as vision, REST endpoints, database tables, and engines) has been moved to:
*   **[Legacy Spec Folder](file:///d:/AI/Antigravity/Artha/docs/legacy_spec/):** Retained as reference sheets during the step-by-step enterprise transition.

