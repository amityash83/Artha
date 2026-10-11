"""Due-date reminders: calendar payments within each kind's lead time, the paying account's
balance check, done/notified state, and preferences."""
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

import backend.db as db
from backend import reminders
from backend.main import calendar_events

TODAY = date(2026, 10, 11)


def _account(conn, name, balance):
    bank = conn.execute("INSERT INTO institutions (name) VALUES (?)", (f"{name} bank",)).lastrowid
    cur = conn.execute("INSERT INTO accounts (name, owner_id, institution_id) VALUES (?, 1, ?)", (name, bank))
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                    VALUES ('None', 'Account', ?, 'Credit', ?, '2026-10-01', 'salary')""", (cur.lastrowid, balance))
    return cur.lastrowid


def _loan(conn, name, emi, day, account_id=None):
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    meta = {"emi_day": day, **({"emi_account_id": account_id} if account_id else {})}
    conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, metadata_json) VALUES (?, ?, 1, 900000, 8.5, ?, ?)",
                 (name, home, emi, json.dumps(meta)))
    conn.commit()


def _due(conn, **kw):
    return reminders.due_reminders(conn, calendar_events(TODAY), TODAY, **kw)


def test_only_payments_within_the_lead_time(initialized_db):
    _loan(initialized_db, "Home", 30000, 13)   # 2 days away: in range (EMI lead 3)
    _loan(initialized_db, "Car", 9000, 20)     # 9 days away: not yet
    _loan(initialized_db, "Unknown day", 5000, None)  # placeholder date: never a reminder
    items = _due(initialized_db)
    assert [(i["title"], i["date"], i["days_left"]) for i in items] == [("Home EMI", "2026-10-13", 2)]
    assert items[0]["page"] == "liabilities" and items[0]["warning"] is None


def test_account_shortfall_counts_earlier_emis_from_the_same_account(initialized_db):
    sbi = _account(initialized_db, "SBI Savings", 40000)
    _loan(initialized_db, "Home", 30000, 12, sbi)
    _loan(initialized_db, "Top-up", 15000, 14, sbi)
    home, topup = _due(initialized_db)
    assert home["warning"] is None and home["details"] == "From SBI Savings"
    assert topup["warning"] == {"account": "SBI Savings", "balance": 40000.0, "short_by": 5000.0}


def test_done_hides_it_and_notifications_come_once_then_on_the_day(initialized_db):
    _loan(initialized_db, "Home", 30000, 12)
    _loan(initialized_db, "Top-up", 15000, 13)
    items = _due(initialized_db)
    assert len(reminders.take_notifications(initialized_db, items, TODAY)) == 2
    assert reminders.take_notifications(initialized_db, _due(initialized_db), TODAY) == []
    reminders.mark_done(initialized_db, items[1]["key"])
    assert [i["title"] for i in _due(initialized_db)] == ["Home EMI"]
    assert [i["done"] for i in _due(initialized_db, include_done=True)] == [False, True]
    on_the_day = reminders.due_reminders(initialized_db, calendar_events(date(2026, 10, 12)), date(2026, 10, 12))
    again = reminders.take_notifications(initialized_db, on_the_day, date(2026, 10, 12))
    assert [(i["title"], i["days_left"]) for i in again] == [("Home EMI", 0)]  # the done one stays quiet


def test_preferences_change_lead_times_and_can_turn_kinds_off(initialized_db):
    _loan(initialized_db, "Car", 9000, 20)
    assert _due(initialized_db) == []
    reminders.save_preferences(True, True, {"EMI": 10})
    assert [i["title"] for i in _due(initialized_db)] == ["Car EMI"]
    reminders.save_preferences(True, True, {"EMI": 0})
    assert _due(initialized_db) == []
    reminders.save_preferences(False, True, {"EMI": 10})
    assert _due(initialized_db) == []
    reminders.save_preferences(True, False, {"EMI": 10})
    assert reminders.take_notifications(initialized_db, _due(initialized_db), TODAY) == []
    with pytest.raises(ValueError):
        reminders.save_preferences(True, True, {"Lottery": 3})
    assert reminders.save_preferences(True, True, {"Tax": 999})["lead_days"]["Tax"] == reminders.MAX_LEAD_DAYS


def test_old_state_is_forgotten(initialized_db):
    reminders.mark_done(initialized_db, "EMI|Home EMI|2026-01-05")
    reminders.mark_done(initialized_db, "EMI|Home EMI|2026-10-05")
    reminders.prune_state(initialized_db, TODAY)
    assert [r["key"] for r in initialized_db.execute("SELECT key FROM reminder_state")] == ["EMI|Home EMI|2026-10-05"]


def test_routes(initialized_db):
    from backend.main import app
    day = (date.today().day % 28) + 1  # tomorrow-ish, always within 3 days or next month
    _loan(initialized_db, "Home", 30000, day)
    reminders.save_preferences(True, True, {"EMI": 31})
    with TestClient(app) as client:
        got = client.get("/api/reminders").json()
        assert [i["title"] for i in got["items"]] == ["Home EMI"] and got["preferences"]["lead_days"]["EMI"] == 31
        assert len(client.post("/api/reminders/notify").json()["items"]) == 1
        assert client.post("/api/reminders/notify").json()["items"] == []
        key = got["items"][0]["key"]
        assert client.post("/api/reminders/done", json={"key": key}).status_code == 200
        assert client.get("/api/reminders").json()["items"] == []
        assert client.post("/api/reminders/done", json={"key": key, "done": False}).status_code == 200
        assert len(client.get("/api/reminders").json()["items"]) == 1
        assert client.post("/api/reminders/done", json={"key": "nope"}).status_code == 400
        prefs = client.get("/api/settings/reminders").json()
        assert prefs["kinds"] == reminders.REMINDER_TYPES
        saved = client.post("/api/settings/reminders", json={"enabled": True, "desktop_notifications": False, "lead_days": {"Insurance": 30}}).json()
        assert saved["lead_days"]["Insurance"] == 30 and saved["desktop_notifications"] is False
        assert client.post("/api/settings/reminders", json={"lead_days": {"Bogus": 1}}).status_code == 400
    assert db.load_settings()["reminders"]["lead_days"]["Insurance"] == 30


def test_an_emi_already_paid_is_not_a_reminder(initialized_db):
    sbi = _account(initialized_db, "SBI Savings", 10000)
    _loan(initialized_db, "Home", 30000, 11, sbi)  # due today
    lid = initialized_db.execute("SELECT id FROM liabilities WHERE name = 'Home'").fetchone()["id"]
    assert _due(initialized_db)[0]["warning"]["short_by"] == 20000
    initialized_db.execute("""INSERT INTO transactions (source_ref_type, source_ref_id, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                              VALUES ('Account', ?, 'Liability', ?, 'EMI', 30000, '2026-10-11')""", (sbi, lid))
    initialized_db.commit()
    assert _due(initialized_db) == []


def test_two_loans_with_one_name_are_separate_reminders(initialized_db):
    _loan(initialized_db, "HDFC", 30000, 12)
    _loan(initialized_db, "HDFC", 15000, 12)
    first, second = _due(initialized_db)
    assert first["key"] != second["key"]
    reminders.mark_done(initialized_db, first["key"])
    assert [i["amount"] for i in _due(initialized_db)] == [second["amount"]]
