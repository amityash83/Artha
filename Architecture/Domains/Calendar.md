# Calendar Domain

## Purpose

The Financial Calendar answers a specific question from Artha.md's product goals — "what's coming up?" — by projecting every known recurring cash obligation (loan EMIs, goal contributions, insurance premiums, credit card due dates) forward across the next 12 months into a single chronological view. It is a read-only, computed lens over data that already lives in other domains (Liabilities, Goals, Insurance, Credit Cards); it introduces no new data of its own.

## Scope

- A 12-month forward-looking event feed generated entirely on request by `GET /api/calendar` (backend/main.py, `get_financial_calendar()`), covering four event types:
  - **EMI** — one event per month per active loan (`liabilities` where `outstanding > 0 AND emi > 0 AND interest_rate > 0`), due on the same day-of-month as the loan's stored `start_date` (clamped to the shorter month if needed).
  - **SIP** — one event per month per goal with a positive funding gap and a positive `monthly_contribution`, always due on the 1st.
  - **Insurance** — premium due events derived from `insurance_details` (joined to `assets`/`institutions`), computed for Monthly/Quarterly/Semi-Annually/Annually frequencies relative to the stored `renewal_date`.
  - **Credit Card** — due-date events for any Credit Card liability with `outstanding > 0`, split into a "Billed" event (the `credit_card_details.statement_balance`) and an "Unbilled" event (`outstanding - statement_balance`, floored at 0), both dated on the same monthly `due_date`.
- Category/type filtering and a rolled-up "Projected Outlay (12-Month Total)" figure in the frontend.

## Out of Scope

- No push notifications, email/SMS reminders, or any out-of-app alerting — the calendar is only visible when the user opens the Financial Calendar screen and calls `GET /api/calendar`.
- No sync/export to external calendar apps (Google Calendar, Outlook, iCal `.ics` export) — events exist only in the API response, never written anywhere.
- No persistence of past/completed events — this is purely forward-looking (`if due_date >= today`); there's no historical calendar view of what was due last month or whether it was actually paid.
- No editing of calendar events directly — an "EMI" event can only be changed by editing the underlying `liabilities` row (or its EMI amount), not from the calendar UI itself.
- No support for one-off/non-recurring future obligations (e.g. an upcoming school fee payment, a planned large purchase) — only the four recurring categories above are modeled.
- No credit-card annual-fee or reward-related calendar events (annual fee renewal date, points-expiry) despite `credit_card_details` storing `annual_fee`.

## Business Objectives

- Prevent missed EMI/premium/credit-card payments by surfacing all upcoming due dates in one place, rather than requiring the user to check Loans, Insurance, and Credit Cards separately.
- Give a single "Projected Outlay" figure for the next 12 months so the user can sanity-check upcoming cash needs against their liquid balance and income.
- Make the billed-vs-unbilled credit card split visible ahead of the statement/due-date cycle, so the user understands exactly what portion of their card balance is actually payable on the next due date versus what's still accruing.

## Data Model

Calendar has **no dedicated schema and no dedicated table** — there is no `calendar_events` table anywhere in `backend/db.py`. It is a purely computed/derived view, assembled fresh on every `GET /api/calendar` request by querying `liabilities` (loan and credit-card rows), `goals`, `insurance_details` (joined through `assets`/`institutions`), and `credit_card_details` (joined through `liabilities`/`institutions`), then synthesizing 12 months of forward dates in Python. Nothing about "the calendar" is stored; refreshing the page recomputes the entire 12-month event list from current source-of-truth rows every time.

## Database Schema

None. The endpoint reads existing tables owned by other domains:
- `liabilities` (for EMI and Credit Card events: `name`, `emi`, `outstanding`, `metadata_json` for `start_date`; `category_id` used to distinguish loans from Credit Card liabilities).
- `credit_card_details` (`statement_balance`, `due_date`) joined via `liability_id`.
- `insurance_details` (`policy_number`, `premium`, `frequency`, `renewal_date`) joined via `asset_id`, plus `assets`/`institutions` for the policy's display name.
- `goals` (`name`, `monthly_contribution`, `target_amount`, `current_amount` — filtered to goals with a positive funding gap and positive monthly contribution).

## Business Rules

- Loan EMI due-day derivation: parses `start_date` out of the loan's `metadata_json` (falling back to day `5` if parsing fails or `start_date` is absent), then reuses that day-of-month for every future month, clamped via `calendar.monthrange()` to the last valid day if the target month is shorter (e.g. a loan starting on the 31st falls back to the 28th/30th in shorter months).
- Insurance due-date/frequency logic: computes `months_diff` between the target projected month and the stored `renewal_date`'s month/year, then flags a premium as due if `months_diff % 3 == 0` (Quarterly), `% 6 == 0` (Semi-Annually/"semi-annually"), `% 12 == 0` (Annually/Yearly/Annual), or unconditionally every month for "Monthly" — frequency string matching is case-normalized (`.lower()`) but must match one of these literal strings exactly, so an unrecognized frequency value silently produces zero insurance events for that policy.
- Credit card due-date default: if `due_date` (day-of-month) is missing/null on `credit_card_details`, defaults to day `15`.
- Every event type is filtered to `date >= today` — the calendar never shows events for the remainder of the current day/date if they've already passed, and never shows historical events at all.
- The 12-month window is a fixed loop (`range(12)`) starting from the current calendar month — not configurable.

## Configuration

Nothing in this domain is DB-configurable via `financial_rules` — there is no `financial_rules` row governing calendar behavior (no configurable "how many months forward to project," no configurable default due-day fallback). Every threshold described under Business Rules (the day-5 EMI fallback, the day-15 credit-card fallback, the 12-month horizon, the quarterly/semi-annual/annual modulus logic) is hardcoded directly in `get_financial_calendar()` in main.py.

## UI Structure

- `frontend/src/components/FinancialCalendar.tsx` — fetches `GET /api/calendar` on mount, groups events by month/year for display, offers a category filter (All / EMI / SIP / Insurance / Credit Card) via simple string-equality client-side filtering, and shows a "Projected Outlay (12-Month Total)" sum of all currently-filtered event amounts. Each event renders its day-of-month, weekday, title, type badge (color-coded per type), amount, and a `details` string supplied by the backend (e.g. "Monthly Loan Instalment", "Policy: {policy_number}", "Issuer: {issuer} | Billed Statement Balance").
- No other component reads `/api/calendar` — this is the sole consumer.

## API Contracts

- `GET /api/calendar` — no parameters, no pagination. Returns a flat JSON array (sorted by `date` ascending) of event objects: `{ title: string, amount: number, type: "EMI"|"SIP"|"Insurance"|"Credit Card", date: "YYYY-MM-DD", details: string }`. Every call recomputes the full 12-month list from current `liabilities`/`goals`/`insurance_details`/`credit_card_details` rows — there is no caching, no ETag, no incremental fetch.

## AI Responsibilities

None exist yet. There is no AI/LLM integration in the Calendar domain — event generation is deterministic date-arithmetic in Python, not model-generated or model-summarized in any way.

## Reports

- No export/download capability exists for the Financial Calendar anywhere in the app — it is not among the CSV export buttons in Reports.tsx's Data tab, and there is no `.ics`/calendar-file export.
- The "Projected Outlay (12-Month Total)" figure shown in `FinancialCalendar.tsx` is the closest thing to a summary report, but it's computed client-side from the fetched events and not persisted or exportable.

## Future Enhancements

NOT YET BUILT — reasonable next steps:
- `.ics` export or direct sync to an external calendar app (Google Calendar, Outlook) so due dates appear alongside the user's other commitments.
- Push/local notifications ahead of a due date (currently the user must actively open the Financial Calendar screen to see anything).
- Persisting a per-event "paid/unpaid" acknowledgment so the calendar can distinguish handled obligations from ones still outstanding, rather than being purely forward-looking with no historical record.
- Make the 12-month horizon and the default day-of-month fallbacks (day 5 for EMI, day 15 for credit cards) configurable via `financial_rules` instead of hardcoded literals in `get_financial_calendar()`.
- Support one-off, non-recurring future obligations (e.g. a planned large purchase or a one-time fee) alongside the four recurring event types.
- Include credit card annual-fee renewal dates as a calendar event type, since `credit_card_details.annual_fee` is already stored but unused by the calendar.
