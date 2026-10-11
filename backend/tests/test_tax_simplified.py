"""Pieces behind the simplified Taxation page: realised and unrealised gains by person and
year, the old-regime break-even, the Quick estimate's figures offered in Fill from my data,
and the AI assistant reading the Planner's saved plans."""
import json

from fastapi.testclient import TestClient

from backend.ai.context import build_ask_context
from backend.tax import prefill as prefill_mod

INPUTS = {"salary": {"basic": 1200000, "hra": 480000, "special_allowance": 720000}}


def _client():
    from backend.main import app
    return TestClient(app)


def _asset(conn, name="Index fund", cat="Mutual Fund", value=300000):
    cid = conn.execute("SELECT id FROM categories WHERE name = ?", (cat,)).fetchone()["id"]
    return conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value) VALUES (?, ?, 1, ?)", (name, cid, value)).lastrowid


def test_realised_gains_by_person_and_year(initialized_db):
    aid = _asset(initialized_db)
    for fy, day, gain in (("2026-27", "2026-06-01", 5000), ("2026-27", "2026-09-01", -1200), ("2025-26", "2025-06-01", 999)):
        initialized_db.execute("""INSERT INTO capital_gains_realizations (asset_id, owner_id, asset_category, sale_date, financial_year,
                                  quantity_sold, sale_value, cost_basis, gain_amount, gain_type) VALUES (?, 1, 'Mutual Fund', ?, ?, 1, 1, 1, ?, 'LTCG')""",
                               (aid, day, fy, gain))
    initialized_db.commit()
    with _client() as client:
        rows = client.get("/api/tax/realised-gains?person_id=1&financial_year=2026-27").json()
        assert [(r["sale_date"], r["gain_amount"], r["asset_name"]) for r in rows] == [("2026-09-01", -1200, "Index fund"), ("2026-06-01", 5000, "Index fund")]
        assert client.get("/api/tax/realised-gains?person_id=2&financial_year=2026-27").json() == []
        assert client.get("/api/tax/realised-gains?person_id=1&financial_year=26-27").status_code == 422


def test_unrealised_gains(initialized_db):
    aid = _asset(initialized_db, value=300000)
    initialized_db.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit) VALUES (?, '2020-01-01', 1000, 200)", (aid,))
    initialized_db.commit()
    with _client() as client:
        out = client.get("/api/tax/unrealised-gains?person_id=1").json()
    assert out["gains"]["ltcg_112a"] == 100000 and out["total"] == 100000


def test_break_even_route(initialized_db):
    with _client() as client:
        r = client.post("/api/tax/break-even", json={"financial_year": "2026-27", "inputs": INPUTS})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "found" and body["additional_deductions_needed"] > 0
        bad = client.post("/api/tax/break-even", json={"financial_year": "2026-27", "inputs": {"salary": {"basic": "lots"}}})
        assert bad.status_code == 422


def test_quick_estimate_figures_are_offered_in_fill_from_my_data(initialized_db):
    initialized_db.execute("INSERT OR IGNORE INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    pid = initialized_db.execute("""INSERT INTO tax_profiles (person_id, financial_year, regime, age_band, hra_rent_paid, hra_basic_salary, hra_received,
                                    is_metro_city, home_loan_interest_self_occupied, other_income_reported, tds_deducted, advance_tax_paid)
                                    VALUES (1, '2026-27', 'Old', 'Below60', 240000, 600000, 240000, 1, 150000, 20000, 90000, 15000)""").lastrowid
    initialized_db.execute("INSERT INTO tax_deductions (tax_profile_id, section, label, amount) VALUES (?, '80C', 'PPF', 150000)", (pid,))
    initialized_db.commit()
    out = prefill_mod.prefill(initialized_db, "2026-27", 1)
    got = {(i["target"], i["amount"]) for i in out["items"] if i["source"]["type"] in ("tax_profile", "tax_deduction")}
    assert got == {("hra.rent_paid_monthly", 20000.0), ("deductions.home_loan_interest_self_occupied", 150000.0), ("other_income.other", 20000.0),
                   ("prepaid.tds", 90000.0), ("prepaid.advance_tax", 15000.0), ("deductions.80C.other", 150000.0)}
    assert all("Quick estimate" in i["explanation"] for i in out["items"] if i["source"]["type"] in ("tax_profile", "tax_deduction"))
    assert "prepaid.tds" in out["monthly_grid_targets"]


def test_ai_context_reads_the_planner_plans(initialized_db):
    initialized_db.execute("INSERT INTO tax_planner_drafts (slot, content_json) VALUES ('p1-2026-27', ?)",
                           (json.dumps({"inputs": {**INPUTS, "monthly": {"enabled": True}}, "financialYear": "2026-27"}),))
    initialized_db.execute("INSERT INTO tax_planner_drafts (slot, content_json) VALUES ('default', '{}')")
    initialized_db.commit()
    prompt = json.dumps(build_ask_context(initialized_db, "How much tax will I pay?"), default=str)
    assert "tax_plans" in prompt and "2026-27" in prompt and "1200000" in prompt and '"monthly"' not in prompt


def test_quick_estimate_80d_above_the_limit_goes_to_parents_and_other_is_kept(initialized_db):
    from backend.tax import rules_loader
    initialized_db.execute("INSERT OR IGNORE INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    pid = initialized_db.execute("INSERT INTO tax_profiles (person_id, financial_year, regime, age_band) VALUES (1, '2026-27', 'Old', 'Below60')").lastrowid
    for section, amount in (("80D", 40000), ("Other", 7000), ("80TTA", 10000)):
        initialized_db.execute("INSERT INTO tax_deductions (tax_profile_id, section, label, amount) VALUES (?, ?, ?, ?)", (pid, section, section, amount))
    initialized_db.commit()
    rules = rules_loader.load_rule_set("2026-27")
    out = prefill_mod.prefill(initialized_db, "2026-27", 1, rules=rules)
    got = sorted((i["target"], i["amount"]) for i in out["items"] if i["source"]["type"] == "tax_deduction")
    assert got == [("deductions.80D_parents", 15000.0), ("deductions.80D_self_family", 25000.0), ("deductions.other_old", 7000.0)]
