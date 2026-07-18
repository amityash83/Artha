import pytest

import backend.db as db


@pytest.fixture
def test_db_path(tmp_path, monkeypatch):
    """
    Points backend.db.get_db_path() at an isolated temp-file SQLite DB for the
    duration of one test. Patches get_db_path directly rather than setting
    FINANCE_DB_DIR, because get_db_path() checks ~/.financeos/settings.json's
    active_db_path FIRST — if that file already has an active_db_path set
    (e.g. from prior manual testing on a dev machine), FINANCE_DB_DIR alone
    would be silently ignored. Patching get_db_path itself is correct
    regardless of settings.json's contents and never touches the real
    developer database.
    """
    fake_path = str(tmp_path / "test_finance.db")
    monkeypatch.setattr(db, "get_db_path", lambda: fake_path)
    return fake_path


@pytest.fixture
def initialized_db(test_db_path):
    """Runs init_db() once against the isolated DB and yields a live connection."""
    db.init_db()
    conn = db.get_db_connection()
    yield conn
    conn.close()
