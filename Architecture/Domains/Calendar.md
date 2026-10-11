# Calendar Domain (and due-date reminders)

## Purpose

The Financial Calendar answers "what's coming up?" by projecting every known dated payment (loan EMIs, goal contributions, insurance premiums, credit card bills, advance tax and the return due date) across the next 12 months in one chronological view. Reminders pick the ones due within a few days and surface them under the bell in the top bar and, in the desktop app, as system notifications. Both are computed lenses over data owned by other domains; reminders add only a small state table.

## Scope

- **Event feed.** `calendar_events(today=None)` in `backend/main.py` builds the 12-month list; `GET /api/calendar` returns it. Event types:
  - **EMI**: one per month per active loan (`outstanding > 0 AND emi > 0 AND interest_rate > 0`), on the loan's EMI debit day (`metadata_json.emi_day`, else the day of a legacy `start_date`), clamped to short months.
    - With neither set, the day is unknown. The EMI is shown on the 1st of each month with a note asking for the debit day; this month's falls on today, since it may still be due.
    - Each event carries `liability_id` and `day_known`.
  - **SIP**: on the 1st, for goals with a positive gap and `monthly_contribution`. A goal's amount is derived from linked holdings when it has any.
  - **Insurance**: premiums from `insurance_details.renewal_date` and frequency (Monthly / Quarterly / Semi-annually / Yearly).
  - **Credit Card**: each card once, not every month:
    - the last statement's balance (`statement_balance`, capped at `outstanding`) on the next due date;
    - the rest, spent since the statement, as an estimate on the due date after the next statement.
  - **Tax**: from each person's saved Tax Planner plan (`_tax_calendar_events`):
    - upcoming advance-tax instalments still to pay;
    - the return due date, with any self-assessment tax.
- **Reminders** (`backend/reminders.py`, below).

## Reminders

- **Which events:** `due_reminders(conn, events, today)` keeps the calendar events whose date is within their kind's lead time, soonest first.
  - Default lead times: EMI 3 days, card bills 5, insurance 15, tax 10, goal contributions off.
  - An EMI whose debit day isn't set is never a reminder, since its date is a placeholder.
- **Account check:** an EMI paid from a known account (loan metadata `emi_account_id`) is checked against that account's derived balance.
  - EMIs from the same account are counted in date order, so the second is checked against what's left after the first.
  - When the account falls short, the reminder carries `warning {account, balance, short_by}`.
- **Already paid:** an EMI or prepayment into the loan in the week up to the due date, posted automatically or by hand, drops that month's reminder. Without this, an EMI auto-posted this morning would still show, and its account would look short.
- **State:** the `reminder_state` table, keyed `"<type>[:<liability id>]|<title>|<date>"` (the loan id keeps two loans of the same name apart), holds two things:
  - `dismissed_at`: "Done" hides a reminder until its next date, which has a different key.
  - `notified_on`: a desktop notification is raised once when the reminder comes into range and again on the due day.
  - Rows older than 90 days are pruned.
- **Where things are stored:** preferences are per computer, in `settings.json` under `reminders`: `enabled`, `desktop_notifications`, `lead_days` per kind, 0 = off, max 60. State is per database, since it's about that database's loans and cards.
- **Desktop notifications:** `electron/main.js` polls `POST /api/reminders/notify` 20 s after start, every 30 min, and on resume from sleep.
  - Up to three reminders are notified individually; more become one summary.
  - Clicking a notification focuses the window and opens the bell's list (menu command `reminders`).
  - The web/Docker build shows the bell only.

## Out of Scope

- Email/SMS or any alerting outside the app; no `.ics` export or calendar sync.
- No paid/unpaid tracking on calendar events. "Done" on a reminder only hides it; it doesn't record a payment.
- One-off future obligations (a planned purchase, a school fee) aren't modelled.

## Data Model

No calendar table: events are recomputed on every request from `liabilities` (+ `metadata_json`), `credit_card_details`, `insurance_details` (via `assets`/`institutions`), `goals`/`goal_holdings` and `tax_planner_drafts`. Reminders add `reminder_state (key TEXT PRIMARY KEY, dismissed_at TEXT, notified_on TEXT)`.

## UI Structure

- `frontend/src/components/FinancialCalendar.tsx`: events grouped by month, a type filter and the projected outlay.
- `frontend/src/components/Reminders.tsx`:
  - `RemindersButton`, the bell in `TopBar`: a count badge (amber when something is due within a day or an account is short), the list with "Done", and links to the calendar and the settings;
  - `RemindersSection`, Settings › Reminders: the on/off switches and the lead days per kind.

## API Contracts

- `GET /api/calendar` returns `[{title, amount, type, date, details, liability_id?, day_known?}]`, sorted by date.
- `GET /api/reminders?include_done=false` returns `{items: [{key, type, title, amount, date, days_left, details, page, done, warning}], preferences}`.
- `POST /api/reminders/notify` returns `{items}`: the reminders to raise now, which it also marks as raised. It is used by Electron.
- `POST /api/reminders/done {key, done=true}` marks a reminder done, or not done again.
- `GET /api/settings/reminders` returns the preferences plus `kinds` and `max_lead_days`; `POST /api/settings/reminders {enabled, desktop_notifications, lead_days}` saves them.

## Future Enhancements

- `.ics` export.
- Mark a card bill paid from the reminder by posting the payment.
- Configurable horizon for the calendar.
