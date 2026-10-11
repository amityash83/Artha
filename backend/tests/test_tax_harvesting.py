"""Capital-gains harvesting: FIFO, the 112A allowance net of realised gains, loss offsets."""
from datetime import date

import pytest
from fastapi.testclient import TestClient

from backend.tax.harvesting import harvest_plan
from backend.tax.rules_loader import load_rule_set

FY = "2026-27"
RULES = load_rule_set(FY)
TODAY = date(2027, 2, 1)


def cat(conn, name):
    return conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]


def holding(conn, name, category, value, lots, owner=1):
    aid = conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value) VALUES (?, ?, ?, ?)",
                       (name, cat(conn, category), owner, value)).lastrowid
    for d, q, p in lots:
        conn.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit) VALUES (?, ?, ?, ?)", (aid, d, q, p))
    return aid


@pytest.fixture
def conn(initialized_db):
    c = initialized_db
    c.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner'), (2, 'Ravi', 'Spouse')")
    c.commit()
    return c


def test_uses_the_allowance_fifo_and_stops_at_short_term_lots(conn):
    # 150 units now worth 2,000 each (value 3,00,000). Lots: 100 @ 1,000 (Jan 2024, long-term);
    # 50 @ 1,500 (Jun 2026, short-term). Long-term gain available: 100 x 1,000 = 1,00,000 < 1,25,000.
    holding(conn, "INFY", "Stock", 300000, [("2024-01-10", 100, 1000), ("2026-06-01", 50, 1500)])
    conn.commit()
    out = harvest_plan(conn, 1, FY, RULES, today=TODAY)
    (s,) = out["gain_harvest"]
    assert s["units"] == 100 and s["gain"] == 100000 and s["sale_value"] == 200000
    assert out["exemption_left"] == 125000 and out["exemption_left_after"] == 25000
    assert s["future_tax_avoided"] == 12500  # 1,00,000 x 12.5%


def test_partial_lot_and_realised_gains_shrink_the_allowance(conn):
    # Already realised 30,000 of long-term equity gain this year: 95,000 of allowance left.
    aid = holding(conn, "TCS", "Stock", 300000, [("2024-01-10", 150, 1000)])
    conn.execute("""INSERT INTO capital_gains_realizations (asset_id, owner_id, asset_category, sale_date, financial_year, gain_amount, gain_type)
                    VALUES (?, 1, 'Stock', '2026-07-01', ?, 30000, 'LTCG')""", (aid, FY))
    conn.commit()
    out = harvest_plan(conn, 1, FY, RULES, today=TODAY)
    assert out["exemption_used"] == 30000 and out["exemption_left"] == 95000
    (s,) = out["gain_harvest"]
    assert s["units"] == 95 and s["gain"] == 95000  # whole shares only: 95 x 1,000


def test_allowance_is_shared_biggest_gain_first(conn):
    holding(conn, "Small gain fund", "Mutual Fund", 110000, [("2024-03-01", 1000, 100)])     # 10 a unit long-term: 10,000
    holding(conn, "Big gain stock", "Stock", 400000, [("2023-05-01", 200, 500)])              # 1,500 a unit: 3,00,000
    conn.commit()
    out = harvest_plan(conn, 1, FY, RULES, today=TODAY)
    big, small = out["gain_harvest"]
    assert big["asset"] == "Big gain stock" and big["units"] == 83 and big["gain"] == 124500  # whole shares: 83 x 1,500
    assert small["asset"] == "Small gain fund" and small["units"] == 50 and small["gain"] == 500  # the last 500, at 10 a unit
    assert out["exemption_left_after"] == 0
    assert any("debt funds" in n.lower() for n in out["notes"])


def test_loss_harvesting_offsets_this_years_gains(conn):
    # A fund 40,000 below cost (short-term). This year's realised short-term equity gain: 25,000.
    aid = holding(conn, "Midcap fund", "Mutual Fund", 60000, [("2026-05-01", 1000, 100)])
    conn.execute("""INSERT INTO capital_gains_realizations (asset_id, owner_id, asset_category, sale_date, financial_year, gain_amount, gain_type)
                    VALUES (?, 1, 'Stock', '2026-08-01', ?, 25000, 'STCG')""", (aid, FY))
    conn.commit()
    (s,) = harvest_plan(conn, 1, FY, RULES, today=TODAY)["loss_harvest"]
    assert s["loss"] == 40000 and s["short_term_loss"] == 40000
    assert s["tax_saved_this_year"] == 5000  # 25,000 offset x 20%
    assert s["carried_forward"] == 15000


def test_other_person_and_empty_lots_are_ignored(conn):
    holding(conn, "Ravi stock", "Stock", 300000, [("2024-01-10", 100, 1000)], owner=2)
    holding(conn, "No lots", "Stock", 50000, [])
    conn.commit()
    out = harvest_plan(conn, 1, FY, RULES, today=TODAY)
    assert out["gain_harvest"] == [] and out["loss_harvest"] == [] and out["holdings_considered"] == 0


def test_deadline_and_year_over(conn):
    assert harvest_plan(conn, 1, FY, RULES, today=TODAY)["days_left"] == 58  # 1 Feb -> 31 Mar 2027
    assert harvest_plan(conn, 1, FY, RULES, today=date(2027, 4, 2))["year_over"] is True


def test_route(conn):
    from backend.main import app
    holding(conn, "INFY", "Stock", 300000, [("2024-01-10", 100, 1000)])
    conn.commit()
    with TestClient(app) as client:
        r = client.get("/api/tax/harvesting", params={"person_id": 1, "financial_year": FY})
    assert r.status_code == 200 and r.json()["exemption"] == 125000
