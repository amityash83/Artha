# 05-API - API Specifications

## Purpose
This document specifies the REST API endpoints, request/response models, payload validation rules, and error codes exposed by the FastAPI sidecar server.

## Scope
Covers all endpoints under `/api/*` used by the React web app.

## Definitions
*   **JSON payload:** The key-value structure passed in HTTP request/response bodies.
*   **HTTP 400 Bad Request:** Thrown for validation or constraint failures.

## Design Decisions
*   **Generic CRUD Routes:** To reduce code duplication, we expose general `/api/entities/{entity_type}` and `/api/metadata/{meta_type}` paths which resolve table names dynamically.

---

## Core Endpoints

### 1. Initialize Application
*   **Endpoint:** `GET /api/init`
*   **Purpose:** Consolidated payload loading all categories, institutions, accounts, assets, liabilities, goals, and monthly cash flow metrics on startup.
*   **Response Status:** `200 OK`
*   **Response Payload:**
    ```json
    {
      "categories": [],
      "institutions": [],
      "accounts": [],
      "assets": [],
      "liabilities": [],
      "goals": []
    }
    ```

### 2. General Entity CRUD
*   **Get Entities:** `GET /api/entities/{entity_type}`
    *   *Supported types:* `accounts`, `assets`, `liabilities`, `income`, `expenses`, `goals`, `transactions`
*   **Create Entity:** `POST /api/entities/{entity_type}`
    *   *Payload:* Key-value mapping of attributes. Non-schema columns are automatically packed into `metadata_json`.
*   **Update Entity:** `PUT /api/entities/{entity_type}/{id}`
*   **Delete Entity:** `DELETE /api/entities/{entity_type}/{id}`

### 3. Loan Simulations
*   **Endpoint:** `POST /api/simulations/loan`
*   **Request Payload:**
    ```json
    {
      "outstanding": 5000000.0,
      "interest_rate": 8.5,
      "emi": 45000.0,
      "prepayments": [
        {"month": 12, "amount": 100000.0}
      ]
    }
    ```
*   **Response Payload:**
    ```json
    {
      "original_months": 180,
      "simulated_months": 142,
      "original_interest": 3100000.0,
      "simulated_interest": 2200000.0,
      "interest_saved": 900000.0,
      "amortization_schedule": []
    }
    ```

---

## Examples
*   *Creating an Account:* `POST /api/entities/accounts` with payload `{"name": "Savings", "current_balance": 10000, "interest_rate": 3.0}`. The `interest_rate` is automatically packed into the metadata column.

## Future Enhancements
*   Adding API rate limiting and CORS origin constraints for production builds.
*   Integrating Swagger UI custom branding on `/docs`.

## Open Questions
*   Should we implement token-based session authentication for local sidecar calls, or is local binding (`127.0.0.1`) sufficient?
