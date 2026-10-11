"""Recommendation engine (decision_engine.py): every check, the rule fallbacks, and the
credit-card annual review verdicts. Previously only exercised by hand."""
import json
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.decision_engine import generate_credit_card_annual_reviews, generate_recommendations

L = 100000  # one lakh, to keep amounts readable


@pytest.fixture
def conn(initialized_db):
    c = initialized_db
    c.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    c.execute("INSERT OR IGNORE INTO institutions (id, name) VALUES (900, 'Test Bank')")
    c.commit()
    return c


def cat(c, name):
    return c.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]


def liquid(c, amount, name="Savings"):
    """An account whose derived balance is `amount` (one opening credit in the ledger)."""
    aid = c.execute("INSERT INTO accounts (name, institution_id, owner_id) VALUES (?, 900, 1)", (name,)).lastrowid
    c.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                 VALUES ('None', 'Account', ?, 'Credit', ?, '2026-04-01')""", (aid, amount))
    c.commit()


def loan(c, name, outstanding, roi, category="Home Loan"):
    c.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, lender_institution_id) VALUES (?, ?, 1, ?, ?, 40000, 900)",
              (name, cat(c, category), outstanding, roi))
    c.commit()


def goal(c, name, target, current):
    c.execute("INSERT INTO goals (name, target_amount, current_amount) VALUES (?, ?, ?)", (name, target, current))
    c.commit()


def set_rule(c, key, value=None, enabled=True):
    if value is not None:
        c.execute("UPDATE financial_rules SET value = ? WHERE rule_key = ?", (value, key))
    c.execute("UPDATE financial_rules SET is_enabled = ? WHERE rule_key = ?", (1 if enabled else 0, key))
    c.commit()


def by_category(recs, category):
    return [r for r in recs if r["category"] == category]


# --- emergency fund ----------------------------------------------------------------

def test_emergency_fund_from_liquid_balance_when_no_goal(conn):
    liquid(conn, 5 * L)
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["status"] == "danger" and r["suggested_amount"] == 10 * L  # default rule 15L
    liquid(conn, 12 * L, "FD sweep")
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["title"] == "Emergency Fund Healthy"


def test_emergency_goal_below_rule_is_danger_and_below_its_own_target_is_building(conn):
    goal(conn, "Emergency corpus", 20 * L, 12 * L)
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["status"] == "danger" and r["suggested_amount"] == 3 * L
    conn.execute("UPDATE goals SET current_amount = ? WHERE name = 'Emergency corpus'", (16 * L,))
    conn.commit()
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["title"] == "Emergency Fund Building" and r["suggested_amount"] == 4 * L


def test_rule_value_is_used_when_enabled(conn):
    liquid(conn, 6 * L)
    set_rule(conn, "min_emergency_fund", 5 * L)
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["title"] == "Emergency Fund Healthy"


def test_disabled_rule_falls_back_to_the_built_in_default(conn):
    # Documented behaviour (CLAUDE.md "Financial rules"): switching a rule off doesn't skip
    # the check, it reverts to the hard-coded default (15L here), not the stored 5L.
    liquid(conn, 6 * L)
    set_rule(conn, "min_emergency_fund", 5 * L, enabled=False)
    (r,) = by_category(generate_recommendations(conn), "Emergency Fund")
    assert r["status"] == "danger" and r["suggested_amount"] == 9 * L


# --- insurance reserve -----------------------------------------------------------------

def test_insurance_reserve_needs_a_goal(conn):
    (r,) = by_category(generate_recommendations(conn), "Insurance")
    assert r["status"] == "danger" and r["suggested_amount"] == 3 * L
    goal(conn, "Insurance reserve", 3 * L, 3.5 * L)
    (r,) = by_category(generate_recommendations(conn), "Insurance")
    assert r["title"] == "Insurance Reserve Safe"


# --- loans and liquidity -----------------------------------------------------------------

def test_prepay_high_interest_loan_with_surplus(conn):
    liquid(conn, 25 * L)
    loan(conn, "Car loan", 4 * L, 9.0)
    (r,) = by_category(generate_recommendations(conn), "Loans")
    # Surplus = 25L - 15L emergency = 10L; half of it (5L) capped at the 4L outstanding.
    assert r["action_type"] == "prepay" and r["suggested_amount"] == 4 * L


def test_high_interest_loan_without_surplus_is_info_only(conn):
    liquid(conn, 15.2 * L)  # surplus 20,000, below the 50,000 prepayment buffer
    loan(conn, "Car loan", 4 * L, 9.0)
    (r,) = by_category(generate_recommendations(conn), "Loans")
    assert r["action_type"] == "info" and r["title"].startswith("Debt Reduction Opportunity")


def test_low_interest_loan_gets_no_prepayment_advice(conn):
    liquid(conn, 40 * L)
    loan(conn, "Home loan", 30 * L, 7.0)
    recs = generate_recommendations(conn)
    assert by_category(recs, "Loans") == [] and by_category(recs, "Liquidity") == []


def test_debt_free_liquidity_target(conn):
    liquid(conn, 20 * L)
    (r,) = by_category(generate_recommendations(conn), "Liquidity")
    assert r["status"] == "warning" and r["suggested_amount"] == 10 * L  # default 30L
    liquid(conn, 15 * L, "Second account")
    (r,) = by_category(generate_recommendations(conn), "Liquidity")
    assert r["title"] == "Optimal Liquidity Achieved"


# --- goals and insurance renewals --------------------------------------------------------

def test_goal_funding_constraint_violation(conn):
    goal(conn, "Child education", 50 * L, 0)
    gid = conn.execute("SELECT id FROM goals WHERE name = 'Child education'").fetchone()["id"]
    aid = conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value) VALUES ('Small cap fund', ?, 1, ?)",
                       (cat(conn, "Mutual Fund"), 2 * L)).lastrowid
    conn.execute("INSERT INTO goal_holdings (goal_id, asset_id, allocation_weight) VALUES (?, ?, 1.0)", (gid, aid))
    conn.execute("INSERT INTO goal_funding_constraints (goal_id, excluded_category_id) VALUES (?, ?)", (gid, cat(conn, "Mutual Fund")))
    conn.commit()
    (r,) = by_category(generate_recommendations(conn), "Goal Funding")
    assert "Child education" in r["title"] and "Small cap fund" in r["message"]


def _policy(c, days_from_today, premium=25000):
    aid = c.execute("INSERT INTO assets (name, category_id, owner_id, institution_id) VALUES ('Health cover', ?, 1, 900)",
                    (cat(c, "Insurance"),)).lastrowid
    c.execute("INSERT INTO insurance_details (asset_id, policy_type, premium, renewal_date) VALUES (?, 'Health', ?, ?)",
              (aid, premium, (date.today() + timedelta(days=days_from_today)).isoformat()))
    c.commit()


def test_premium_reminder_inside_the_alert_window_only(conn):
    _policy(conn, 10)
    _policy(conn, 60)
    (r,) = by_category(generate_recommendations(conn), "Insurance Renewal")
    assert r["suggested_amount"] == 25000 and "10 days" in r["message"]


# --- credit card annual review ------------------------------------------------------------

def card(c, name, **details):
    lid = c.execute("INSERT INTO liabilities (name, category_id, owner_id, lender_institution_id, outstanding) VALUES (?, ?, 1, 900, 0)",
                    (name, cat(c, "Credit Card"))).lastrowid
    cols = {"liability_id": lid, "point_value": 1.0, **details}
    c.execute(f"INSERT INTO credit_card_details ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})", tuple(cols.values()))
    c.commit()
    return lid


def verdict(c, lid):
    (r,) = generate_credit_card_annual_reviews(c, lid)
    return r["verdict"], r


def test_card_verdicts(conn):
    soon = (date.today() + timedelta(days=60)).isoformat()  # ~84% of the card year gone
    assert verdict(conn, card(conn, "Free card", annual_fee=0))[0] == "Keep"
    assert verdict(conn, card(conn, "Pays for itself", annual_fee=1000, reward_points=1500))[0] == "Keep"
    assert verdict(conn, card(conn, "Strong", annual_fee=1000, reward_points=5000))[0] == "Upgrade-Candidate"
    behind = card(conn, "Behind on waiver", annual_fee=5000, reward_points=100, milestone_spend_target=500000,
                  milestone_spend_current=50000, renewal_date=soon)
    v, r = verdict(conn, behind)
    assert v == "Downgrade" and r["milestone_on_pace"] is False
    assert verdict(conn, card(conn, "Unused lounges", annual_fee=5000, reward_points=100, lounge_visits_limit=8, lounge_visits_used=1))[0] == "Downgrade"
    assert verdict(conn, card(conn, "Not worth it", annual_fee=499, reward_points=0))[0] == "Close"
    assert len(generate_credit_card_annual_reviews(conn)) == 6


# --- every parameter-free GET route answers on a fresh database -----------------------------

GET_ROUTES = ["/api/init", "/api/ai/settings", "/api/backup/details", "/api/backup/list", "/api/calendar", "/api/card-variants",
              "/api/cash-flows", "/api/credit-cards/annual-review", "/api/knowledge-articles", "/api/settings/database",
              "/api/settings/emi-profiles", "/api/snapshots", "/api/tax-profiles", "/api/tax/input-metadata", "/api/tax/prefill",
              "/api/tax/rule-sets", "/api/tax/scenarios"]


def test_get_routes_answer_on_a_fresh_database(test_db_path):
    from backend.main import app
    with TestClient(app) as client:
        failures = {r: client.get(r).status_code for r in GET_ROUTES}
        failures.update({"/api/tax/harvesting": client.get("/api/tax/harvesting", params={"person_id": 1}).status_code})
    assert {r: s for r, s in failures.items() if s != 200} == {}


def test_recommendations_reach_the_dashboard(conn):
    from backend.main import app
    liquid(conn, 5 * L)
    with TestClient(app) as client:
        data = client.get("/api/init").json()
    recs = data.get("recommendations") or data.get("decisions") or []
    assert any(r["category"] == "Emergency Fund" for r in recs), json.dumps(list(data))[:300]


def test_emi_profiles_save_update_list_delete(test_db_path):
    # The table was missing from init_db(); every save failed with "no such table".
    from backend.main import app
    body = {"name": "Home loan", "loan_amount": 5000000, "roi": 8.5, "tenure_value": 20, "tenure_unit": "years",
            "start_date": "2026-04-01", "prepayments": [{"date": "2027-04-01", "amount": 200000}]}
    with TestClient(app) as client:
        assert client.post("/api/settings/emi-profiles", json=body).status_code == 200
        assert client.post("/api/settings/emi-profiles", json={**body, "roi": 8.0}).status_code == 200  # same name: update
        (p,) = client.get("/api/settings/emi-profiles").json()
        assert p["roi"] == 8.0 and p["prepayments"][0]["amount"] == 200000
        assert client.delete(f"/api/settings/emi-profiles/{p['id']}").status_code == 200
        assert client.get("/api/settings/emi-profiles").json() == []
