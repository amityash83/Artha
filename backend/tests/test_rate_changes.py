"""Floating rates: dated changes apply from their date; past entries are never rewritten."""
import json
from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.main import post_due_emis


@pytest.fixture
def setup(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT OR IGNORE INTO institutions (id, name) VALUES (900, 'Bank')")
    acc = conn.execute("INSERT INTO accounts (name, institution_id, owner_id) VALUES ('Savings', 900, 1)").lastrowid
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    meta = {"auto_emi": True, "emi_account_id": acc, "emi_day": 5, "auto_emi_since": "2026-10-06"}
    loan = conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, metadata_json) VALUES ('Home', ?, 1, 1200000, 8.4, 25000, ?)",
                        (home, json.dumps(meta))).lastrowid
    conn.commit()
    from backend.main import app
    with TestClient(app) as client:
        yield conn, client, loan


def _loan(conn, loan):
    return dict(conn.execute("SELECT interest_rate, emi, outstanding FROM liabilities WHERE id = ?", (loan,)).fetchone())


def _post(conn, today):
    out = post_due_emis(conn.cursor(), today)
    conn.commit()
    return out


def test_interest_uses_the_rate_in_force_on_each_date(setup):
    conn, client, loan = setup
    assert client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-11-15", "rate": 9.0}).status_code == 200
    posted = _post(conn, date(2026, 12, 6))
    assert posted[0]["interest"] == round(1200000 * 8.4 / 1200, 2)   # 5 Nov: the old rate
    owed_after_nov = 1200000 + posted[0]["interest"] - 25000
    assert posted[1]["interest"] == round(owed_after_nov * 9.0 / 1200, 2)  # 5 Dec: the new rate
    assert all(p["emi"] == 25000 for p in posted)  # bank kept the EMI (tenure moves)


def test_a_bank_changed_emi_applies_from_its_date_and_past_entries_stay(setup):
    conn, client, loan = setup
    _post(conn, date(2026, 11, 6))
    first = [dict(r) for r in conn.execute("SELECT type, amount FROM transactions ORDER BY id")]
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-11-20", "rate": 8.0, "emi": 24000})
    posted = _post(conn, date(2026, 12, 6))
    assert posted[0]["emi"] == 24000
    assert [dict(r) for r in conn.execute("SELECT type, amount FROM transactions ORDER BY id LIMIT 2")] == first  # November untouched


def test_the_loan_shows_todays_terms_and_a_future_change_waits(setup):
    conn, client, loan = setup
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 8.9})
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2099-01-01", "rate": 6.0, "emi": 20000})
    assert _loan(conn, loan)["interest_rate"] == 8.9 and _loan(conn, loan)["emi"] == 25000
    changes = client.get(f"/api/liabilities/{loan}/rate-changes").json()
    assert [c["rate"] for c in changes] == [8.9, 6.0] and changes[0]["previous_rate"] == 8.4


def test_deleting_changes_restores_the_earlier_terms(setup):
    conn, client, loan = setup
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 8.9})
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-06-01", "rate": 9.2, "emi": 26000})
    assert _loan(conn, loan)["interest_rate"] == 9.2 and _loan(conn, loan)["emi"] == 26000
    ids = [c["id"] for c in client.get(f"/api/liabilities/{loan}/rate-changes").json()]
    client.delete(f"/api/liabilities/{loan}/rate-changes/{ids[1]}")
    assert _loan(conn, loan)["interest_rate"] == 8.9 and _loan(conn, loan)["emi"] == 25000
    client.delete(f"/api/liabilities/{loan}/rate-changes/{ids[0]}")
    assert _loan(conn, loan)["interest_rate"] == 8.4


def test_bad_input_is_refused(setup):
    _, client, loan = setup
    assert client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "soon", "rate": 9}).status_code == 422
    assert client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 90}).status_code == 422
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 9})
    assert client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 9.1}).status_code == 409
