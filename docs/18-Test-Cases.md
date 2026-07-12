# 18-Test-Cases - Verification Specifications

## Purpose
This document specifies functional test cases, business rule verifications, edge-case math checks, and database validation tests.

## Scope
Covers manual and automated unit testing procedures.

## Definitions
*   **Edge Case:** Scenarios operating at limits (e.g. 100% credit card utilization, zero interest rates).
*   **Regression Test:** Verification ensuring changes do not break pre-existing functionalities.

## Design Decisions
*   **Isolated Data Testing:** Using a separate temporary database (`test_finance.db`) during automated tests to avoid corrupting user records.

---

## Key Test Cases

### 1. Credit Card Rewards Simulator Math Check
*   **Type:** Functional / Business Rule
*   **Setup:** Register card with base rate: 5 points / ₹150 spend. Point Value = ₹1.0. Category dining multiplier = 5X.
*   **Input:** Simulated transaction of ₹3,000 in Dining category.
*   **Expected Output:**
    *   Raw points earned: $\text{floor}(3000 / 150) \times 5 \times 5 = 500$ points.
    *   Cash value: ₹500.
    *   Effective Yield Rate: 16.67%.

### 2. Category Exclusions Check
*   **Type:** Edge Case
*   **Setup:** Card category 'Fuel' has `isExcluded: true` in metadata rules.
*   **Input:** Simulated transaction of ₹5,000 in Fuel category.
*   **Expected Output:** Yield = 0%, points earned = 0.

### 3. Step-up Milestone Threshold Check
*   **Type:** Functional / Integration
*   **Setup:** Card current statement spend = ₹1,40,000. Milestone threshold = ₹1,50,000 (bonus rate: 35 pts / 200 spend).
*   **Input:** Transaction of ₹20,000.
*   **Expected Output:** Simulated project spend = ₹1,60,000. Milestone rule gets triggered, applying the 35/200 points rate.

---

## Examples
*   *Verification execution:* Running `pytest backend/tests/` to verify that loan tenure calculations return mathematically correct months.

## Future Enhancements
*   Integrating automated Playwright tests for UI layout validation.

## Open Questions
*   Should the frontend have its own unit tests using Jest, or rely on end-to-end user checks?
