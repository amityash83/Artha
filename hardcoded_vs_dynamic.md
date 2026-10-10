# Artha - Configuration & Architecture Analysis

This document classifies system settings, business logic, ports, rules, and calculations into **Hardcoded**, **Dynamic (Data-Driven)**, and **Configurable** categories.

---

## 1. Core Infrastructure & Environment

| Component | Classification | Description / Location |
| :--- | :--- | :--- |
| **Database File Path** | **Configurable** | Path is resolved dynamically via `~/.financeos/settings.json`. Fallback resolved via `FINANCE_DB_DIR` environment variable. Users can switch or create files via UI dialogs. |
| **Default DB Fallback Path** | **Hardcoded** | In development, defaults to `d:\AI\Antigravity\data\finance.db`. In production, defaults next to executable or user roaming profile. |
| **Backend Service Port** | **Hardcoded** | Hardcoded to `127.0.0.1:8000` in both `electron/main.js` and `package.json` build/start scripts. |
| **Vite Dev Server Port** | **Hardcoded** | Hardcoded to `localhost:5173` in `electron/main.js`. |
| **API Request URL Paths** | **Hardcoded** | Fetch calls in frontend code are hardcoded as `http://127.0.0.1:8000/api/...` across react components. |

---

## 2. Financial Decision Rules & Recommendation Engine

| Recommendation Rule | Classification | Description / Location |
| :--- | :--- | :--- |
| **Emergency Fund Target** | **Configurable / Fallback** | Primary value stored in SQLite `financial_rules` (`min_emergency_fund`). If absent or disabled, falls back to hardcoded `₹15,00,000` (15 Lakhs). |
| **Insurance Reserve Target** | **Configurable / Fallback** | Primary value stored in `financial_rules` (`insurance_reserve_target`). Falls back to hardcoded `₹3,00,000` (3 Lakhs). |
| **Debt-Free Liquidity Target** | **Configurable / Fallback** | Primary value stored in `financial_rules` (`debt_free_liquidity_target`). Falls back to hardcoded `₹30,00,000` (30 Lakhs). |
| **High-Interest Loan Definition** | **Hardcoded** | Loans are flagged as high-interest for prepayments if ROI is `>= 7.5%` in [decision_engine.py](file:///d:/AI/Antigravity/Artha/backend/decision_engine.py#L103). |
| **Prepayment Liquid Buffer** | **Hardcoded** | Recommendations for loan prepayment trigger only if liquid buffer above emergency fund exceeds `₹50,000` in [decision_engine.py](file:///d:/AI/Antigravity/Artha/backend/decision_engine.py#L108). |
| **Prepayment Amount Suggestion** | **Hardcoded** | The algorithm suggests paying `min(free_liquid * 0.5, loan_outstanding)`. |
| **Insurance Premium Renewal Warning** | **Hardcoded** | Warns the user of renewals falling within the next `30 days` in [decision_engine.py](file:///d:/AI/Antigravity/Artha/backend/decision_engine.py#L173). |

---

## 3. Financial Ratio Health Meters

The threshold rules evaluating your financial health dashboard ratios are **Hardcoded** in the React frontend component [CashFlowPlanning.tsx](file:///d:/AI/Antigravity/Artha/src/components/CashFlowPlanning.tsx):

| Ratio Meter | Healthy (Green) | Caution (Yellow) | Critical (Red) |
| :--- | :--- | :--- | :--- |
| **Savings Rate** | `> 30%` | `15% - 30%` | `< 15%` |
| **Investment Rate** | `> 20%` | `10% - 20%` | `< 10%` |
| **Debt Burden (EMI/Income)** | `< 30%` | `30% - 50%` | `> 50%` |
| **Expense Ratio** | `< 50%` | `50% - 70%` | `> 70%` |
| **Liquidity Buffer** | `>= 6 months` | `3 - 6 months` | `< 3 months` |

---

## 4. Calculators & Projection Sandboxes

| Parameters | Classification | Description / Location |
| :--- | :--- | :--- |
| **Compounding Interest** | **Hardcoded** | Assumes **monthly compounding** for future projections ($12$ compounding intervals a year) in calculations. |
| **Future Wealth Sliders Bounds** | **Hardcoded** | Pre-set limits: ROI bounds (`5% - 25%`), Monthly SIP bounds (`₹0 - ₹2,00,000`), Horizon bounds (`5 - 35 years`). |
| **Initial Projection Seed** | **Dynamic** | Current Investment Principal sums all active current investments; Monthly SIP contribution is pre-filled from active goals contributions. |
| **Prepayment Simulation Limits** | **Hardcoded** | Multi-loan payoff timeline calculation capped at `360 months` (30 years) in [calculations.py](file:///d:/AI/Antigravity/Artha/backend/calculations.py#L331) to prevent infinite loops. |
| **Prepayment Slider Limits** | **Dynamic / Fallback** | The slider max limit scales to the sum of outstanding loan balances. Fallback minimum slider limit is `₹10,00,000` (10 Lakhs). |
| **windfall windup/cascade order** | **Dynamic** | Cascades prepayment remainder across the strategy queue (Snowball vs Avalanche) dynamically. |

---

## 5. UI Elements & Core Data

| Data Category | Classification | Description |
| :--- | :--- | :--- |
| **Account/Loan Balances** | **Dynamic** | Loaded directly from SQLite database. |
| **Transactions & Logs** | **Dynamic** | Loaded and calculated from CRUD database tables. |
| **Cash Flow Auto-Fill Inputs** | **Dynamic** | Aggregates live values from active loans (EMIs), rental properties (income), insurance (premiums), and goals (contributions) dynamically. |
| **Theme / Styles** | **Hardcoded / Constant** | Theme styling, borders, colors, and layout configurations are fixed via CSS custom variables in [index.css](file:///d:/AI/Antigravity/Artha/src/index.css). |

---

## 6. Income Tax (Tax Planner)

| Data Category | Classification | Description |
| :--- | :--- | :--- |
| **Slabs, rebate, surcharge, cess, standard deduction, deduction limits, HRA metro list, employer-NPS limits, special-rate capital gains** | **Dynamic (versioned rule files)** | Per financial year in `backend/tax/rules/*.json`, each value tagged with a verification level and its sections. Never in code: `test_no_financial_thresholds_hardcoded_in_tax_code` fails on any 4+ digit literal in `backend/tax/*.py`. See `Architecture/Domains/Tax-Rules-Update-Guide.md`. |
| **User rule overrides** | **Dynamic (database)** | Users copy and edit rule sets in the Tax Rules tab (`tax_rule_sets`, versioned); `tax_rule_set_selection` picks the set per year. |
| **Legacy Taxation keys in `financial_rules`** (`section_80c_limit`, `standard_deduction_salaried`, …) | **Unused** | Still seeded (Knowledge articles reference them) but not read by the tax engine; their descriptions say so. |
| **NPS scenario levels (0/5/10/12/14%), sensitivity steps** | **Hardcoded (analysis options)** | What-if levels in `nps.py` / `sensitivity.py`, not tax rules; the deductible limits they are checked against come from the rule set. |
| **Planner sample payroll** | **Hardcoded default (user data)** | Starting values in `frontend/src/components/tax/plannerInputs.ts`; every value is editable. |
