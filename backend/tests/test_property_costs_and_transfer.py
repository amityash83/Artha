"""Property cost list (tax cost vs total paid) and bank-to-bank loan transfers."""
import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def setup(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.execute("INSERT OR IGNORE INTO institutions (id, name) VALUES (900, 'Old Bank'), (901, 'New Bank')")
    prop = conn.execute("SELECT id FROM categories WHERE name = 'Property'").fetchone()["id"]
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    flat = conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value, metadata_json) VALUES ('Flat', ?, 1, 9000000, ?)",
                        (prop, json.dumps({"invested_amount": 6000000}))).lastrowid
    loan = conn.execute("""INSERT INTO liabilities (name, category_id, owner_id, lender_institution_id, outstanding, interest_rate, emi, linked_asset_id, metadata_json)
                           VALUES ('Home', ?, 1, 900, 2500000, 9.0, 30000, ?, ?)""",
                        (home, flat, json.dumps({"emi_day": 5, "loan_use": "purchase", "status": "Active"}))).lastrowid
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('None', 'Liability', ?, 'Interest', 18750, '2026-09-05')""", (loan,))
    conn.commit()
    from backend.main import app
    with TestClient(app) as client:
        yield conn, client, flat, loan


def test_costs_split_into_tax_cost_and_total_paid(setup):
    conn, client, flat, loan = setup
    for kind, amount in (("purchase", 6000000), ("stamp_registration", 420000), ("buying_costs", 60000),
                         ("improvement", 500000), ("maintenance", 80000), ("loan_fee", 15000)):
        assert client.post(f"/api/assets/{flat}/property-costs", json={"cost_date": "2024-04-01", "kind": kind, "amount": amount}).status_code == 200
    s = client.get(f"/api/assets/{flat}/property-costs").json()
    assert s["tax_cost"] == 6000000 + 420000 + 60000 + 500000
    assert s["interest_recorded"] == 18750
    assert s["total_paid"] == 6000000 + 420000 + 60000 + 500000 + 80000 + 15000 + 18750
    assert s["gain_for_tax"] == 9000000 - s["tax_cost"]


def test_without_a_purchase_entry_the_amount_invested_is_used(setup):
    _, client, flat, _ = setup
    s = client.get(f"/api/assets/{flat}/property-costs").json()
    assert s["by_kind"]["purchase"] == 6000000 and "Amount invested" in s["notes"][0]


def test_bad_costs_are_refused_and_deletes_work(setup):
    _, client, flat, _ = setup
    assert client.post(f"/api/assets/{flat}/property-costs", json={"cost_date": "2024-04-01", "kind": "party", "amount": 1}).status_code == 422
    s = client.post(f"/api/assets/{flat}/property-costs", json={"cost_date": "2024-04-01", "kind": "maintenance", "amount": 5000}).json()
    cid = s["entries"][0]["id"]
    assert client.delete(f"/api/assets/{flat}/property-costs/{cid}").json()["entries"] == []


def test_a_balance_transfer_moves_the_debt_and_keeps_the_history(setup):
    conn, client, flat, loan = setup
    res = client.post(f"/api/liabilities/{loan}/transfer", json={"lender_institution_id": 901, "name": "Home (New Bank)",
                                                                 "interest_rate": 8.1, "emi": 28500, "transfer_date": "2026-10-20", "fees": 11800})
    assert res.status_code == 200, res.text
    new = res.json()["new_loan_id"]
    rows = {r["id"]: dict(r) for r in conn.execute("SELECT id, outstanding, linked_asset_id, interest_rate, metadata_json FROM liabilities")}
    assert rows[loan]["outstanding"] == 0 and rows[new]["outstanding"] == 2500000
    assert rows[new]["linked_asset_id"] == flat and rows[new]["interest_rate"] == 8.1
    old_meta, new_meta = json.loads(rows[loan]["metadata_json"]), json.loads(rows[new]["metadata_json"])
    assert old_meta["status"] == "Closed" and old_meta["transferred_to"] == new
    assert new_meta["loan_use"] == "purchase" and new_meta["emi_day"] == 5 and new_meta["transferred_from"] == loan
    s = client.get(f"/api/assets/{flat}/property-costs").json()
    assert s["interest_recorded"] == 18750  # the old loan's interest still counts towards the property
    assert s["by_kind"]["loan_fee"] == 11800


def test_the_transfer_row_cannot_be_edited_or_deleted_directly(setup):
    conn, client, flat, loan = setup
    client.post(f"/api/liabilities/{loan}/transfer", json={"name": "Home (New Bank)", "interest_rate": 8.1, "emi": 28500, "transfer_date": "2026-10-20"})
    tx = conn.execute("SELECT id FROM transactions WHERE type = 'Transfer' AND source_ref_type = 'Liability'").fetchone()["id"]
    assert client.delete(f"/api/entities/transactions/{tx}").status_code == 409
    assert client.put(f"/api/entities/transactions/{tx}", json={"type": "Transfer", "account_id": 1, "amount": 5, "transaction_date": "2026-10-20",
                                                              "related_entity_id": 1, "notes": ""}).status_code == 409


def test_undo_puts_the_old_loan_back_exactly(setup):
    conn, client, flat, loan = setup
    conn.execute("UPDATE liabilities SET metadata_json = json_set(metadata_json, '$.auto_emi', 1, '$.emi_account_id', 5, '$.auto_emi_since', '2026-12-01') WHERE id = ?", (loan,))
    conn.commit()
    before = dict(conn.execute("SELECT outstanding, metadata_json FROM liabilities WHERE id = ?", (loan,)).fetchone())
    new = client.post(f"/api/liabilities/{loan}/transfer", json={"name": "Home (New Bank)", "interest_rate": 8.1, "emi": 28500,
                                                                 "transfer_date": "2026-10-20", "fees": 5000}).json()["new_loan_id"]
    assert client.post(f"/api/liabilities/{new}/undo-transfer").status_code == 200
    after = dict(conn.execute("SELECT outstanding, metadata_json FROM liabilities WHERE id = ?", (loan,)).fetchone())
    assert after["outstanding"] == before["outstanding"]
    assert json.loads(after["metadata_json"]) == json.loads(before["metadata_json"])
    assert conn.execute("SELECT COUNT(*) FROM liabilities WHERE id = ?", (new,)).fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM property_costs").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM transactions WHERE type = 'Transfer'").fetchone()[0] == 0


def test_undo_is_refused_once_the_new_loan_has_entries(setup):
    conn, client, flat, loan = setup
    new = client.post(f"/api/liabilities/{loan}/transfer", json={"name": "Home (New Bank)", "interest_rate": 8.1, "emi": 28500,
                                                                 "transfer_date": "2026-10-20"}).json()["new_loan_id"]
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('None', 'Liability', ?, 'Interest', 100, '2026-11-05')""", (new,))
    conn.commit()
    assert client.post(f"/api/liabilities/{new}/undo-transfer").status_code == 409


def test_due_emis_are_posted_before_the_move_and_the_new_loan_starts_next_day(setup):
    conn, client, flat, loan = setup
    acc = conn.execute("INSERT INTO accounts (name, institution_id, owner_id) VALUES ('Savings', 900, 1)").lastrowid
    conn.execute("UPDATE liabilities SET metadata_json = json_set(metadata_json, '$.auto_emi', 1, '$.emi_account_id', ?, '$.auto_emi_since', '2026-09-01') WHERE id = ?",
                 (acc, loan))
    conn.commit()
    res = client.post(f"/api/liabilities/{loan}/transfer", json={"name": "Home (New Bank)", "interest_rate": 8.1, "emi": 28500,
                                                                 "transfer_date": "2026-10-05"}).json()
    # September and 5 October posted on the old loan before its balance moved.
    emis = conn.execute("SELECT transaction_date FROM transactions WHERE type = 'EMI' AND dest_ref_id = ? ORDER BY 1", (loan,)).fetchall()
    assert [r[0] for r in emis] == ["2026-09-05", "2026-10-05"]
    assert res["amount"] < 2500000 + 18750  # less than before the EMIs
    new_meta = json.loads(conn.execute("SELECT metadata_json FROM liabilities WHERE id = ?", (res["new_loan_id"],)).fetchone()[0])
    assert new_meta["auto_emi_since"] == "2026-10-06"


def test_fees_without_a_property_are_reported(setup):
    conn, client, flat, loan = setup
    conn.execute("UPDATE liabilities SET linked_asset_id = NULL WHERE id = ?", (loan,)); conn.commit()
    res = client.post(f"/api/liabilities/{loan}/transfer", json={"name": "X", "interest_rate": 8, "emi": 1, "transfer_date": "2026-10-20", "fees": 900}).json()
    assert "weren't recorded" in res["note"]


def test_cards_and_paid_off_loans_cannot_be_transferred(setup):
    conn, client, _, loan = setup
    conn.execute("UPDATE liabilities SET outstanding = 0 WHERE id = ?", (loan,)); conn.commit()
    assert client.post(f"/api/liabilities/{loan}/transfer", json={"name": "X", "interest_rate": 8, "emi": 1, "transfer_date": "2026-10-20"}).status_code == 422
