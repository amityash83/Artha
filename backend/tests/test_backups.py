"""Backups: consistent copies, skip-when-unchanged, one folder for everything, safe restore."""
import os
import sqlite3
import time

import pytest
from fastapi.testclient import TestClient

import backend.backups as backups
import backend.db as db


def _touch_db(value="x"):
    conn = db.get_db_connection()
    conn.execute("CREATE TABLE IF NOT EXISTS backup_probe (v TEXT)")
    conn.execute("DELETE FROM backup_probe")
    conn.execute("INSERT INTO backup_probe VALUES (?)", (value,))
    conn.commit()
    conn.close()
    time.sleep(0.01)  # keep each write's mtime distinct from the previous backup's


def _probe(path):
    conn = sqlite3.connect(path)
    try:
        return conn.execute("SELECT v FROM backup_probe").fetchone()[0]
    finally:
        conn.close()


def test_backup_is_a_readable_snapshot(initialized_db):
    _touch_db("one")
    made = backups.create_backup("manual")
    assert made["name"].startswith("backup_") and _probe(made["backup_file"]) == "one"
    assert not any(n.endswith(".partial") for n in os.listdir(backups.backup_dir()))


def test_auto_backup_skips_when_nothing_changed(initialized_db):
    _touch_db("one")
    assert backups.auto_backup("open")["status"] == "success"
    assert backups.auto_backup("open")["reason"] == "no changes since the last backup"
    _touch_db("two")
    assert backups.auto_backup("close")["status"] == "success"


def test_auto_backups_are_pruned_to_the_limit(initialized_db):
    db.save_settings({"backup_count_limit": 2})
    for i in range(4):
        _touch_db(str(i))
        backups.auto_backup("open")
    names = [b["name"] for b in backups.list_backups() if b["name"].startswith("auto_")]
    assert len(names) == 2


def test_disabled_trigger_and_bad_trigger(initialized_db):
    db.save_settings({"backup_on_open": False})
    assert backups.auto_backup("open")["status"] == "skipped"
    with pytest.raises(backups.BackupError):
        backups.auto_backup("sometimes")


def test_custom_folder_is_used_for_create_list_and_restore(initialized_db, tmp_path):
    custom = tmp_path / "elsewhere"
    custom.mkdir()
    db.save_settings({"custom_backup_dir": str(custom)})
    _touch_db("one")
    made = backups.create_backup("manual")
    assert os.path.dirname(made["backup_file"]) == str(custom)
    assert [b["name"] for b in backups.list_backups()] == [made["name"]]
    _touch_db("two")
    backups.restore_backup(made["name"])
    assert _probe(db.get_db_path()) == "one"


def test_restore_keeps_a_copy_of_what_it_replaces(initialized_db):
    _touch_db("old")
    made = backups.create_backup("manual")
    _touch_db("new")
    out = backups.restore_backup(made["name"])
    assert _probe(db.get_db_path()) == "old"
    assert out["previous_saved_as"].startswith("pre_restore_")
    assert _probe(os.path.join(backups.backup_dir(), out["previous_saved_as"])) == "new"


@pytest.mark.parametrize("name", ["../test_finance.db", "/etc/passwd", "notes.txt", ""])
def test_restore_rejects_paths_outside_the_backup_folder(initialized_db, name):
    with pytest.raises(backups.BackupError):
        backups.restore_backup(name)


def test_restore_refuses_a_corrupt_file_and_changes_nothing(initialized_db):
    _touch_db("keep")
    with open(os.path.join(backups.backup_dir(), "broken.db"), "wb") as f:
        f.write(b"not a database at all" * 100)
    with pytest.raises(backups.BackupError) as e:
        backups.restore_backup("broken.db")
    assert e.value.status_code == 422 and _probe(db.get_db_path()) == "keep"


def test_app_startup_backs_up_an_existing_database(initialized_db):
    from backend.main import app
    _touch_db("before-start")
    with TestClient(app) as client:
        names = client.get("/api/backup/list").json()
        details = client.get("/api/backup/details").json()
        bad = client.post("/api/backup/restore", data={"backup_name": "../x.db"})
    assert any(n.startswith("auto_open_") for n in names)
    assert details["folder"].endswith("backups")
    assert bad.status_code == 400


def test_restore_refuses_a_valid_sqlite_file_that_is_not_artha(initialized_db):
    other = os.path.join(backups.backup_dir(), "other.db")
    conn = sqlite3.connect(other)
    conn.execute("CREATE TABLE notes (t TEXT)")
    conn.commit()
    conn.close()
    _touch_db("keep")
    with pytest.raises(backups.BackupError) as e:
        backups.restore_backup("other.db")
    assert "Artha" in str(e.value) and _probe(db.get_db_path()) == "keep"


def test_restore_writes_into_the_live_file(initialized_db):
    _touch_db("old")
    made = backups.create_backup("manual")
    _touch_db("new")
    inode = os.stat(db.get_db_path()).st_ino
    backups.restore_backup(made["name"])
    assert os.stat(db.get_db_path()).st_ino == inode  # copied into, not swapped
    assert _probe(db.get_db_path()) == "old"


def test_auto_run_route_reports_errors_without_failing(initialized_db, monkeypatch):
    from backend.main import app
    def boom(trigger):
        raise OSError("disk full")
    with TestClient(app) as client:
        monkeypatch.setattr(backups, "auto_backup", boom)
        r = client.post("/api/backup/auto-run?trigger=close")
    assert r.status_code == 200 and r.json() == {"status": "error", "message": "disk full"}


def test_packaged_entry_point_leaves_init_db_to_the_lifespan():
    import pathlib
    run_py = pathlib.Path(__file__).resolve().parents[1] / "run.py"
    assert "init_db()" not in run_py.read_text().split("# init_db() runs")[0]


# --- Second copy elsewhere ------------------------------------------------------------

def test_every_backup_is_copied_to_the_second_folder(initialized_db, tmp_path):
    second = tmp_path / "cloud"
    second.mkdir()
    _touch_db("one")
    early = backups.create_backup("manual")  # made before the second folder was set
    out = backups.set_mirror_folder(str(second))
    assert out["copied"] == [early["name"]] and out["last_error"] is None
    _touch_db("two")
    made = backups.create_backup("manual")
    assert made["mirror"] == {"status": "success", "folder": str(second), "copied": [made["name"]]}
    assert _probe(str(second / made["name"])) == "two"
    assert os.path.getmtime(second / made["name"]) == os.path.getmtime(made["backup_file"])
    assert not any(n.endswith(".partial") for n in os.listdir(second))


def test_a_missing_second_folder_never_fails_a_backup_and_catches_up_later(initialized_db, tmp_path):
    second = tmp_path / "usb"
    second.mkdir()
    backups.set_mirror_folder(str(second))
    second.rmdir()  # the drive is unplugged
    _touch_db("a")
    made = backups.create_backup("manual")
    assert os.path.exists(made["backup_file"])
    assert made["mirror"]["status"] == "error" and "isn't available" in made["mirror"]["message"]
    assert backups.mirror_status()["last_error"]
    second.mkdir()  # plugged back in: an unchanged auto backup is skipped but still copies what's missing
    db.save_settings({**db.load_settings(), "backup_on_open": True})
    backups.create_backup("open")  # make the newest backup current so the next open is skipped
    skipped = backups.auto_backup("open")
    assert skipped["status"] == "skipped" and skipped["mirror"]["status"] == "success"
    assert made["name"] in os.listdir(second)
    assert backups.mirror_status()["last_error"] is None


def test_second_folder_is_pruned_like_the_main_one(initialized_db, tmp_path):
    second = tmp_path / "cloud"
    second.mkdir()
    db.save_settings({"backup_count_limit": 2})
    backups.set_mirror_folder(str(second))
    manual = backups.create_backup("manual")
    for v in "abcd":
        _touch_db(v)
        backups.auto_backup("open")
    autos = sorted(n for n in os.listdir(second) if n.startswith("auto_"))
    assert autos == sorted(b["name"] for b in backups.list_backups() if b["name"].startswith("auto_"))
    assert len(autos) == 2 and manual["name"] in os.listdir(second)


@pytest.mark.parametrize("which", ["relative", "missing", "backups", "database"])
def test_second_folder_must_be_somewhere_else(initialized_db, tmp_path, which):
    folder = {"relative": "cloud", "missing": str(tmp_path / "nope"),
              "backups": backups.backup_dir(), "database": db.get_db_dir()}[which]
    with pytest.raises(backups.BackupError) as e:
        backups.set_mirror_folder(folder)
    assert e.value.status_code == 422
    assert backups.backup_settings()["mirror_backup_dir"] == ""


def test_second_folder_routes(initialized_db, tmp_path):
    from backend.main import app
    second = tmp_path / "cloud"
    second.mkdir()
    with TestClient(app) as client:
        assert client.post("/api/backup/mirror").status_code == 400
        assert client.post("/api/settings/backup-mirror", json={"folder": str(tmp_path / "nope")}).status_code == 422
        r = client.post("/api/settings/backup-mirror", json={"folder": str(second)})
        assert r.status_code == 200 and r.json()["folder"] == str(second)
        assert client.get("/api/settings/database").json()["mirror_backup_dir"] == str(second)
        assert client.post("/api/backup/create").json()["mirror"]["status"] == "success"
        details = client.get("/api/backup/details").json()
        assert details["mirror"]["last_copied_at"] and details["mirror"]["last_error"] is None
        assert {b["name"] for b in details["backups"]} <= set(os.listdir(second))
        assert client.post("/api/backup/mirror").json()["copied"] == []
        assert client.post("/api/settings/backup-mirror", json={"folder": ""}).json()["folder"] == ""
