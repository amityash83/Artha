"""The EPF asset type carries per-account fields (employer, UAN, member ID, shares)."""
import json

from backend.db import EPF_FIELDS_DEFINITION, init_db


def _epf_fields(conn):
    row = conn.execute("SELECT fields_definition FROM categories WHERE entity_type = 'Asset' AND name = 'EPF'").fetchone()
    return json.loads(row["fields_definition"])


def test_new_database_has_epf_fields(initialized_db):
    names = [f["name"] for f in _epf_fields(initialized_db)]
    assert {"employee_share", "employer_share", "pension_share", "uan", "member_id", "transfer_status"} <= set(names)


def test_existing_database_gets_them_without_overwriting_edits(initialized_db):
    initialized_db.execute("UPDATE categories SET fields_definition = NULL WHERE name = 'EPF'")
    initialized_db.commit()
    init_db()
    assert _epf_fields(initialized_db) == EPF_FIELDS_DEFINITION

    custom = [{"name": "my_field", "type": "text", "label": "Mine"}]
    initialized_db.execute("UPDATE categories SET fields_definition = ? WHERE name = 'EPF'", (json.dumps(custom),))
    initialized_db.commit()
    init_db()
    assert _epf_fields(initialized_db) == custom
