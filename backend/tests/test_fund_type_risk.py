"""Fund type -> effective risk, and goals limited to low-risk holdings."""
import json

import pytest
from fastapi.testclient import TestClient

from backend.decision_engine import generate_recommendations
from backend.risk import effective_risk


@pytest.mark.parametrize("category,risk,meta,expected", [
    ("Mutual Fund", "Medium", {"fund_type": "Liquid"}, "Low"),
    ("Mutual Fund", "Low", {"fund_type": "Equity"}, "High"),   # the fund type wins
    ("Mutual Fund", "Medium", {}, "Medium"),                    # no type yet
    ("Mutual Fund", "Low", {}, "Low"),                          # set by hand
    ("Fixed Deposit", "Medium", {}, "Low"),                     # the kind of asset decides
    ("Stock", "Medium", {}, "High"),
    ("Stock", "Low", {}, "Low"),                                # an explicit choice is honoured
    ("Gold", "Medium", "not json", "Medium"),
])
def test_effective_risk(category, risk, meta, expected):
    assert effective_risk(category, risk, meta) == expected


def _goal_with(conn, fund_type, low_risk_only=True, exclude_mutual_funds=False):
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    mf = conn.execute("SELECT id FROM categories WHERE name = 'Mutual Fund'").fetchone()["id"]
    gid = conn.execute("INSERT INTO goals (name, target_amount, current_amount, monthly_contribution, funding_sources_json) VALUES (?, 300000, 0, 0, ?)",
                       ("Insurance Reserve", json.dumps({"low_risk_only": low_risk_only}))).lastrowid
    aid = conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value, metadata_json) VALUES ('ICICI Liquid', ?, 1, 160000, ?)",
                       (mf, json.dumps({"fund_type": fund_type}))).lastrowid
    conn.execute("INSERT INTO goal_holdings (goal_id, asset_id, allocation_weight) VALUES (?, ?, 1.0)", (gid, aid))
    if exclude_mutual_funds:
        conn.execute("INSERT INTO goal_funding_constraints (goal_id, excluded_category_id) VALUES (?, ?)", (gid, mf))
    conn.commit()


def _funding_recs(conn):
    return [r for r in generate_recommendations(conn) if r["category"] == "Goal Funding"]


def test_liquid_fund_is_fine_for_a_low_risk_goal(initialized_db):
    _goal_with(initialized_db, "Liquid")
    assert _funding_recs(initialized_db) == []


def test_equity_fund_is_flagged_for_a_low_risk_goal(initialized_db):
    _goal_with(initialized_db, "Equity")
    (rec,) = _funding_recs(initialized_db)
    assert "high-risk" in rec["title"] and "ICICI Liquid (equity fund, high risk)" in rec["message"]


def test_category_restriction_message_is_plain(initialized_db):
    _goal_with(initialized_db, "Liquid", low_risk_only=False, exclude_mutual_funds=True)
    (rec,) = _funding_recs(initialized_db)
    assert rec["title"] == "Insurance Reserve uses a kind of asset it shouldn't"
    assert "Counts towards goal" in rec["message"] and "Violated" not in rec["title"]


def test_init_exposes_effective_risk_and_the_goal_setting(initialized_db):
    _goal_with(initialized_db, "Liquid")
    from backend.main import app
    with TestClient(app) as client:
        data = client.get("/api/init").json()
    (asset,) = [a for a in data["assets"] if a["name"] == "ICICI Liquid"]
    (goal,) = data["goals"]
    assert asset["effective_risk"] == "Low" and goal["low_risk_only"] is True
