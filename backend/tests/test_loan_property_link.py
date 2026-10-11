"""Several loans can be secured on one property (PUT /api/liabilities/{id}/property)."""
import json

from fastapi.testclient import TestClient


def _setup(conn):
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    prop = conn.execute("SELECT id FROM categories WHERE name = 'Property'").fetchone()["id"]
    home = conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]
    asset = conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value) VALUES ('Flat', ?, 1, 9000000)", (prop,)).lastrowid
    loans = [conn.execute(
        "INSERT INTO liabilities (name, category_id, owner_id, outstanding, interest_rate, emi, metadata_json) VALUES (?, ?, 1, ?, 8.5, 30000, ?)",
        (name, home, owed, json.dumps({"status": "Active", "note": name})),
    ).lastrowid for name, owed in (("Home loan", 4000000), ("Top-up", 1500000))]
    conn.commit()
    return asset, loans


def test_two_loans_on_one_property_and_unlinking(initialized_db):
    asset, (home, topup) = _setup(initialized_db)
    from backend.main import app
    with TestClient(app) as client:
        for loan in (home, topup):
            assert client.put(f"/api/liabilities/{loan}/property", json={"asset_id": asset}).status_code == 200
        rows = {r["id"]: r for r in initialized_db.execute("SELECT id, linked_asset_id, metadata_json FROM liabilities")}
        assert rows[home]["linked_asset_id"] == asset and rows[topup]["linked_asset_id"] == asset
        # Only the link changes: the loan's other stored fields survive.
        assert json.loads(rows[topup]["metadata_json"]) == {"status": "Active", "note": "Top-up"}

        assert client.put(f"/api/liabilities/{topup}/property", json={"asset_id": None}).status_code == 200
        assert initialized_db.execute("SELECT linked_asset_id FROM liabilities WHERE id = ?", (topup,)).fetchone()[0] is None
        assert initialized_db.execute("SELECT linked_asset_id FROM liabilities WHERE id = ?", (home,)).fetchone()[0] == asset


def test_unknown_loan_or_property_is_refused(initialized_db):
    asset, (home, _) = _setup(initialized_db)
    from backend.main import app
    with TestClient(app) as client:
        assert client.put("/api/liabilities/9999/property", json={"asset_id": asset}).status_code == 404
        assert client.put(f"/api/liabilities/{home}/property", json={"asset_id": 9999}).status_code == 404


def test_only_loans_onto_properties(initialized_db):
    asset, (home, _) = _setup(initialized_db)
    stock = initialized_db.execute("SELECT id FROM categories WHERE name = 'Stock'").fetchone()["id"]
    card = initialized_db.execute("SELECT id FROM categories WHERE name = 'Credit Card'").fetchone()["id"]
    share = initialized_db.execute("INSERT INTO assets (name, category_id, owner_id, current_value) VALUES ('Shares', ?, 1, 1000)", (stock,)).lastrowid
    cc = initialized_db.execute("INSERT INTO liabilities (name, category_id, owner_id, outstanding) VALUES ('Card', ?, 1, 0)", (card,)).lastrowid
    initialized_db.commit()
    from backend.main import app
    with TestClient(app) as client:
        assert client.put(f"/api/liabilities/{home}/property", json={"asset_id": share}).status_code == 422
        assert client.put(f"/api/liabilities/{cc}/property", json={"asset_id": asset}).status_code == 422
