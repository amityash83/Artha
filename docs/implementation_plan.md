# Implementation Plan: Annual Prepayments for Multi-Loan Optimizer

This plan outlines the changes to implement annual prepayments in the Multi-Loan Payoff Optimizer module.

## Proposed Changes

### 1. Backend Calculations (`backend/calculations.py`)
- Update the `simulate_multi_loan_payoff` function to accept:
  - `prepayment_frequency` (defaults to `"monthly"`)
  - `prepayment_amount` (defaults to `0.0`)
  - `prepayment_month` (defaults to `3` - March)
  - `prepayment_day` (defaults to `31`)
- Compute the current calendar month dynamically in the simulation loop.
- Apply the annual prepayment amount in simulation months matching the selected `prepayment_month` when frequency is set to `"annually"`.
- Modify the prepayment distribution logic so that extra funds cascade to subsequent loans if the target loan is fully paid off.

### 2. FastAPI Endpoint (`backend/main.py`)
- Update the `LoanOptimizerRequest` Pydantic model to include the new fields:
  - `prepayment_frequency: str = "monthly"`
  - `prepayment_amount: float = 0.0`
  - `prepayment_month: int = 3`
  - `prepayment_day: int = 31`
- Pass these parameters to the `simulate_multi_loan_payoff` calls inside `optimize_loans`.

### 3. Frontend React Component (`src/components/LoanOptimizer.tsx`)
- Introduce UI inputs for frequency toggle ("Monthly" vs. "Annually").
- Create fields for annual prepayment amount, a dropdown/select input for the target Month, and a numeric input for the target Day (1-31).
- Conditionally render inputs depending on the selected frequency mode.
- Update the fetch payload in `calculateOptimalPayoffs` to pass the frequency, annual amount, month, and day parameters.
- Dynamically calculate the maximum annual prepayment limit based on the total outstanding loan balance (using a 10L fallback minimum), rounding to the nearest 50k for smooth increments.

## Verification Plan

### Automated Tests
- Created and executed a test script `scratch/test_loan_optimizer.py` that confirms both monthly and annual simulation modes operate successfully, and verify that the annual prepayment is correctly applied to the principal in the target month (Month 9).

### Manual Verification
- Toggle between **Monthly** and **Annually** prepayment modes.
- Verify that changing the prepayment month shifts the Comparative Payoff Curves and alters the payoff month count.
- Verify that the annual prepayment slider dynamically adjusts its maximum limit to the total outstanding loan balance (capped at a minimum of ₹10,00,000).
