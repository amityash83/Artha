"""Deleting an account, asset or loan: its ledger entries go with it, undone; nothing orphaned."""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(test_db_path):
    from backend.main import app
    with TestClient(app) as c:
        c.post("/api/metadata/people", json={"name": "Asha", "role": "Primary Owner", "risk_tolerance": "Moderate"})
        yield c


def _setup(client):
    init = client.get("/api/init").json()
    cat = lambda t, n: next(c["id"] for c in init["categories"] if c["entity_type"] == t and c["name"] == n)
    bank = init["institutions"][0]["id"]
    acc = client.post("/api/entities/accounts", json={"name": "Savings", "institution_id": bank, "current_balance": 500000}).json()["id"]
    flat = client.post("/api/entities/assets", json={"name": "Flat", "category_id": cat("Asset", "Property"), "current_value": 9000000}).json()["id"]
    loan = client.post("/api/entities/liabilities", json={"name": "Home", "category_id": cat("Liability", "Home Loan"), "outstanding": 1000000,
                                                          "interest_rate": 8.4, "emi": 20000}).json()["id"]
    client.put(f"/api/liabilities/{loan}/property", json={"asset_id": flat})
    client.post("/api/entities/transactions", json={"type": "EMI", "account_id": acc, "amount": 20000, "transaction_date": "2026-10-05",
                                                    "notes": "", "related_entity_type": "Liability", "related_entity_id": loan})
    return acc, flat, loan


def _owed(client, loan):
    return next(l["outstanding"] for l in client.get("/api/init").json()["liabilities"] if l["id"] == loan)


def test_a_plain_delete_with_entries_is_refused_and_says_why(client):
    acc, _, _ = _setup(client)
    res = client.delete(f"/api/entities/accounts/{acc}")
    assert res.status_code == 409 and "ledger entr" in res.json()["detail"]


def test_deleting_an_account_with_entries_undoes_their_other_side(client):
    acc, _, loan = _setup(client)
    assert _owed(client, loan) == 980000
    assert client.delete(f"/api/entities/accounts/{acc}?with_entries=true").status_code == 200
    assert _owed(client, loan) == 1000000  # the EMI it paid is gone, so the loan is back up
    assert client.get("/api/entities/transactions").json() == []


def test_deleting_a_property_clears_its_rows_and_unlinks_its_loan(client, test_db_path):
    import sqlite3
    _, flat, loan = _setup(client)
    client.post(f"/api/assets/{flat}/property-costs", json={"cost_date": "2024-04-01", "kind": "maintenance", "amount": 5000})
    assert client.delete(f"/api/entities/assets/{flat}?with_entries=true").status_code == 200
    db = sqlite3.connect(test_db_path)
    assert db.execute("SELECT COUNT(*) FROM property_costs").fetchone()[0] == 0
    assert db.execute("SELECT linked_asset_id FROM liabilities WHERE id = ?", (loan,)).fetchone()[0] is None


def test_deleting_a_loan_clears_its_rate_history(client, test_db_path):
    import sqlite3
    _, _, loan = _setup(client)
    client.post(f"/api/liabilities/{loan}/rate-changes", json={"effective_date": "2026-01-01", "rate": 8.9})
    assert client.delete(f"/api/entities/liabilities/{loan}?with_entries=true").status_code == 200
    assert sqlite3.connect(test_db_path).execute("SELECT COUNT(*) FROM loan_rate_changes").fetchone()[0] == 0


def test_a_loan_in_a_balance_transfer_cannot_be_deleted(client):
    _, _, loan = _setup(client)
    new = client.post(f"/api/liabilities/{loan}/transfer", json={"name": "Home (New)", "interest_rate": 8, "emi": 19000,
                                                                 "transfer_date": "2026-10-20"}).json()["new_loan_id"]
    for target in (loan, new):
        res = client.delete(f"/api/entities/liabilities/{target}?with_entries=true")
        assert res.status_code == 409 and "Undo this transfer" in res.json()["detail"]


def test_income_and_goals_delete_as_before(client):
    init = client.get("/api/init").json()
    salary = next(c["id"] for c in init["categories"] if c["name"] == "Salary")
    inc = client.post("/api/entities/income", json={"name": "Salary", "category_id": salary, "amount": 1, "frequency": "Monthly"}).json()["id"]
    assert client.delete(f"/api/entities/income/{inc}").status_code == 200
