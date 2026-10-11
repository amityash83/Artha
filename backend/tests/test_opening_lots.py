"""Opening-lot backfill: only real costs become lots; ₹0 placeholders are removed."""
from backend.db import init_db


def _fund(conn, name, quantity=0, cost_price=0):
    mf = conn.execute("SELECT id FROM categories WHERE name = 'Mutual Fund'").fetchone()["id"]
    return conn.execute("INSERT INTO assets (name, category_id, owner_id, current_value, quantity, cost_price) VALUES (?, ?, 1, 160000, ?, ?)",
                        (name, mf, quantity, cost_price)).lastrowid


def _lots(conn, asset_id):
    return [dict(r) for r in conn.execute("SELECT quantity, price_per_unit, notes FROM holding_lots WHERE asset_id = ?", (asset_id,))]


def test_no_cost_means_no_placeholder_lot(initialized_db):
    asset = _fund(initialized_db, "Liquid fund")
    initialized_db.commit()
    init_db()
    init_db()  # every startup used to add a fresh "1 unit at ₹0" lot
    assert _lots(initialized_db, asset) == []


def test_a_real_cost_still_becomes_an_opening_lot(initialized_db):
    asset = _fund(initialized_db, "Old fund", quantity=1000, cost_price=120000)
    initialized_db.commit()
    init_db()
    assert _lots(initialized_db, asset) == [{"quantity": 1000, "price_per_unit": 120, "notes": "Auto-migrated opening lot"}]


def test_existing_placeholders_are_removed_but_real_lots_kept(initialized_db):
    placeholder = _fund(initialized_db, "Liquid fund")
    real = _fund(initialized_db, "Index fund")
    initialized_db.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit, notes) VALUES (?, '2026-10-11', 1, 0, 'Auto-migrated opening lot')", (placeholder,))
    initialized_db.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit, notes) VALUES (?, '2024-01-10', 500, 100, '')", (real,))
    # A user's own zero-cost lot (e.g. a bonus allotment) isn't touched either.
    initialized_db.execute("INSERT INTO holding_lots (asset_id, purchase_date, quantity, price_per_unit, notes) VALUES (?, '2025-01-01', 10, 0, 'bonus units')", (real,))
    initialized_db.commit()
    init_db()
    assert _lots(initialized_db, placeholder) == []
    assert len(_lots(initialized_db, real)) == 2
