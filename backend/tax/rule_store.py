"""
User-editable tax rule sets, layered over the shipped read-only ones.

Shipped rule sets (backend/tax/rules/*.json) can't be edited: in a packaged build they
live inside the app bundle, and an app update would overwrite edits. Users instead
copy a rule set (shipped or their own) into the database, where:

- every save creates a new immutable version, so a saved scenario's
  (rule_set_id, version) always reproduces exactly;
- any item whose value differs from the previous version (or from the copied base,
  for version 1) is automatically re-tagged verification="user_entered", so the
  audit trail never presents a user's figure as an officially sourced one;
- each version must pass the same validate_rule_set() the shipped files do;
- user ids are "USER-<slug>" and can never shadow a shipped rule_set_id.

Which rule set applies to a financial year is an explicit per-year selection
(tax_rule_set_selection); with no selection, the shipped set for that year applies.
"""
import copy
import json
import re
from typing import List, Optional, Tuple

from backend.tax import rules_loader as loader

USER_PREFIX = "USER-"


class RuleStoreError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


# ---------------------------------------------------------------------------
# Content helpers
# ---------------------------------------------------------------------------

def _iter_items(content: dict, prefix: str = ""):
    """Yields (path, item) for every {"value", "verification"} item in a rule set."""
    for key, node in content.items():
        path = f"{prefix}.{key}" if prefix else key
        if isinstance(node, dict):
            if "value" in node and "verification" in node:
                yield path, node
            elif key != "value":
                yield from _iter_items(node, path)


def mark_user_entered(content: dict, previous: Optional[dict]) -> List[str]:
    """Re-tags changed or new items as user_entered. Returns the changed item paths."""
    previous_items = dict(_iter_items(previous)) if previous else {}
    changed = []
    for path, item in _iter_items(content):
        before = previous_items.get(path)
        if before is None or before.get("value") != item.get("value"):
            if previous is not None:
                item["verification"] = "user_entered"
                item.pop("source", None)
            changed.append(path)
    return changed


def diff_rule_sets(before: dict, after: dict) -> List[dict]:
    """Leaf-level differences between two rule sets, as {path, before, after}."""
    out = []

    def walk(a, b, path):
        if isinstance(a, dict) and isinstance(b, dict):
            for key in sorted(set(a) | set(b)):
                walk(a.get(key, _MISSING), b.get(key, _MISSING), f"{path}.{key}" if path else key)
        elif a != b:
            out.append({
                "path": path,
                "before": None if a is _MISSING else a,
                "after": None if b is _MISSING else b,
                "added": a is _MISSING,
                "removed": b is _MISSING,
            })

    walk(before, after, "")
    return out


_MISSING = object()


def fy_metadata(financial_year: str) -> dict:
    match = re.fullmatch(r"(\d{4})-(\d{2})", financial_year or "")
    if not match:
        raise RuleStoreError("financial_year must look like 2027-28")
    start = int(match.group(1))
    if int(match.group(2)) != (start + 1) % 100:
        raise RuleStoreError("financial_year must span consecutive years, e.g. 2027-28")
    return {
        "financial_year": financial_year,
        "assessment_year": f"{start + 1}-{str(start + 2)[2:]}",
        "effective_from": f"{start}-04-01",
        "effective_to": f"{start + 1}-03-31",
    }


def _slugify(name: str) -> str:
    slug = re.sub(r"[^A-Za-z0-9]+", "-", name or "").strip("-").upper()
    return slug or "RULES"


# ---------------------------------------------------------------------------
# Reads
# ---------------------------------------------------------------------------

def _row_meta(row) -> dict:
    return {
        "rule_set_id": row["rule_set_id"],
        "version": row["version"],
        "financial_year": row["financial_year"],
        "name": row["name"],
        "source": "user",
        "based_on_rule_set_id": row["based_on_rule_set_id"],
        "based_on_version": row["based_on_version"],
        "content_hash": row["content_hash"],
        "status": row["status"],
        "note": row["note"],
        "created_at": row["created_at"],
    }


def _shipped_meta(rules: dict) -> dict:
    return {
        "rule_set_id": rules["rule_set_id"],
        "version": rules["version"],
        "financial_year": rules["financial_year"],
        "name": f"Official {rules['financial_year']} ({rules['act']})",
        "source": "shipped",
        "based_on_rule_set_id": None,
        "based_on_version": None,
        "content_hash": loader.content_hash(rules),
        "status": "active",
        "note": rules.get("status_note"),
        "created_at": None,
    }


def get_selection(conn) -> dict:
    cursor = conn.cursor()
    cursor.execute("SELECT financial_year, rule_set_id FROM tax_rule_set_selection")
    return {row["financial_year"]: row["rule_set_id"] for row in cursor.fetchall()}


def list_rule_sets(conn) -> List[dict]:
    """All shipped sets plus the latest version of each user set, with which applies per FY."""
    selection = get_selection(conn)
    out = []
    for rules in loader.shipped_rule_sets().values():
        meta = _shipped_meta(rules)
        meta["version_count"] = 1
        out.append(meta)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT t.*, (SELECT COUNT(*) FROM tax_rule_sets c WHERE c.rule_set_id = t.rule_set_id) AS version_count
        FROM tax_rule_sets t
        WHERE t.version = (SELECT MAX(version) FROM tax_rule_sets m WHERE m.rule_set_id = t.rule_set_id)
    """)
    for row in cursor.fetchall():
        meta = _row_meta(row)
        meta["version_count"] = row["version_count"]
        out.append(meta)
    for meta in out:
        selected = selection.get(meta["financial_year"])
        meta["applies_to_fy"] = (selected == meta["rule_set_id"]) if selected else meta["source"] == "shipped"
    out.sort(key=lambda m: (m["financial_year"], m["source"] == "shipped", m["name"]), reverse=True)
    return out


def get_rule_set(conn, rule_set_id: str, version: Optional[int] = None) -> Tuple[dict, dict]:
    """Returns (content, meta) for a shipped or user rule set (latest version by default)."""
    shipped = loader.shipped_rule_sets()
    if rule_set_id in shipped:
        rules = shipped[rule_set_id]
        if version is not None and version != rules["version"]:
            raise RuleStoreError(f"{rule_set_id} has no version {version}", 404)
        return rules, _shipped_meta(rules)
    cursor = conn.cursor()
    if version is None:
        cursor.execute("SELECT * FROM tax_rule_sets WHERE rule_set_id = ? ORDER BY version DESC LIMIT 1", (rule_set_id,))
    else:
        cursor.execute("SELECT * FROM tax_rule_sets WHERE rule_set_id = ? AND version = ?", (rule_set_id, version))
    row = cursor.fetchone()
    if not row:
        raise RuleStoreError(f"Rule set {rule_set_id}" + (f" v{version}" if version else "") + " not found", 404)
    return json.loads(row["content_json"]), _row_meta(row)


def list_versions(conn, rule_set_id: str) -> List[dict]:
    if rule_set_id in loader.shipped_rule_sets():
        return [get_rule_set(conn, rule_set_id)[1]]
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tax_rule_sets WHERE rule_set_id = ? ORDER BY version DESC", (rule_set_id,))
    rows = cursor.fetchall()
    if not rows:
        raise RuleStoreError(f"Rule set {rule_set_id} not found", 404)
    return [_row_meta(r) for r in rows]


def resolve(conn, financial_year: Optional[str] = None, rule_set_id: Optional[str] = None,
            version: Optional[int] = None) -> Tuple[dict, dict]:
    """
    Picks the rule set a computation should use: an explicit rule_set_id (optionally a
    version), else the user's selection for financial_year, else the shipped set for it.
    """
    if rule_set_id:
        return get_rule_set(conn, rule_set_id, version)
    if not financial_year:
        raise RuleStoreError("Either financial_year or rule_set_id is required")
    selected = get_selection(conn).get(financial_year)
    if selected:
        return get_rule_set(conn, selected)
    try:
        rules = loader.load_rule_set(financial_year)
    except loader.RuleSetError as e:
        raise RuleStoreError(str(e))
    return rules, _shipped_meta(rules)


# ---------------------------------------------------------------------------
# Writes
# ---------------------------------------------------------------------------

def _validate(content: dict) -> None:
    try:
        loader.validate_rule_set(content)
    except loader.RuleSetError as e:
        raise RuleStoreError(f"Rule set is invalid: {e}", 422)


def _insert(conn, content: dict, name: str, version: int, based_on: Tuple[Optional[str], Optional[int]],
            note: Optional[str]) -> dict:
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tax_rule_sets (rule_set_id, version, financial_year, name, based_on_rule_set_id,
                                   based_on_version, content_json, content_hash, note)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (content["rule_set_id"], version, content["financial_year"], name, based_on[0], based_on[1],
          json.dumps(content, ensure_ascii=False), loader.content_hash(content), note))
    conn.commit()
    return get_rule_set(conn, content["rule_set_id"], version)[1]


def _unique_user_id(conn, name: str) -> str:
    base = USER_PREFIX + _slugify(name)
    cursor = conn.cursor()
    candidate, n = base, 2
    shipped = loader.shipped_rule_sets()
    while True:
        cursor.execute("SELECT 1 FROM tax_rule_sets WHERE rule_set_id = ? LIMIT 1", (candidate,))
        if not cursor.fetchone() and candidate not in shipped:
            return candidate
        candidate = f"{base}-{n}"
        n += 1


def create_rule_set(conn, name: str, based_on_rule_set_id: Optional[str] = None,
                    based_on_version: Optional[int] = None, content: Optional[dict] = None,
                    financial_year: Optional[str] = None, note: Optional[str] = None) -> dict:
    """
    Creates version 1 of a new user rule set, either as a copy of an existing set
    (based_on_rule_set_id) or from imported JSON (content). A copy may be re-targeted at
    a different financial_year, e.g. to draft next year's rules from this year's.
    """
    name = (name or "").strip()
    if not name:
        raise RuleStoreError("A name is required")
    base_content = None
    if based_on_rule_set_id:
        base_content, base_meta = get_rule_set(conn, based_on_rule_set_id, based_on_version)
        based_on_version = base_meta["version"]
        new_content = copy.deepcopy(base_content) if content is None else copy.deepcopy(content)
    elif content is not None:
        new_content = copy.deepcopy(content)
        if isinstance(new_content, dict):
            # An imported file's own verification/source claims can't be checked, so
            # it's compared against the shipped set for the same year instead: only
            # values identical to that official set keep their provenance.
            shipped_same_year = next((r for r in loader.shipped_rule_sets().values()
                                      if r["financial_year"] == new_content.get("financial_year")), None)
            base_content = shipped_same_year if shipped_same_year is not None else {}
    else:
        raise RuleStoreError("Provide either a rule set to copy or rule set content to import")
    if not isinstance(new_content, dict):
        raise RuleStoreError("Rule set content must be a JSON object", 422)

    retargeted_from = None
    if financial_year:
        if base_content and financial_year != base_content["financial_year"]:
            retargeted_from = base_content["financial_year"]
        new_content.update(fy_metadata(financial_year))
    new_content["rule_set_id"] = _unique_user_id(conn, name)
    new_content["version"] = 1
    new_content["name"] = name
    _validate(new_content)
    if base_content is not None:
        changed = set(mark_user_entered(new_content, base_content))
        if not based_on_rule_set_id and base_content:
            based_on_rule_set_id, based_on_version = base_content["rule_set_id"], base_content["version"]
        if retargeted_from:
            # Values verified for the base year say nothing about the new year: carry
            # them over as assumptions until the user confirms or changes them.
            for path, item in _iter_items(new_content):
                if path not in changed:
                    item["verification"] = "assumption"
                    item.pop("source", None)
                    carried = f"Carried over unchanged from {retargeted_from}; not yet confirmed for {financial_year}."
                    item["note"] = f"{carried} {item['note']}" if item.get("note") else carried
            new_content["status_note"] = (f"Draft for {financial_year}, copied from {base_content['rule_set_id']} "
                                          f"({retargeted_from}). Every value is an assumption until confirmed.")
    _validate(new_content)
    return _insert(conn, new_content, name, 1, (based_on_rule_set_id, based_on_version), note)


def update_rule_set(conn, rule_set_id: str, content: dict, note: Optional[str] = None,
                    name: Optional[str] = None) -> dict:
    """Saves a new version. Unchanged content returns the current version untouched."""
    if not rule_set_id.startswith(USER_PREFIX) or rule_set_id in loader.shipped_rule_sets():
        raise RuleStoreError("Shipped rule sets are read-only; copy one to edit it", 403)
    previous, meta = get_rule_set(conn, rule_set_id)
    if meta["status"] == "archived":
        raise RuleStoreError("Restore this rule set before editing it", 409)
    if not isinstance(content, dict):
        raise RuleStoreError("Rule set content must be a JSON object", 422)
    new_content = copy.deepcopy(content)
    if new_content.get("financial_year") != previous["financial_year"]:
        raise RuleStoreError("A rule set's financial year can't change; copy it to a new year instead", 422)
    new_name = (name or new_content.get("name") or meta["name"]).strip()
    new_content["rule_set_id"] = rule_set_id
    new_content["name"] = new_name
    new_content["version"] = previous["version"]
    _validate(new_content)
    mark_user_entered(new_content, previous)
    if loader.content_hash(new_content) == loader.content_hash(previous):
        return dict(meta, unchanged=True)
    new_content["version"] = meta["version"] + 1
    return _insert(conn, new_content, new_name, meta["version"] + 1,
                   (meta["based_on_rule_set_id"], meta["based_on_version"]), note)


def set_status(conn, rule_set_id: str, status: str) -> dict:
    if rule_set_id in loader.shipped_rule_sets():
        raise RuleStoreError("Shipped rule sets can't be archived", 403)
    list_versions(conn, rule_set_id)  # 404 if missing
    cursor = conn.cursor()
    cursor.execute("UPDATE tax_rule_sets SET status = ? WHERE rule_set_id = ?", (status, rule_set_id))
    if status == "archived":
        cursor.execute("DELETE FROM tax_rule_set_selection WHERE rule_set_id = ?", (rule_set_id,))
    conn.commit()
    return get_rule_set(conn, rule_set_id)[1]


def delete_rule_set(conn, rule_set_id: str) -> None:
    if rule_set_id in loader.shipped_rule_sets():
        raise RuleStoreError("Shipped rule sets can't be deleted", 403)
    list_versions(conn, rule_set_id)
    cursor = conn.cursor()
    cursor.execute("SELECT COUNT(*) AS n FROM tax_scenarios WHERE rule_set_id = ?", (rule_set_id,))
    used_by = cursor.fetchone()["n"]
    if used_by:
        raise RuleStoreError(
            f"{used_by} saved scenario(s) were computed with this rule set; archive it instead so they stay reproducible", 409)
    cursor.execute("DELETE FROM tax_rule_set_selection WHERE rule_set_id = ?", (rule_set_id,))
    cursor.execute("DELETE FROM tax_rule_sets WHERE rule_set_id = ?", (rule_set_id,))
    conn.commit()


def set_selection(conn, financial_year: str, rule_set_id: Optional[str]) -> None:
    fy_metadata(financial_year)
    cursor = conn.cursor()
    shipped = loader.shipped_rule_sets()
    if rule_set_id is None or (rule_set_id in shipped and shipped[rule_set_id]["financial_year"] == financial_year):
        cursor.execute("DELETE FROM tax_rule_set_selection WHERE financial_year = ?", (financial_year,))
        conn.commit()
        return
    content, meta = get_rule_set(conn, rule_set_id)
    if meta["financial_year"] != financial_year:
        raise RuleStoreError(f"{rule_set_id} is for {meta['financial_year']}, not {financial_year}", 422)
    if meta["status"] != "active":
        raise RuleStoreError("Restore this rule set before selecting it", 409)
    cursor.execute("""
        INSERT INTO tax_rule_set_selection (financial_year, rule_set_id) VALUES (?, ?)
        ON CONFLICT(financial_year) DO UPDATE SET rule_set_id = excluded.rule_set_id
    """, (financial_year, rule_set_id))
    conn.commit()
