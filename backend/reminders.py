"""
Due-date reminders: the Financial Calendar's payments that fall due within each kind's
lead time (EMIs, card bills, premiums, advance tax), shown in the top bar and, in the
desktop app, as system notifications.

- Built from the same events as the calendar (main.calendar_events), so the two can't
  disagree. EMIs whose debit day isn't set are left out: their date is a placeholder.
- An EMI paid from a known account (the loan's emi_account_id) is checked against that
  account's balance, counting every EMI from it that falls due first, so a reminder can say
  "keep ₹X more in the account" before a debit bounces.
- Lead times and the on/off switches are per-computer preferences (settings.json); what
  has been marked done or already notified is per database (reminder_state), since the
  reminders are about that database's loans and cards.
- A reminder notifies once when it comes into range and once more on the day it's due,
  unless it's been marked done.
"""
from datetime import date
from typing import Iterable, List, Optional

import backend.db as db

REMINDER_TYPES = ["EMI", "Credit Card", "Insurance", "Tax", "SIP"]
DEFAULT_LEAD_DAYS = {"EMI": 3, "Credit Card": 5, "Insurance": 15, "Tax": 10, "SIP": 0}
MAX_LEAD_DAYS = 60
# Where each kind is looked after, for "open" from a reminder.
PAGE_FOR = {"EMI": "liabilities", "Credit Card": "credit-cards", "Insurance": "assets", "Tax": "taxation", "SIP": "goals"}


def preferences() -> dict:
    saved = db.load_settings().get("reminders") or {}
    lead = {**DEFAULT_LEAD_DAYS, **{k: v for k, v in (saved.get("lead_days") or {}).items() if k in DEFAULT_LEAD_DAYS}}
    return {"enabled": saved.get("enabled", True), "desktop_notifications": saved.get("desktop_notifications", True), "lead_days": lead}


def save_preferences(enabled: bool, desktop_notifications: bool, lead_days: dict) -> dict:
    lead = {}
    for kind, days in (lead_days or {}).items():
        if kind not in DEFAULT_LEAD_DAYS:
            raise ValueError(f"Unknown reminder kind: {kind}")
        lead[kind] = max(0, min(int(days), MAX_LEAD_DAYS))
    s = db.load_settings()
    s["reminders"] = {"enabled": bool(enabled), "desktop_notifications": bool(desktop_notifications),
                      "lead_days": {**DEFAULT_LEAD_DAYS, **lead}}
    db.save_settings(s)
    return preferences()


def reminder_key(event: dict) -> str:
    # The loan's id keeps two loans of the same name apart; the date stays last (prune_state).
    kind = f"{event['type']}:{event['liability_id']}" if event.get("liability_id") else event["type"]
    return f"{kind}|{event['title']}|{event['date']}"


def _emi_already_paid(cursor, liability_id: int, due: str) -> bool:
    """An EMI (or prepayment) into the loan in the week up to its due date, posted
    automatically or by hand: that month's reminder has nothing left to say."""
    start = date.fromordinal(date.fromisoformat(due).toordinal() - 7).isoformat()
    return cursor.execute("""SELECT 1 FROM transactions WHERE dest_ref_type = 'Liability' AND dest_ref_id = ?
                             AND type IN ('EMI', 'Prepayment') AND transaction_date BETWEEN ? AND ? LIMIT 1""",
                          (liability_id, start, due)).fetchone() is not None


def _account_balance(cursor, account_id: int) -> float:
    """Derived like every account balance (see get_init_data): money in minus money out."""
    total = cursor.execute("""
        SELECT COALESCE(SUM(CASE WHEN dest_ref_type = 'Account' AND dest_ref_id = :id THEN amount ELSE 0 END), 0)
             - COALESCE(SUM(CASE WHEN source_ref_type = 'Account' AND source_ref_id = :id THEN amount ELSE 0 END), 0)
        FROM transactions""", {"id": account_id}).fetchone()[0]
    return float(total or 0.0)


def _emi_accounts(cursor, loan_ids: Iterable[int]) -> dict:
    """liability id -> (account id, account name, auto_emi) for loans paid from a known account."""
    import json
    out = {}
    for lid in set(loan_ids):
        row = cursor.execute("SELECT metadata_json FROM liabilities WHERE id = ?", (lid,)).fetchone()
        try:
            meta = json.loads((row and row["metadata_json"]) or "{}")
            account_id = int(meta.get("emi_account_id") or 0)
        except (TypeError, ValueError):
            continue
        if account_id:
            acc = cursor.execute("SELECT name FROM accounts WHERE id = ?", (account_id,)).fetchone()
            if acc:
                out[lid] = (account_id, acc["name"], bool(meta.get("auto_emi")))
    return out


def due_reminders(conn, events: List[dict], today: Optional[date] = None, include_done: bool = False) -> List[dict]:
    """The calendar events due within their kind's lead time, soonest first."""
    today = today or date.today()
    prefs = preferences()
    if not prefs["enabled"]:
        return []
    cursor = conn.cursor()
    done = {r["key"] for r in cursor.execute("SELECT key FROM reminder_state WHERE dismissed_at IS NOT NULL")}
    items = []
    for e in sorted(events, key=lambda x: x["date"]):
        lead = prefs["lead_days"].get(e["type"], 0)
        if lead <= 0 or (e["type"] == "EMI" and not e.get("day_known", True)):
            continue
        days_left = (date.fromisoformat(e["date"]) - today).days
        if not 0 <= days_left <= lead:
            continue
        key = reminder_key(e)
        if key in done and not include_done:
            continue
        if e["type"] == "EMI" and e.get("liability_id") and _emi_already_paid(cursor, e["liability_id"], e["date"]):
            continue
        items.append({"key": key, "type": e["type"], "title": e["title"], "amount": float(e.get("amount") or 0.0),
                      "date": e["date"], "days_left": days_left, "details": e.get("details", ""),
                      "page": PAGE_FOR.get(e["type"], "calendar"), "done": key in done, "warning": None})

    # Will the account the EMIs come from cover them? Counted in date order, so the second
    # EMI from an account is checked against what's left after the first.
    accounts = _emi_accounts(cursor, [e["liability_id"] for e in events if e["type"] == "EMI" and e.get("liability_id")])
    loan_of = {reminder_key(e): e.get("liability_id") for e in events if e["type"] == "EMI"}
    balances, needed = {}, {}
    for item in items:
        if item["type"] != "EMI" or item["done"]:
            continue
        acc = accounts.get(loan_of.get(item["key"]))
        if not acc:
            continue
        account_id, account_name, auto = acc
        if account_id not in balances:
            balances[account_id] = _account_balance(cursor, account_id)
        needed[account_id] = needed.get(account_id, 0.0) + item["amount"]
        item["details"] = f"From {account_name}" + (" · posted automatically" if auto else "")
        short = needed[account_id] - balances[account_id]
        if short > 0.5:
            item["warning"] = {"account": account_name, "balance": round(balances[account_id], 2), "short_by": round(short, 2)}
    return items


def mark_done(conn, key: str, done: bool = True) -> None:
    now = date.today().isoformat()
    conn.execute("""INSERT INTO reminder_state (key, dismissed_at) VALUES (?, ?)
                    ON CONFLICT(key) DO UPDATE SET dismissed_at = excluded.dismissed_at""", (key, now if done else None))
    conn.commit()


def take_notifications(conn, items: List[dict], today: Optional[date] = None) -> List[dict]:
    """The reminders to raise as system notifications now, marked as raised: each one when
    it first comes into range, and again on its due day."""
    today = today or date.today()
    if not preferences()["desktop_notifications"]:
        return []
    seen = {r["key"]: r["notified_on"] for r in conn.execute("SELECT key, notified_on FROM reminder_state")}
    out = []
    for item in items:
        if item["done"]:
            continue
        last = seen.get(item["key"])
        if last is None or (item["days_left"] == 0 and last != today.isoformat()):
            out.append(item)
    for item in out:
        conn.execute("""INSERT INTO reminder_state (key, notified_on) VALUES (?, ?)
                        ON CONFLICT(key) DO UPDATE SET notified_on = excluded.notified_on""", (item["key"], today.isoformat()))
    conn.commit()
    return out


def prune_state(conn, today: Optional[date] = None, keep_days: int = 90) -> None:
    """Forget reminders long past (the date is the key's last part)."""
    today = today or date.today()
    cutoff = date.fromordinal(today.toordinal() - keep_days).isoformat()
    conn.execute("DELETE FROM reminder_state WHERE substr(key, -10) < ?", (cutoff,))
    conn.commit()
