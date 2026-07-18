import backend.db as db


def _table_count(conn, table):
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) as c FROM {table}")
    return cur.fetchone()["c"]


def test_init_db_is_idempotent_for_seeded_tables(test_db_path):
    # Turns this session's manual "run init_db() twice, confirm no dupes"
    # verification ritual into an automated check.
    db.init_db()
    conn1 = db.get_db_connection()
    first_counts = {
        table: _table_count(conn1, table)
        for table in ("categories", "financial_rules", "card_variants", "knowledge_articles", "institutions")
    }
    conn1.close()

    # Second run against the same file must not error and must not duplicate rows
    db.init_db()
    conn2 = db.get_db_connection()
    second_counts = {
        table: _table_count(conn2, table)
        for table in ("categories", "financial_rules", "card_variants", "knowledge_articles", "institutions")
    }
    conn2.close()

    assert first_counts == second_counts
    for table, count in first_counts.items():
        assert count > 0, f"{table} should have seeded rows"


def test_init_db_creates_expected_core_tables(initialized_db):
    conn = initialized_db
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    table_names = {row["name"] for row in cur.fetchall()}
    expected = {
        "accounts", "assets", "liabilities", "income", "expenses",
        "goals", "transactions", "categories", "financial_rules",
        "credit_card_details", "insurance_details", "holding_lots",
        "tax_profiles", "card_variants", "knowledge_articles", "ai_settings",
    }
    assert expected.issubset(table_names)


def test_init_db_seeds_exactly_expected_institution_count(initialized_db):
    conn = initialized_db
    assert _table_count(conn, "institutions") == 8


def test_init_db_does_not_seed_a_default_person(initialized_db):
    # people has no unconditional seed row on a genuinely fresh DB — the
    # 'Amit' backfill inserts in db.py only fire inside legacy-migration
    # guards keyed on PRAGMA table_info checks (e.g. accounts missing
    # owner_id), which never apply to a table created fresh via
    # CREATE TABLE IF NOT EXISTS.
    conn = initialized_db
    assert _table_count(conn, "people") == 0
