"""How ledger entries move loan and card balances.

The behaviour comes from where the money goes, not the entry's label:
  account/asset -> loan or card   pays it down    (EMI, prepayment, card bill)
  outside       -> loan or card   is a charge     (card spend, loan interest, fees)
  loan          -> account        is borrowing    (a disbursal or top-up into the bank)
The first block pins what existing entries already did, so the switch to direction-based
rules can't change any balance on an existing database.
"""
import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(test_db_path):
    from backend.main import app
    with TestClient(app) as c:
        c.post("/api/metadata/people", json={"name": "Asha", "role": "Primary Owner", "risk_tolerance": "Moderate"})
        yield c


def _ids(client):
    init = client.get("/api/init").json()
    cat = lambda t, n: next(c["id"] for c in init["categories"] if c["entity_type"] == t and c["name"] == n)
    bank = init["institutions"][0]["id"]
    acc = client.post("/api/entities/accounts", json={"name": "Savings", "institution_id": bank, "current_balance": 500000}).json()["id"]
    loan = client.post("/api/entities/liabilities", json={"name": "Home", "category_id": cat("Liability", "Home Loan"), "outstanding": 1000000,
                                                          "interest_rate": 8.4, "emi": 20000}).json()["id"]
    card = client.post("/api/entities/liabilities", json={"name": "Card", "category_id": cat("Liability", "Credit Card"), "outstanding": 0}).json()["id"]
    return acc, loan, card, cat("Expense", "Grocery")


def _owed(client, liability_id):
    return next(l["outstanding"] for l in client.get("/api/init").json()["liabilities"] if l["id"] == liability_id)


def _balance(client, account_id):
    return next(a["current_balance"] for a in client.get("/api/init").json()["accounts"] if a["id"] == account_id)


def _post(client, **tx):
    res = client.post("/api/entities/transactions", json={"notes": "", "transaction_date": "2026-10-05", **tx})
    assert res.status_code == 200, res.text
    return res.json()["id"]


# --- What existing entries do (must not change) --------------------------------------

def test_emi_and_prepayment_pay_a_loan_down_from_the_account(client):
    acc, loan, _, _ = _ids(client)
    _post(client, type="EMI", account_id=acc, amount=20000, related_entity_type="Liability", related_entity_id=loan)
    _post(client, type="Prepayment", account_id=acc, amount=100000, related_entity_type="Liability", related_entity_id=loan)
    assert _owed(client, loan) == 1000000 - 120000
    assert _balance(client, acc) == 500000 - 120000


def test_card_spend_raises_the_card_and_paying_the_card_lowers_it(client):
    acc, _, card, grocery = _ids(client)
    _post(client, type="Spend", account_id=None, amount=3000, category_id=grocery, related_entity_type="Liability", related_entity_id=card)
    assert _owed(client, card) == 3000
    _post(client, type="Prepayment", account_id=acc, amount=3000, related_entity_type="Liability", related_entity_id=card)
    assert _owed(client, card) == 0


def test_deleting_and_editing_undo_exactly(client):
    acc, loan, _, _ = _ids(client)
    tx = _post(client, type="EMI", account_id=acc, amount=20000, related_entity_type="Liability", related_entity_id=loan)
    client.put(f"/api/entities/transactions/{tx}", json={"type": "EMI", "account_id": acc, "amount": 25000, "transaction_date": "2026-10-05",
                                                           "notes": "", "related_entity_type": "Liability", "related_entity_id": loan})
    assert _owed(client, loan) == 1000000 - 25000
    client.delete(f"/api/entities/transactions/{tx}")
    assert _owed(client, loan) == 1000000


# --- New labels, same rules ------------------------------------------------------------

def test_loan_interest_and_fees_are_charges_on_the_loan(client):
    acc, loan, _, _ = _ids(client)
    _post(client, type="Interest", account_id=None, amount=7000, related_entity_type="Liability", related_entity_id=loan)
    _post(client, type="Fee", account_id=None, amount=5900, related_entity_type="Liability", related_entity_id=loan)
    _post(client, type="EMI", account_id=acc, amount=20000, related_entity_type="Liability", related_entity_id=loan)
    # MMEX-style month: interest charged, EMI paid; the net is the principal repaid.
    assert _owed(client, loan) == 1000000 + 7000 + 5900 - 20000
    assert _balance(client, acc) == 500000 - 20000  # interest and fees move no cash


def test_interest_entry_edits_and_deletes_cleanly(client):
    _, loan, _, _ = _ids(client)
    tx = _post(client, type="Interest", account_id=None, amount=7000, related_entity_type="Liability", related_entity_id=loan)
    client.put(f"/api/entities/transactions/{tx}", json={"type": "Interest", "account_id": None, "amount": 6950, "transaction_date": "2026-10-05",
                                                           "notes": "", "related_entity_type": "Liability", "related_entity_id": loan})
    assert _owed(client, loan) == 1006950
    client.delete(f"/api/entities/transactions/{tx}")
    assert _owed(client, loan) == 1000000


def test_an_existing_database_gets_the_new_labels_and_keeps_its_rows(initialized_db):
    from backend.db import init_db
    conn = initialized_db
    # Recreate the table as it was before Interest/Fee, with a row in it.
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'transactions'").fetchone()["sql"]
    old_sql = sql.replace(", 'Interest', 'Fee'", "")
    assert "'Interest'" not in old_sql
    conn.execute("ALTER TABLE transactions RENAME TO transactions_new")
    conn.execute(old_sql)
    conn.execute("DROP TABLE transactions_new")
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date, notes)
                    VALUES ('None', 'Account', 1, 'Credit', 1234, '2026-01-01', 'kept')""")
    conn.commit()

    init_db()
    init_db()  # idempotent

    sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'transactions'").fetchone()["sql"]
    assert "'Interest'" in sql and "'Fee'" in sql
    assert conn.execute("SELECT amount, notes FROM transactions").fetchall()[0]["notes"] == "kept"
