from fastapi.testclient import TestClient

import backend.db as db


def test_rule_sets_endpoint_lists_available_years(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        resp = client.get("/api/tax/rule-sets")
    assert resp.status_code == 200
    assert {"2025-26", "2026-27"} <= {r["financial_year"] for r in resp.json()}


def test_compute_endpoint_round_trip(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        resp = client.post("/api/tax/compute", json={
            "financial_year": "2026-27",
            "inputs": {"salary": {"basic": 2702250, "hra": 1080900, "special_allowance": 1621350}},
        })
    assert resp.status_code == 200
    body = resp.json()
    assert body["rule_set"]["rule_set_id"] == "IN-TY2026-27"
    assert body["regimes"]["new"]["total_tax"] == 1348600
    assert body["computed_at"]


def test_compute_endpoint_rejects_bad_input_and_unknown_year(test_db_path):
    from backend.main import app

    with TestClient(app) as client:
        bad_input = client.post("/api/tax/compute", json={"inputs": {"salary": {"basic": -5}}})
        bad_year = client.post("/api/tax/compute", json={"financial_year": "1999-00", "inputs": {}})
    assert bad_input.status_code == 422
    assert bad_year.status_code == 400


def _category_id(client, entity_type, name):
    categories = client.get("/api/init").json()["categories"]
    return next(c["id"] for c in categories if c["entity_type"] == entity_type and c["name"] == name)


def test_profile_estimate_uses_engine_and_annualises_monthly_income(test_db_path):
    # Regression: the old estimate summed income.amount ignoring frequency (a monthly
    # salary row was counted as annual) and had no surcharge at all.
    from backend.main import app

    with TestClient(app) as client:
        assert client.post("/api/metadata/people",
                           json={"name": "Earner", "role": "Primary Owner", "risk_tolerance": "Moderate"}).status_code == 200
        person_id = client.get("/api/init").json()["people"][0]["id"]
        salary_cat = _category_id(client, "Income", "Salary")
        assert client.post("/api/entities/income", json={
            "name": "Salary", "category_id": salary_cat, "amount": 450375, "frequency": "Monthly", "taxable": 1,
        }).status_code == 200
        profile = client.post("/api/tax-profiles", json={
            "person_id": person_id, "financial_year": "2026-27", "regime": "New",
        })
        assert profile.status_code == 200
        estimate = client.get(f"/api/tax-profiles/{profile.json()['id']}/estimate")

    assert estimate.status_code == 200
    body = estimate.json()
    assert body["gross_income"] == 5404500 - 50000  # old-regime GTI after its 50k standard deduction
    assert body["taxable_income_new"] == 5329500
    assert body["new_regime"]["surcharge"] == 117885
    assert body["new_regime"]["total_tax"] == 1348600
    assert body["recommended_regime"] == "New"
    assert body["rule_set"]["rule_set_id"] == "IN-TY2026-27"


def test_legacy_tax_financial_rules_marked_superseded_once(initialized_db):
    db.init_db()  # second run must not prefix twice
    cursor = initialized_db.cursor()
    cursor.execute("SELECT description FROM financial_rules WHERE rule_key = 'section_80c_limit'")
    description = cursor.fetchone()["description"]
    assert description.startswith(db.TAX_RULE_SUPERSEDED_PREFIX)
    assert description.count(db.TAX_RULE_SUPERSEDED_PREFIX) == 1


def test_profile_estimate_for_year_without_rule_set_is_a_clear_400(test_db_path):
    # Taxation.tsx offers years on either side of the current one; a year with no
    # rule file must fail with a readable message (shown in the Estimate tab), not 500.
    from backend.main import app

    with TestClient(app) as client:
        client.post("/api/metadata/people", json={"name": "X", "role": "Primary Owner", "risk_tolerance": "Moderate"})
        person_id = client.get("/api/init").json()["people"][0]["id"]
        profile_id = client.post("/api/tax-profiles", json={"person_id": person_id, "financial_year": "1999-00"}).json()["id"]
        resp = client.get(f"/api/tax-profiles/{profile_id}/estimate")
    assert resp.status_code == 400
    assert "No tax rule set for financial year 1999-00" in resp.json()["detail"]


def _estimate_with_fund(client, lots, fund_type=None):
    """A person with one mutual fund worth 2,00,000 and the given lots; returns the estimate."""
    import json
    assert client.post("/api/metadata/people", json={"name": "Earner", "role": "Primary Owner", "risk_tolerance": "Moderate"}).status_code == 200
    person_id = client.get("/api/init").json()["people"][0]["id"]
    mf = _category_id(client, "Asset", "Mutual Fund")
    asset = client.post("/api/entities/assets", json={"name": "A fund", "category_id": mf, "owner_id": person_id, "current_value": 200000,
                                                      **({"fund_type": fund_type} if fund_type else {})}).json()["id"]
    for date_, qty, price in lots:
        client.post(f"/api/assets/{asset}/holdings", json={"purchase_date": date_, "quantity": qty, "price_per_unit": price})
    # Adding lots recomputes value; put today's value back.
    client.put(f"/api/entities/assets/{asset}", json={"name": "A fund", "category_id": mf, "owner_id": person_id, "current_value": 200000,
                                                       **({"fund_type": fund_type} if fund_type else {})})
    profile = client.post("/api/tax-profiles", json={"person_id": person_id, "financial_year": "2026-27", "regime": "New"}).json()["id"]
    return client.get(f"/api/tax-profiles/{profile}/estimate").json()


def test_estimate_leaves_out_holdings_with_no_recorded_cost(test_db_path):
    # The auto-migrated opening lot (1 unit at 0) made the whole value read as profit.
    from backend.main import app
    with TestClient(app) as client:
        body = _estimate_with_fund(client, [("2026-10-01", 1, 0)])
    assert body["capital_gains"] == {"stcg": 0, "ltcg": 0, "tax": 0}
    assert any("A fund is left out of unrealised gains" in w["message"] for w in body["warnings"])


def test_estimate_taxes_a_debt_fund_gain_at_slab_rate(test_db_path):
    from backend.main import app
    with TestClient(app) as client:
        body = _estimate_with_fund(client, [("2024-01-10", 1000, 100)], fund_type="Liquid")
    # A long-held gain of 1,00,000, but a liquid fund: slab rate, counted as short-term here.
    assert body["capital_gains"]["stcg"] == 100000 and body["capital_gains"]["ltcg"] == 0
