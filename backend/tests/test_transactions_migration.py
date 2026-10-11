"""An old database whose transactions table predates EMI/Prepayment, Spend/Liability and the
category_id/is_balance_exempt columns must migrate fully, even with a leftover copy from a
failed earlier attempt (seen on a real July 2026 database)."""
import backend.db as db

OLD_TRANSACTIONS = """
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_ref_type TEXT CHECK(source_ref_type IN ('Account', 'Asset', 'None')),
    source_ref_id INTEGER,
    dest_ref_type TEXT CHECK(dest_ref_type IN ('Account', 'Asset', 'None')),
    dest_ref_id INTEGER,
    type TEXT NOT NULL CHECK(type IN ('Credit', 'Debit', 'Transfer', 'Buy', 'Sell', 'Investment', 'Redemption')),
    amount REAL NOT NULL CHECK(amount > 0.0),
    transaction_date TEXT NOT NULL,
    notes TEXT,
    linked_goal_id INTEGER REFERENCES goals(id)
)"""


def _make_old(conn, leftover: bool):
    conn.execute("PRAGMA foreign_keys = OFF")
    conn.execute("DROP TABLE transactions")
    conn.execute(OLD_TRANSACTIONS)
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, type, amount, transaction_date, notes)
                    VALUES ('None', 'Account', 'Credit', 5000, '2026-07-01', 'opening')""")
    if leftover:
        conn.execute("CREATE TABLE transactions_checkfix2 (id INTEGER PRIMARY KEY)")
    conn.commit()


def _check_migrated(conn):
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE name LIKE 'transactions%'")}
    sql = conn.execute("SELECT sql FROM sqlite_master WHERE name = 'transactions'").fetchone()[0]
    cols = {r[1] for r in conn.execute("PRAGMA table_info('transactions')")}
    assert names == {"transactions"}
    assert "'Spend'" in sql and "'Liability'" in sql and "'Prepayment'" in sql
    assert {"category_id", "is_balance_exempt"} <= cols
    assert [tuple(r) for r in conn.execute("SELECT amount, notes FROM transactions")] == [(5000, "opening")]
    # The point of it all: a credit-card Spend against a liability can be recorded.
    conn.execute("""INSERT INTO transactions (source_ref_type, dest_ref_type, dest_ref_id, type, amount, transaction_date)
                    VALUES ('None', 'Liability', 1, 'Spend', 100, '2026-10-01')""")


def test_old_database_migrates_in_one_start(initialized_db):
    _make_old(initialized_db, leftover=False)
    db.init_db()
    _check_migrated(initialized_db)


def test_leftover_copy_from_a_failed_attempt_is_cleared(initialized_db):
    _make_old(initialized_db, leftover=True)
    db.init_db()
    _check_migrated(initialized_db)
