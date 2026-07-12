# Walkthrough - Annual Prepayments in Loan Optimizer

We have successfully implemented annual prepayments for the Multi-Loan Payoff Optimizer module.

## Changes Made

### 1. Calculations Engine
- **File:** [calculations.py](file:///d:/AI/Antigravity/Artha/backend/calculations.py#L305-L386)
- Modified `simulate_multi_loan_payoff` to take the following new parameters:
  - `prepayment_frequency` (defaults to `"monthly"`)
  - `prepayment_amount` (defaults to `0.0`)
  - `prepayment_month` (defaults to `3` / March)
  - `prepayment_day` (defaults to `31`)
- The simulator tracks the calendar month dynamically starting from the current month.
- It applies the annual prepayment amount only during the month matching the user-selected `prepayment_month`.
- Upgraded the distribution algorithm to **cascade** any remainder of the prepayment budget (if a target loan is fully cleared) onto subsequent loans in the strategy queue rather than throwing the extra funds away.

### 2. FastAPI Request Schema & Router
- **File:** [main.py](file:///d:/AI/Antigravity/Artha/backend/main.py#L1287-L1305)
- Extended `LoanOptimizerRequest` with the new schema parameters.
- Updated the `/api/calculations/loan-optimizer` endpoint to pass the parameters to all simulation calls (Baseline, Avalanche, Snowball).

### 3. Frontend React Component
- **File:** [LoanOptimizer.tsx](file:///d:/AI/Antigravity/Artha/src/components/LoanOptimizer.tsx)
- Added states `frequency`, `annualAmount`, `prepayMonth`, and `prepayDay`.
- Created a beautiful tab switcher for "Monthly" vs. "Annually" modes.
- Added sliding and numeric input fields for annual prepayments.
- Included dropdowns for selecting the target calendar month and day to apply the annual payment.
- **Dynamic Prepayment Limit:** Computed the total outstanding loan balance and set the slider's `max` dynamically to this balance (with a 10L fallback minimum), rounding to the nearest 50k for smooth increments. Added formatted currency labels for the slider's start, mid, and end limits.
- **Interactive Prepayment Simulator Input ([Loans.tsx](file:///d:/AI/Antigravity/Artha/src/components/Loans.tsx)):** Added a typed numeric input field to the Interactive Prepayment Simulator in the Loans panel, allowing users to type their exact prepayment amount alongside the range slider.

## Verification & Testing

We created and executed a test script at `scratch/test_loan_optimizer.py`. 

The test verified that:
1. Both Monthly and Annual payloads are parsed successfully.
2. Under Annual Prepayment, the baseline calculations remain unchanged.
3. In Month 9 (which corresponds to March, starting from July), the annual prepayment of ₹1,20,000 is correctly injected:
   ```
   Month 8: Outstanding=471706.35, Principal Paid=16454.58, Interest=3545.42
   Month 9: Outstanding=335129.7, Principal Paid=136576.65, Interest=3423.35  <-- Prepayment successfully applied
   ```
4. All simulation models output correct graphs and savings values.

---

# Release: Income, Cash Flow & Financial Planning Module

We have successfully implemented the **Income, Cash Flow & Financial Planning Module** in Artha.

## What Was Added

### 1. Database Table
- **File:** [db.py](file:///d:/AI/Antigravity/Artha/backend/db.py)
- Created the `monthly_cash_flows` table to track month, net salary, other income, household expenses, EMI, insurance premium, investments, one-time expenses, and notes.

### 2. FastAPI Endpoints
- **File:** [main.py](file:///d:/AI/Antigravity/Artha/backend/main.py)
- Added schemas `CashFlowSchema` and `CashFlowSimulationRequest`.
- Registered CRUD routers: `GET /api/cash-flows`, `POST /api/cash-flows`, and `DELETE /api/cash-flows/{id}`.
- Integrated `cash_flows` retrieval into the aggregate `/api/init` data.
- Built a dedicated What-If sandbox endpoint: `POST /api/calculations/cash-flow/simulate`. This endpoint takes current snapshot metrics and adjustments (salary raise %, absolute bonus windfall, new EMIs, etc.) to compute current vs simulated states, highlight the financial impact, and provide recommended actions.

### 3. Frontend Dashboard
- **File:** [App.tsx](file:///d:/AI/Antigravity/Artha/src/App.tsx) & [CashFlowPlanning.tsx](file:///d:/AI/Antigravity/Artha/src/components/CashFlowPlanning.tsx)
- Registered the **Cash Flow Planning** tab in the sidebar layout.
- Developed the sub-tabs workspace:
  - **Dashboard & Ratios:** Shows summary widgets (Income, Expenses, Investments, Surplus, Savings Rate) and health meters for ratios (Savings Rate, Investment Rate, Expense Ratio, Debt Burden Ratio, and Liquidity Ratio emergency buffers).
  - **What-If Sandbox:** Sliders and inputs to simulate salary raise, bonus, new loans, closed loans, or SIP increases. It updates in real time to show current vs simulated outcomes, delta change, and recommended actions.
  - **Monthly Logs:** Allows logging, editing, and deleting cash flow snapshots.
- **Auto-Fill from Portfolio:** Added an "Auto-Fill" button inside the entry form modal. This query sums up EMIs from `loans`, active rental income from `properties`, active monthly premium equivalent from `insurance`, and SIP contributions from `goals` to automatically populate inputs.

## Verification & Testing
Created and executed `scratch/test_cash_flow.py` to verify:
1. `POST` and `GET` requests for `monthly_cash_flows` function successfully.
2. The simulation sandbox computes ratios and outputs a descriptive delta analysis (e.g., `Monthly surplus increases by Rs.25,500. Savings rate grows by 8.7%...`).

---

# Release: Future Wealth & Corpus Projection Sandbox

We have successfully implemented the **Future Wealth & Corpus Projection Sandbox** in the Investments tab.

## What Was Added

### 1. Future Wealth Projection States ([Investments.tsx](file:///d:/AI/Antigravity/Artha/src/components/Investments.tsx))
- Integrated `Line` from `react-chartjs-2` to render comparative lines.
- Declared state variables: `projectRoi` (Expected ROI), `projectSip` (Monthly SIP), and `projectYears` (Time Horizon in years). Set default values, seeding the SIP contribution automatically from active goals (`goals.reduce((sum, g) => sum + g.monthly_contribution, 0)`).

### 2. Math Calculations
- Computed the future value of the lump sum (active investments current value total) and monthly compounding SIP contributions over the time horizon:
  $$FV_t = PV \times (1 + r)^t + PMT \times \frac{(1 + r)^t - 1}{r}$$
- Extracted annual snapshot arrays containing:
  - **Total Capital Invested** (Initial Lump Sum + Accumulated SIP contributions).
  - **Projected Corpus Value** (Future Value with compound interest).
  - **Estimated Returns Earned** (Projected Corpus - Total Capital Invested).

### 3. Glassmorphic Simulation Dashboard
- Built a gorgeous dashboard panel at the bottom of the page containing:
  - **Interactive Controls (Sliders & Sync Inputs):** Allows users to adjust the expected ROI (5% to 25%), monthly SIP contribution (₹0 to ₹2L), and time horizon (5 to 35 years) dynamically.
  - **Summary Output Cards:** Displays Total projected corpus, Total invested capital, and Net returns earned.
  - **Visual Line Graph:** Renders the comparative curves of total invested capital vs. projected corpus progression year-over-year.

## Verification & Testing
- Executed `npm run build:frontend` to compile the TypeScript files and verify bundler success.
- Verified slider hooks and chart reactivity inside the browser client.

