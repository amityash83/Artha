"""
Database backups: automatic (on open/close), manual, and safe restore.

Copies are made with SQLite's online backup API rather than a file copy, so a backup
taken while the app has the database open is always a consistent snapshot.

- Folder: settings' custom_backup_dir when it exists, else <db dir>/backups. Every
  operation (create, list, restore, prune) uses the same folder.
- Automatic backups ("auto_open_*", "auto_close_*") are skipped when the database hasn't
  changed since the newest backup, so frequent restarts (e.g. the dev server reloading)
  don't push useful older backups out of the retention limit.
- Restore checks the file is an intact Artha database, saves the current database as
  "pre_restore_*" first, then copies the backup into the live database through the backup
  API (which takes SQLite's write lock, rather than swapping files under open connections).
"""
import os
import sqlite3
from datetime import datetime
from typing import List, Optional

import backend.db as db

AUTO_PREFIX = "auto_"
PRE_RESTORE_PREFIX = "pre_restore_"
DEFAULT_KEEP = 10


class BackupError(Exception):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def backup_settings() -> dict:
    s = db.load_settings()
    return {
        "backup_on_open": s.get("backup_on_open", True),
        "backup_on_close": s.get("backup_on_close", True),
        "backup_count_limit": int(s.get("backup_count_limit", DEFAULT_KEEP) or DEFAULT_KEEP),
        "custom_backup_dir": s.get("custom_backup_dir", "") or "",
    }


def backup_dir() -> str:
    custom = backup_settings()["custom_backup_dir"]
    path = custom if custom and os.path.isdir(custom) else os.path.join(db.get_db_dir(), "backups")
    os.makedirs(path, exist_ok=True)
    return path


def _backup_into(src_path: str, dest_path: str) -> None:
    src = sqlite3.connect(src_path)
    try:
        dest = sqlite3.connect(dest_path)
        try:
            src.backup(dest)
        finally:
            dest.close()
    finally:
        src.close()


def _copy(src_path: str, dest_path: str) -> None:
    """A new backup file: consistent copy via the SQLite backup API, written to a temp name
    first so a half-written file never looks like a finished backup."""
    tmp = dest_path + ".partial"
    try:
        _backup_into(src_path, tmp)
        os.replace(tmp, dest_path)
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


def list_backups() -> List[dict]:
    """Newest first, ordered by the exact modification time (not the 1-second display stamp)."""
    folder = backup_dir()
    found = []
    for name in os.listdir(folder):
        if name.endswith(".db"):
            st = os.stat(os.path.join(folder, name))
            found.append((st.st_mtime, {"name": name, "size": st.st_size,
                                        "modified": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="seconds")}))
    return [b for _, b in sorted(found, key=lambda t: t[0], reverse=True)]


def _unchanged_since_last_backup(db_path: str) -> bool:
    backups = list_backups()
    if not backups:
        return False
    newest = os.path.getmtime(os.path.join(backup_dir(), backups[0]["name"]))
    return os.path.getmtime(db_path) <= newest


def _prune(prefix: str, keep: int) -> int:
    folder = backup_dir()
    files = sorted((os.path.join(folder, n) for n in os.listdir(folder) if n.startswith(prefix) and n.endswith(".db")),
                   key=os.path.getmtime)
    removed = 0
    while len(files) > keep:
        try:
            os.remove(files.pop(0))
            removed += 1
        except OSError as e:
            print("Failed to delete old backup:", e)
    return removed


def create_backup(kind: str = "manual") -> Optional[dict]:
    """kind: 'manual', 'open', 'close' or 'pre_restore'. Returns None when an automatic
    backup was skipped because nothing changed."""
    db_path = db.get_db_path()
    if not os.path.exists(db_path):
        raise BackupError("There is no database file to back up yet.", 404)
    if kind in ("open", "close") and _unchanged_since_last_backup(db_path):
        return None
    prefix = {"manual": "backup_", "open": "auto_open_", "close": "auto_close_", "pre_restore": PRE_RESTORE_PREFIX}[kind]
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(backup_dir(), f"{prefix}{stamp}.db")
    n = 1
    while os.path.exists(path):  # two backups in the same second
        n += 1
        path = os.path.join(backup_dir(), f"{prefix}{stamp}_{n}.db")
    _copy(db_path, path)
    keep = backup_settings()["backup_count_limit"]
    purged = _prune(AUTO_PREFIX, keep) if kind in ("open", "close") else _prune(PRE_RESTORE_PREFIX, keep) if kind == "pre_restore" else 0
    return {"backup_file": path, "name": os.path.basename(path), "purged": purged}


def auto_backup(trigger: str) -> dict:
    s = backup_settings()
    if trigger not in ("open", "close"):
        raise BackupError("trigger must be 'open' or 'close'")
    if not s[f"backup_on_{trigger}"]:
        return {"status": "skipped", "reason": f"backup_on_{trigger} disabled"}
    if not os.path.exists(db.get_db_path()):
        return {"status": "skipped", "reason": "no database yet"}
    made = create_backup(trigger)
    if made is None:
        return {"status": "skipped", "reason": "no changes since the last backup"}
    return {"status": "success", **made}


def _resolve(name: str) -> str:
    if not name or os.path.basename(name) != name or not name.endswith(".db"):
        raise BackupError("Invalid backup name")
    path = os.path.join(backup_dir(), name)
    if not os.path.isfile(path):
        raise BackupError("Backup file not found", 404)
    return path


def restore_backup(name: str) -> dict:
    path = _resolve(name)
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            ok = conn.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
            tables = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        finally:
            conn.close()
    except sqlite3.DatabaseError:
        ok, tables = False, set()
    if not ok:
        raise BackupError(f"{name} is not an intact SQLite database; nothing was changed.", 422)
    if not {"accounts", "transactions"} <= tables:
        raise BackupError(f"{name} doesn't look like an Artha database; nothing was changed.", 422)
    safety = create_backup("pre_restore") if os.path.exists(db.get_db_path()) else None
    saved = f" Your previous data is saved as {safety['name']}." if safety else ""
    try:
        _backup_into(path, db.get_db_path())
    except sqlite3.OperationalError as e:
        raise BackupError(f"The database is busy ({e}); try again in a moment. Nothing was changed.", 409)
    try:
        db.init_db()  # an older backup may predate schema changes
    except Exception as e:
        raise BackupError(f"Restored {name}, but updating it to the current schema failed: {e}.{saved}", 500)
    return {"status": "success", "restored": name, "previous_saved_as": safety["name"] if safety else None}
