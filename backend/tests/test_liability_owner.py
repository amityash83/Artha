"""Liability owners: the free-text 'owner' moves onto owner_id; new records default to the Primary Owner."""
import json

from fastapi.testclient import TestClient

import backend.db as db


def _home_loan(conn):
    return conn.execute("SELECT id FROM categories WHERE name = 'Home Loan'").fetchone()["id"]


def test_free_text_owner_is_migrated_once(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner'), (2, 'Ravi', 'Spouse')")
    cat = _home_loan(conn)
    conn.execute("INSERT INTO liabilities (name, category_id, owner_id, metadata_json) VALUES ('Ravi loan', ?, 1, ?)",
                 (cat, json.dumps({"owner": " ravi ", "status": "Active"})))
    conn.execute("INSERT INTO liabilities (name, category_id, owner_id, metadata_json) VALUES ('Mystery', ?, 1, ?)",
                 (cat, json.dumps({"owner": "Uncle Bob"})))
    conn.commit()
    db.init_db()
    db.init_db()  # idempotent
    rows = {r["name"]: r for r in conn.execute("SELECT name, owner_id, metadata_json FROM liabilities")}
    assert rows["Ravi loan"]["owner_id"] == 2
    assert json.loads(rows["Ravi loan"]["metadata_json"]) == {"status": "Active"}
    assert rows["Mystery"]["owner_id"] == 1 and json.loads(rows["Mystery"]["metadata_json"])["owner"] == "Uncle Bob"


def test_new_records_default_to_the_primary_owner(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (5, 'Ravi', 'Spouse'), (7, 'Asha', 'Primary Owner')")
    conn.commit()
    from backend.main import app
    with TestClient(app) as client:
        made = client.post("/api/entities/liabilities", json={"name": "Card", "category_id": _home_loan(conn)})
        chosen = client.post("/api/entities/liabilities", json={"name": "Ravi card", "category_id": _home_loan(conn), "owner_id": 5})
    assert made.status_code == chosen.status_code == 200
    owners = {r["name"]: r["owner_id"] for r in conn.execute("SELECT name, owner_id FROM liabilities")}
    assert owners == {"Card": 7, "Ravi card": 5}
