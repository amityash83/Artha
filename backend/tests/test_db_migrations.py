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


def test_init_db_transactions_allows_spend_and_liability_ref_type(initialized_db):
    # Regression: transactions.type/source_ref_type/dest_ref_type CHECK
    # constraints must accept 'Spend' and 'Liability' after the CHECK-rebuild
    # migration (SQLite can't ALTER a CHECK in place, so this is a full
    # table-rebuild migration — confirm it actually ran and didn't just warn).
    conn = initialized_db
    cur = conn.cursor()
    cur.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='transactions'")
    schema_sql = cur.fetchone()["sql"]
    assert "'Spend'" in schema_sql
    assert "'Liability'" in schema_sql

    cur.execute("PRAGMA table_info('transactions')")
    cols = [row["name"] for row in cur.fetchall()]
    assert "category_id" in cols


def test_init_db_seeds_reward_engine_expense_categories(initialized_db):
    # The card reward engine's category vocabulary (General/Dining/Travel/
    # Grocery/Utility/Fuel/Rent/Online Shopping) must all exist as real
    # Expense categories so a Spend transaction's category_id and a card's
    # category_rules_json match the same taxonomy.
    conn = initialized_db
    cur = conn.cursor()
    cur.execute("SELECT name FROM categories WHERE entity_type = 'Expense'")
    names = {row["name"] for row in cur.fetchall()}
    expected = {"General", "Dining", "Travel", "Grocery", "Utility", "Fuel", "Rent", "Online Shopping"}
    assert expected.issubset(names)


def test_init_db_converts_manual_statement_spend_to_dated_transaction_once(test_db_path):
    # A card with a pre-existing manually-entered current_statement_spend must
    # get exactly one dated 'Spend' transaction on migration, and running
    # init_db() again must not create a duplicate (idempotency).
    db.init_db()
    conn = db.get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT id FROM categories WHERE name = 'Credit Card'")
    cc_cat_id = cur.fetchone()["id"]
    cur.execute(
        "INSERT INTO liabilities (name, category_id, outstanding, owner_id) VALUES ('Legacy Card', ?, 25000, 1)",
        (cc_cat_id,),
    )
    liability_id = cur.lastrowid
    cur.execute(
        "INSERT INTO credit_card_details (liability_id, current_statement_spend) VALUES (?, 12000)",
        (liability_id,),
    )
    conn.commit()
    conn.close()

    db.init_db()
    conn = db.get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT outstanding FROM liabilities WHERE id = ?", (liability_id,)
    )
    # outstanding must be untouched by the conversion — it already reflected
    # this spend before the ledger existed.
    assert cur.fetchone()["outstanding"] == 25000.0
    cur.execute(
        "SELECT COUNT(*) as c FROM transactions WHERE dest_ref_type = 'Liability' AND dest_ref_id = ? "
        "AND notes = 'Manual statement spend adjustment'",
        (liability_id,),
    )
    assert cur.fetchone()["c"] == 1
    conn.close()

    db.init_db()  # second run must not duplicate the baseline transaction
    conn = db.get_db_connection()
    cur = conn.cursor()
    cur.execute(
        "SELECT COUNT(*) as c FROM transactions WHERE dest_ref_type = 'Liability' AND dest_ref_id = ? "
        "AND notes = 'Manual statement spend adjustment'",
        (liability_id,),
    )
    assert cur.fetchone()["c"] == 1
    conn.close()
