"""Automatic EMIs: interest charged and EMI transferred on each debit day, once."""
import json
from datetime import date

from backend.main import post_due_emis


def _loan(conn, **meta):
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT OR IGNORE INTO institutions (id, name) VALUES (900, 'Bank')")
    acc = conn.execute("INSERT INTO accounts (name, institution_id, owner_id) VALUES ('Savings', 900, 1)").lastrowid
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    meta = {"auto_emi": True, "emi_account_id": acc, "emi_day": 5, **meta}
    loan = conn.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, metadata_json) VALUES ('Home', ?, 1, 1000000, 8.4, 20000, ?)",
                        (home, json.dumps(meta))).lastrowid
    conn.commit()
    return acc, loan


def _run(conn, today):
    posted = post_due_emis(conn.cursor(), today)
    conn.commit()
    return posted


def _owed(conn, loan):
    return conn.execute("SELECT outstanding FROM liabilities WHERE id = ?", (loan,)).fetchone()["outstanding"]


def _cash(conn, acc):
    return conn.execute("""SELECT COALESCE(SUM(CASE WHEN dest_ref_type='Account' AND dest_ref_id=:a THEN amount END),0)
                            - COALESCE(SUM(CASE WHEN source_ref_type='Account' AND source_ref_id=:a THEN amount END),0) AS b
                           FROM transactions""", {"a": acc}).fetchone()["b"]


def test_switching_on_starts_from_today_never_the_past(initialized_db):
    acc, loan = _loan(initialized_db)
    assert _run(initialized_db, date(2026, 10, 11)) == []  # stamps "since"; 5 Oct has gone
    assert _owed(initialized_db, loan) == 1000000


def test_each_due_date_posts_interest_then_emi_once(initialized_db):
    acc, loan = _loan(initialized_db, auto_emi_since="2026-10-11")
    posted = _run(initialized_db, date(2026, 11, 5))
    assert posted == [{"loan": "Home", "date": "2026-11-05", "interest": 7000.0, "emi": 20000.0}]  # 10,00,000 x 8.4% / 12
    assert _owed(initialized_db, loan) == 1000000 + 7000 - 20000
    assert _cash(initialized_db, acc) == -20000
    assert _run(initialized_db, date(2026, 11, 5)) == []  # never twice
    kinds = [r["type"] for r in initialized_db.execute("SELECT type FROM transactions ORDER BY id")]
    assert kinds == ["Interest", "EMI"]


def test_missed_months_catch_up_on_the_lower_balance(initialized_db):
    _, loan = _loan(initialized_db, auto_emi_since="2026-10-11")
    posted = _run(initialized_db, date(2027, 1, 20))
    assert [p["date"] for p in posted] == ["2026-11-05", "2026-12-05", "2027-01-05"]
    assert posted[1]["interest"] == round(987000 * 8.4 / 1200, 2)  # interest on the reduced balance


def test_the_last_emi_only_clears_what_is_left(initialized_db):
    _, loan = _loan(initialized_db, auto_emi_since="2026-10-11")
    initialized_db.execute("UPDATE liabilities SET outstanding = 5000 WHERE id = ?", (loan,))
    initialized_db.commit()
    posted = _run(initialized_db, date(2027, 2, 6))
    assert len(posted) == 1 and posted[0]["emi"] == round(5000 + 5000 * 8.4 / 1200, 2)
    assert _owed(initialized_db, loan) == 0


def test_off_or_incomplete_settings_post_nothing(initialized_db):
    _, loan = _loan(initialized_db, auto_emi=False, auto_emi_since="2026-01-01")
    assert _run(initialized_db, date(2026, 12, 1)) == []
    initialized_db.execute("UPDATE liabilities SET metadata_json = ? WHERE id = ?",
                           (json.dumps({"auto_emi": True, "auto_emi_since": "2026-01-01", "emi_day": 5}), loan))  # no account
    initialized_db.commit()
    assert _run(initialized_db, date(2026, 12, 1)) == []
