"""Income & Expenses as the per-person recurring plan: owners, migration, Salary take-home, tax filtering."""
import json

from fastapi.testclient import TestClient

import backend.db as db
from backend.tax.prefill import prefill


def cat(conn, name):
    return conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()["id"]


def test_existing_rows_get_the_primary_owner(initialized_db):
    conn = initialized_db
    cols = [r["name"] for r in conn.execute("PRAGMA table_info('income')")]
    assert "owner_id" in cols and "owner_id" in [r["name"] for r in conn.execute("PRAGMA table_info('expenses')")]
    conn.execute("INSERT INTO people (id, name, role) VALUES (3, 'Ravi', 'Spouse'), (4, 'Asha', 'Primary Owner')")
    conn.execute("INSERT INTO income (name, category_id, amount) VALUES ('Old salary row', ?, 100)", (cat(conn, "Salary"),))
    conn.execute("INSERT INTO expenses (name, category_id, amount) VALUES ('Old rent row', ?, 50)", (cat(conn, "Rent"),))
    conn.commit()
    db.init_db()
    db.init_db()  # idempotent
    assert conn.execute("SELECT owner_id FROM income").fetchone()[0] == 4
    assert conn.execute("SELECT owner_id FROM expenses").fetchone()[0] == 4


def test_salary_category_has_a_take_home_field(initialized_db):
    defs = json.loads(initialized_db.execute("SELECT fields_definition FROM categories WHERE name = 'Salary'").fetchone()[0])
    assert [d["name"] for d in defs] == ["net_amount"]


def test_tax_fill_only_shows_the_chosen_persons_income(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner'), (2, 'Ravi', 'Spouse')")
    conn.execute("INSERT INTO income (name, category_id, amount, owner_id) VALUES ('Asha salary', ?, 200000, 1)", (cat(conn, "Salary"),))
    conn.execute("INSERT INTO income (name, category_id, amount, owner_id) VALUES ('Ravi salary', ?, 150000, 2)", (cat(conn, "Salary"),))
    conn.execute("INSERT INTO expenses (name, category_id, amount, owner_id) VALUES ('Ravi pays rent', ?, 30000, 2)", (cat(conn, "Rent"),))
    conn.commit()
    asha = prefill(conn, "2026-27", person_id=1)
    ravi = prefill(conn, "2026-27", person_id=2)
    assert [i["label"] for i in asha["items"]] == ["Asha salary"]
    assert sorted(i["label"] for i in ravi["items"]) == ["Ravi pays rent", "Ravi salary"]


def test_init_returns_owner_and_custom_fields_and_create_defaults_owner(initialized_db):
    conn = initialized_db
    conn.execute("INSERT INTO people (id, name, role) VALUES (1, 'Asha', 'Primary Owner')")
    conn.commit()
    from backend.main import app
    with TestClient(app) as client:
        made = client.post("/api/entities/income", json={"name": "Acme", "category_id": cat(conn, "Salary"), "amount": 450000,
                                                         "frequency": "Monthly", "net_amount": 310000})
        data = client.get("/api/init").json()
    assert made.status_code == 200
    (row,) = data["income"]
    assert row["owner_id"] == 1 and row["owner_name"] == "Asha" and row["net_amount"] == 310000
