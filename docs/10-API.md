# 10-API - API Specifications

## Purpose
This document specifies the REST API endpoints, request/response models, validation rules, and error codes exposed by the sidecar backend server to the React frontend.

## Scope
Covers all paths under `/api/*` used for operational ledger activities and configuration adjustments.

## Definitions
*   **Response Payload:** The JSON object returned in the response body.
*   **Path Parameter:** A variable segment embedded in the URL path (e.g. `{entity_type}`).

## Design Decisions
1.  **Strict REST Architecture:** Standard HTTP methods (`GET`, `POST`, `PUT`, `DELETE`) correspond directly to database operations.
2.  **No Direct Database Mutation:** Complex operations (such as processing double-entry transactions) are mapped to dedicated endpoints that perform validations before committing to the database.

---

## Endpoint Specifications

### 1. Unified Application Initialization
*   **Endpoint:** `GET /api/init`
*   **Purpose:** Fetches all master data, configurations, and derived balances to initialize the frontend state in a single call.
*   **Response Payload:**
    ```json
    {
      "people": [],
      "institutions": [],
      "accounts": [],
      "products": [],
      "goals": [],
      "portfolios": [],
      "assets": [],
      "liabilities": [],
      "config": {}
    }
    ```

### 2. Generic Master Data CRUD
*   **Endpoint:** `/api/entities/{entity_type}`
    *   *Path Parameters:* `entity_type` (e.g. `people`, `institutions`, `relationships`, `accounts`, `products`, `goals`, `portfolios`)
*   **Retrieve All:** `GET /api/entities/{entity_type}`
*   **Create Instance:** `POST /api/entities/{entity_type}`
    *   *Request Payload:* Fields mapping directly to columns.
*   **Modify Instance:** `PUT /api/entities/{entity_type}/{id}`
*   **Remove Instance:** `DELETE /api/entities/{entity_type}/{id}`

### 3. Transaction Ledger Actions
*   **Record Transaction:** `POST /api/transactions`
    *   *Request Payload:*
        ```json
        {
          "source_ref_type": "Account",
          "source_ref_id": 1,
          "dest_ref_type": "Asset",
          "dest_ref_id": 3,
          "type": "Buy",
          "amount": 15000.0,
          "transaction_date": "2026-07-13",
          "notes": "Monthly Mutual Fund investment",
          "linked_goal_id": 2
        }
        ```
    *   *Validations:* Verifies that source and destination references are active and have sufficient balances or quantities.
    *   *Response:* `201 Created` with the committed ledger ID.

### 4. Loan Prepayment Simulation
*   **Simulate Prepayments:** `POST /api/simulations/loan`
    *   *Request Payload:*
        ```json
        {
          "liability_id": 2,
          "prepayment_plan": [
            {"month_index": 12, "amount": 50000.0}
          ]
        }
        ```
    *   *Response:* Computes simulated closure month, total interest paid under simulation, and cumulative savings.

### 5. Spend Reward Optimizer
*   **Calculate Rewards:** `POST /api/simulations/rewards`
    *   *Request Payload:*
        ```json
        {
          "amount": 25000.0,
          "category": "Dining",
          "strategy": "Travel"
        }
        ```
    *   *Response:* Returns a ranked list of registered card accounts, their calculated points yield, and estimated value.

---

## Examples
*   *Failing Validation:* Attempting `POST /api/transactions` with a negative amount returns `400 Bad Request` containing: `{"detail": "Transaction amount must be greater than zero."}`.

## Future Enhancements
*   Implementing GraphQL queries for custom reports compilation.
*   Adding API endpoints to export backup files directly to user directories.

## Open Questions
*   Should the transactions GET API support server-side pagination, or is client-side sorting sufficient for typical ledger counts?

## References
*   *FastAPI Request Validation Models (Pydantic)*
*   *HTTP Status Codes Standards (RFC 7231)*
