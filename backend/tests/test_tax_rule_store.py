"""User-editable tax rule sets and saved scenarios, exercised through the API."""
import copy

import pytest
from fastapi.testclient import TestClient

from backend.tax import rules_loader

SPEC_INPUTS = {"salary": {"basic": 2702250, "hra": 1080900, "special_allowance": 1621350}}


@pytest.fixture
def client(test_db_path):
    from backend.main import app

    with TestClient(app) as c:
        yield c


def _copy(client, name="My 2026-27", based_on="IN-TY2026-27", **extra):
    resp = client.post("/api/tax/rule-sets", json={"name": name, "based_on_rule_set_id": based_on, **extra})
    assert resp.status_code == 200, resp.text
    return resp.json()


def _content(client, rule_set_id, version=None):
    url = f"/api/tax/rule-sets/{rule_set_id}" + (f"?version={version}" if version else "")
    return client.get(url).json()["content"]


def _new_regime_tax(client, **request):
    resp = client.post("/api/tax/compute", json={"inputs": SPEC_INPUTS, **request})
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_list_includes_shipped_sets_marked_as_applying(client):
    sets = client.get("/api/tax/rule-sets").json()
    shipped = [s for s in sets if s["source"] == "shipped"]
    assert {s["rule_set_id"] for s in shipped} >= {"IN-TY2026-27", "IN-FY2025-26"}
    assert all(s["applies_to_fy"] for s in shipped)


def test_copy_creates_user_set_version_1_with_unchanged_verification(client):
    meta = _copy(client)
    assert meta["rule_set_id"] == "USER-MY-2026-27"
    assert meta["version"] == 1 and meta["source"] == "user"
    content = _content(client, meta["rule_set_id"])
    shipped = rules_loader.shipped_rule_sets()["IN-TY2026-27"]
    assert content["regimes"]["new"]["slabs"] == shipped["regimes"]["new"]["slabs"]


def test_user_ids_never_collide(client):
    first = _copy(client, name="Draft")
    second = _copy(client, name="Draft")
    assert first["rule_set_id"] != second["rule_set_id"]


def test_shipped_rule_sets_are_read_only(client):
    content = copy.deepcopy(rules_loader.shipped_rule_sets()["IN-TY2026-27"])
    assert client.put("/api/tax/rule-sets/IN-TY2026-27", json={"content": content}).status_code == 403
    assert client.delete("/api/tax/rule-sets/IN-TY2026-27").status_code == 403
    assert client.post("/api/tax/rule-sets/IN-TY2026-27/archive").status_code == 403


def test_edit_creates_new_version_and_tags_changed_items_user_entered(client):
    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["regimes"]["new"]["standard_deduction"]["value"] = 100000
    resp = client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content, "note": "budget proposal"})
    assert resp.status_code == 200
    assert resp.json()["version"] == 2

    v2 = _content(client, meta["rule_set_id"])
    assert v2["regimes"]["new"]["standard_deduction"]["verification"] == "user_entered"
    assert "source" not in v2["regimes"]["new"]["standard_deduction"]
    # Untouched items keep their original verification.
    assert v2["regimes"]["new"]["slabs"]["verification"] == "secondary_source"
    # Version 1 is still intact.
    assert _content(client, meta["rule_set_id"], 1)["regimes"]["new"]["standard_deduction"]["value"] == 75000

    versions = client.get(f"/api/tax/rule-sets/{meta['rule_set_id']}/versions").json()
    assert [v["version"] for v in versions] == [2, 1]

    diff = client.get(f"/api/tax/rule-sets/{meta['rule_set_id']}/diff").json()
    paths = {c["path"] for c in diff["changes"]}
    assert "regimes.new.standard_deduction.value" in paths
    assert diff["against"]["version"] == 1


def test_saving_identical_content_does_not_create_a_version(client):
    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    resp = client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})
    assert resp.json()["version"] == 1 and resp.json()["unchanged"] is True


def test_invalid_edits_are_rejected_with_the_validation_reason(client):
    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["regimes"]["new"]["slabs"]["value"]["default"].reverse()
    resp = client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})
    assert resp.status_code == 422
    assert "ascending" in resp.json()["detail"] or "null" in resp.json()["detail"]


def test_financial_year_cannot_change_on_edit(client):
    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["financial_year"] = "2027-28"
    assert client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content}).status_code == 422


def test_copy_to_a_new_year_marks_carried_over_values_as_assumptions(client):
    meta = _copy(client, name="Draft 2027-28", financial_year="2027-28")
    content = _content(client, meta["rule_set_id"])
    assert content["financial_year"] == "2027-28"
    assert content["assessment_year"] == "2028-29"
    assert content["effective_from"] == "2027-04-01"
    item = content["regimes"]["new"]["slabs"]
    assert item["verification"] == "assumption"
    assert "Carried over unchanged from 2026-27" in item["note"]


def test_selection_changes_which_rules_compute_and_estimate_use(client):
    baseline = _new_regime_tax(client, financial_year="2026-27")
    assert baseline["regimes"]["new"]["total_tax"] == 1348600
    assert baseline["rule_set"]["source"] == "shipped"

    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["regimes"]["new"]["standard_deduction"]["value"] = 175000  # 1L more deduction
    client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})

    # Not selected yet: the shipped set still applies.
    assert _new_regime_tax(client, financial_year="2026-27")["regimes"]["new"]["total_tax"] == 1348600
    assert client.put("/api/tax/rule-set-selection/2026-27", json={"rule_set_id": meta["rule_set_id"]}).status_code == 200
    selected = _new_regime_tax(client, financial_year="2026-27")
    assert selected["rule_set"]["rule_set_id"] == meta["rule_set_id"]
    assert selected["rule_set"]["source"] == "user"
    # TI 52,29,500: slab 3,00,000 + 28,29,500 x 30% = 11,48,850; surcharge 1,14,885; cess 50,549.40
    # -> 13,14,284.40 -> 13,14,280
    assert selected["regimes"]["new"]["total_tax"] == 1314280
    assert any(line.get("verification") == "user_entered" for line in selected["regimes"]["new"]["audit"])

    listing = {s["rule_set_id"]: s for s in client.get("/api/tax/rule-sets").json()}
    assert listing[meta["rule_set_id"]]["applies_to_fy"] is True
    assert listing["IN-TY2026-27"]["applies_to_fy"] is False

    # Clearing the selection reverts to the shipped set.
    client.put("/api/tax/rule-set-selection/2026-27", json={"rule_set_id": None})
    assert _new_regime_tax(client, financial_year="2026-27")["regimes"]["new"]["total_tax"] == 1348600


def test_selection_rejects_a_set_for_another_year(client):
    meta = _copy(client, name="Draft 2027-28", financial_year="2027-28")
    resp = client.put("/api/tax/rule-set-selection/2026-27", json={"rule_set_id": meta["rule_set_id"]})
    assert resp.status_code == 422


def test_draft_year_becomes_computable_once_copied(client):
    assert client.post("/api/tax/compute", json={"financial_year": "2027-28", "inputs": SPEC_INPUTS}).status_code == 400
    meta = _copy(client, name="Draft 2027-28", financial_year="2027-28")
    client.put("/api/tax/rule-set-selection/2027-28", json={"rule_set_id": meta["rule_set_id"]})
    result = _new_regime_tax(client, financial_year="2027-28")
    assert result["rule_set"]["financial_year"] == "2027-28"
    assert any(w["code"] == "rule_assumption" for w in result["warnings"])


def test_import_json_round_trip(client):
    exported = client.get("/api/tax/rule-sets/IN-FY2025-26").json()["content"]
    resp = client.post("/api/tax/rule-sets", json={"name": "Imported", "content": exported})
    assert resp.status_code == 200
    assert resp.json()["financial_year"] == "2025-26"
    bad = client.post("/api/tax/rule-sets", json={"name": "Broken", "content": {"regimes": {}}})
    assert bad.status_code == 422


def test_scenarios_snapshot_rules_and_block_deleting_rules_in_use(client):
    meta = _copy(client)
    saved = client.post("/api/tax/scenarios", json={
        "name": "Base case", "inputs": SPEC_INPUTS, "rule_set_id": meta["rule_set_id"],
    })
    assert saved.status_code == 200, saved.text
    scenario = saved.json()
    assert scenario["rule_set_id"] == meta["rule_set_id"] and scenario["rule_set_version"] == 1
    assert scenario["new_total_tax"] == 1348600
    assert scenario["result"]["regimes"]["new"]["audit"]

    resp = client.delete(f"/api/tax/rule-sets/{meta['rule_set_id']}")
    assert resp.status_code == 409 and "archive" in resp.json()["detail"]
    assert client.post(f"/api/tax/rule-sets/{meta['rule_set_id']}/archive").json()["status"] == "archived"
    content = _content(client, meta["rule_set_id"])
    assert client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content}).status_code == 409
    assert client.post(f"/api/tax/rule-sets/{meta['rule_set_id']}/restore").json()["status"] == "active"

    # The saved snapshot still loads after the rule set gains new versions.
    content["regimes"]["new"]["standard_deduction"]["value"] = 175000
    client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})
    again = client.get(f"/api/tax/scenarios/{scenario['id']}").json()
    assert again["rule_set_version"] == 1 and again["new_total_tax"] == 1348600


def test_recalculate_uses_current_rules_and_keeps_the_original(client):
    original = client.post("/api/tax/scenarios", json={
        "name": "Base", "inputs": SPEC_INPUTS, "financial_year": "2026-27"}).json()
    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["regimes"]["new"]["standard_deduction"]["value"] = 175000
    client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})
    client.put("/api/tax/rule-set-selection/2026-27", json={"rule_set_id": meta["rule_set_id"]})

    recalc = client.post(f"/api/tax/scenarios/{original['id']}/recalculate").json()
    assert recalc["rules_changed"] is True
    assert recalc["new_regime_tax_change"] == 1314280 - 1348600
    assert recalc["recalculated"]["recalculated_from"] == original["id"]
    assert client.get(f"/api/tax/scenarios/{original['id']}").json()["new_total_tax"] == 1348600
    assert len(client.get("/api/tax/scenarios").json()) == 2


def test_scenario_delete_then_rule_set_delete_succeeds(client):
    meta = _copy(client)
    scenario = client.post("/api/tax/scenarios", json={"name": "x", "inputs": {}, "rule_set_id": meta["rule_set_id"]}).json()
    assert client.delete(f"/api/tax/scenarios/{scenario['id']}").status_code == 200
    assert client.delete(f"/api/tax/rule-sets/{meta['rule_set_id']}").status_code == 200
    assert client.get(f"/api/tax/rule-sets/{meta['rule_set_id']}").status_code == 404


def test_input_metadata_matches_engine_inputs(client):
    from backend.tax.engine import DEFAULT_INPUTS

    meta = client.get("/api/tax/input-metadata").json()
    assert meta["default_financial_year"]
    for section in ("payroll_deductions", "employer_contributions", "other_income", "capital_gains"):
        assert {f["key"] for f in meta[section]} == set(DEFAULT_INPUTS[section]), section
    assert {f["key"] for f in meta["salary_components"]} == set(DEFAULT_INPUTS["salary"])
    for field in meta["deduction_fields"]:
        node = DEFAULT_INPUTS
        for part in field["path"].split("."):
            assert part in node, field["path"]
            node = node[part]


def test_estimate_respects_the_selected_rule_set(client):
    client.post("/api/metadata/people", json={"name": "E", "role": "Primary Owner", "risk_tolerance": "Moderate"})
    init = client.get("/api/init").json()
    person_id = init["people"][0]["id"]
    salary_cat = next(c["id"] for c in init["categories"] if c["entity_type"] == "Income" and c["name"] == "Salary")
    client.post("/api/entities/income", json={"name": "Salary", "category_id": salary_cat, "amount": 450375,
                                              "frequency": "Monthly", "taxable": 1})
    profile_id = client.post("/api/tax-profiles", json={"person_id": person_id, "financial_year": "2026-27"}).json()["id"]

    meta = _copy(client)
    content = _content(client, meta["rule_set_id"])
    content["regimes"]["new"]["standard_deduction"]["value"] = 175000
    client.put(f"/api/tax/rule-sets/{meta['rule_set_id']}", json={"content": content})
    client.put("/api/tax/rule-set-selection/2026-27", json={"rule_set_id": meta["rule_set_id"]})

    estimate = client.get(f"/api/tax-profiles/{profile_id}/estimate").json()
    assert estimate["new_regime"]["total_tax"] == 1314280
    assert estimate["rule_set"]["rule_set_id"] == meta["rule_set_id"]


def test_import_cannot_claim_provenance_for_values_that_differ_from_official(client):
    exported = client.get("/api/tax/rule-sets/IN-TY2026-27").json()["content"]
    exported["regimes"]["new"]["standard_deduction"]["value"] = 150000
    exported["regimes"]["new"]["standard_deduction"]["verification"] = "verified"  # a false claim
    meta = client.post("/api/tax/rule-sets", json={"name": "Shared file", "content": exported}).json()
    content = _content(client, meta["rule_set_id"])
    assert content["regimes"]["new"]["standard_deduction"]["verification"] == "user_entered"
    # Values identical to the official set keep their provenance.
    assert content["regimes"]["new"]["slabs"]["verification"] == "secondary_source"
    assert meta["based_on_rule_set_id"] == "IN-TY2026-27"


def test_import_for_a_year_with_no_official_set_is_entirely_user_entered(client):
    exported = client.get("/api/tax/rule-sets/IN-TY2026-27").json()["content"]
    exported.update({"financial_year": "2030-31", "assessment_year": "2031-32",
                     "effective_from": "2030-04-01", "effective_to": "2031-03-31"})
    meta = client.post("/api/tax/rule-sets", json={"name": "Future", "content": exported}).json()
    content = _content(client, meta["rule_set_id"])
    from backend.tax.rule_store import _iter_items
    assert {item["verification"] for _, item in _iter_items(content)} == {"user_entered"}
