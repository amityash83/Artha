"""Loan EMIs on the Financial Calendar fall on the loan's own debit day."""
import json
from datetime import date

from fastapi.testclient import TestClient


def _loan(conn, name, meta):
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, metadata_json) VALUES (?, ?, 1, 500000, 8, 15000, ?)",
                 (name, home, json.dumps(meta)))


def _emis(conn):
    conn.commit()
    from backend.main import app
    with TestClient(app) as client:
        events = client.get("/api/calendar").json()
    return [e for e in events if e["type"] == "EMI"]


def test_each_loan_uses_its_own_debit_day(initialized_db):
    _loan(initialized_db, "Home", {"emi_day": 5})
    _loan(initialized_db, "Top-up", {"emi_day": 10})
    emis = _emis(initialized_db)
    assert {e["date"][8:] for e in emis if e["title"] == "Home EMI"} == {"05"}
    assert {e["date"][8:] for e in emis if e["title"] == "Top-up EMI"} == {"10"}


def test_day_31_lands_on_the_last_day_of_short_months(initialized_db):
    _loan(initialized_db, "Home", {"emi_day": 31})
    days = {e["date"] for e in _emis(initialized_db)}
    assert any(d.endswith("-30") or d.endswith("-28") or d.endswith("-29") for d in days)


def test_an_unknown_day_is_not_todays_date_but_says_so(initialized_db):
    _loan(initialized_db, "Home", {})
    emis = _emis(initialized_db)
    later = [e for e in emis if e["date"] > date.today().isoformat()]
    assert later and all(e["date"].endswith("-01") for e in later)
    assert all("EMI day not set" in e["details"] for e in emis)
