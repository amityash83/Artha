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
