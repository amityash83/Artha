# Implementation Plan: Credit Cards Module Expansion

This plan outlines the database migration, backend router, and frontend UI changes to expand the **Credit Cards** module. The goal is to evolve the card registry from a simple liability tracker to a comprehensive inventory for optimization (annual fees, waiver milestones, rewards value, and lounge access).

## Proposed Changes

### 1. Database Layer (`backend/db.py`)
Add support for card inventory details in the SQLite `credit_cards` table. If the database file exists, run structural migration queries automatically to add the new columns:
* `annual_fee` (REAL, default `0.0`): The annual card fee in INR.
* `renewal_date` (TEXT, YYYY-MM-DD): The next billing/renewal date.
* `reward_points` (INTEGER, default `0`): Current accrued reward points.
* `point_value` (REAL, default `0.25`): Monetary value of 1 reward point in INR (e.g. ₹0.25).
* `lounge_access_domestic` (TEXT, optional): Quick reference text for domestic lounges (e.g., "4/Quarter").
* `lounge_access_international` (TEXT, optional): Quick reference text for international lounges (e.g., "4/Year").
* `spend_milestone_waiver` (REAL, default `0.0`): Target annual spend to trigger fee waiver (e.g., ₹1,50,000).

### 2. Application Layer (`backend/main.py`)
* **Pydantic Model Updates**: Expand `CreditCardSchema` to capture the new fields.
* **CRUD API Updates**: Update the SQL statements in the POST endpoint to save and edit these new attributes.
* **Aggregate API Updates**: Update `get_init_data` to ensure all fields are returned to the frontend.

### 3. UI Component (`src/components/CreditCards.tsx`)
Redesign the Credit Cards panel into a modular view containing:
* **Metrics Cards Summary**:
  * Total Outstanding Balance
  * Total Billed Amount (Due Next)
  * Total Accrued Reward Points Value (in INR: `reward_points * point_value`)
  * Upcoming Annual Fees Outflow (next 12 months)
* **Expanded Registry Grid**: Render the list of cards in a grid of stylized cards instead of a wide, crowded table, showing:
  * Card Issuer Logo/Badge
  * Credit Limit & Utilization bar
  * Statement Cycles & Due Dates
  * Rewards tally & estimated cash equivalent (e.g., "5,000 pts ≈ ₹1,250")
  * Benefits Quick Info: Domestic & International lounge limits, annual fee & waiver milestone progress bar
* **Add/Edit Card Modal Form**: Integrated input fields for these detailed properties.

## Verification Plan

### Automated Tests
* Run direct Python queries to verify the database migrations and ensure the `credit_cards` schema includes all new columns.
* Launch compilation check: `npm run build:frontend` to verify TypeScript builds cleanly.

### Manual Verification
* Deploy the updated build.
* Add/edit a card with annual fees, reward points, and lounge details. Verify that the calculations and card indicators display the cash equivalent values and milestone waivers.
