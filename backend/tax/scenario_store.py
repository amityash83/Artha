"""
Saved Tax Planner scenarios: immutable snapshots of the inputs, the full computed
result (including the audit trail) and the exact rule set version + content hash
used. The server always computes the stored result itself; a client-supplied result
is never trusted. Recalculating under current rules writes a NEW scenario that
points back to the original via recalculated_from, so history is never rewritten.
"""
import json
from datetime import datetime
from typing import List, Optional

from backend.tax import engine
from backend.tax import rule_store


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def _summary(row) -> dict:
    result = json.loads(row["result_json"])
    return {
        "id": row["id"],
        "name": row["name"],
        "profile_id": row["profile_id"],
        "financial_year": row["financial_year"],
        "rule_set_id": row["rule_set_id"],
        "rule_set_version": row["rule_set_version"],
        "rule_set_hash": row["rule_set_hash"],
        "computed_at": row["computed_at"],
        "recalculated_from": row["recalculated_from"],
        "notes": row["notes"],
        "created_at": row["created_at"],
        "old_total_tax": result["regimes"]["old"]["total_tax"],
        "new_total_tax": result["regimes"]["new"]["total_tax"],
        "best_regime": result["comparison"]["best_regime"],
    }


def _compute(conn, inputs: dict, financial_year: Optional[str], rule_set_id: Optional[str],
             rule_set_version: Optional[int]):
    rules, meta = rule_store.resolve(conn, financial_year, rule_set_id, rule_set_version)
    result = engine.compute(inputs, rules, computed_at=_now())
    result["rule_set"].update({"name": meta["name"], "source": meta["source"], "content_hash": meta["content_hash"]})
    return result, meta


def save(conn, name: str, inputs: dict, financial_year: Optional[str] = None, rule_set_id: Optional[str] = None,
         rule_set_version: Optional[int] = None, profile_id: Optional[int] = None, notes: Optional[str] = None,
         recalculated_from: Optional[int] = None) -> dict:
    name = (name or "").strip()
    if not name:
        raise rule_store.RuleStoreError("A scenario name is required")
    result, meta = _compute(conn, inputs, financial_year, rule_set_id, rule_set_version)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO tax_scenarios (name, profile_id, financial_year, rule_set_id, rule_set_version, rule_set_hash,
                                   inputs_json, result_json, computed_at, recalculated_from, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (name, profile_id, meta["financial_year"], meta["rule_set_id"], meta["version"], meta["content_hash"],
          json.dumps(result["inputs"]), json.dumps(result), result["computed_at"], recalculated_from, notes))
    conn.commit()
    return get(conn, cursor.lastrowid)


def list_scenarios(conn) -> List[dict]:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tax_scenarios ORDER BY created_at DESC, id DESC")
    return [_summary(r) for r in cursor.fetchall()]


def get(conn, scenario_id: int) -> dict:
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM tax_scenarios WHERE id = ?", (scenario_id,))
    row = cursor.fetchone()
    if not row:
        raise rule_store.RuleStoreError("Scenario not found", 404)
    out = _summary(row)
    out["inputs"] = json.loads(row["inputs_json"])
    out["result"] = json.loads(row["result_json"])
    return out


def delete(conn, scenario_id: int) -> None:
    get(conn, scenario_id)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM tax_scenarios WHERE id = ?", (scenario_id,))
    conn.commit()


def recalculate(conn, scenario_id: int) -> dict:
    """
    Recomputes a saved scenario's inputs under whichever rule set currently applies to
    its financial year, saved as a new scenario. Returns both, plus what changed.
    """
    original = get(conn, scenario_id)
    rules, meta = rule_store.resolve(conn, original["financial_year"])
    recalculated = save(conn, f"{original['name']} (recalculated)", original["inputs"],
                        rule_set_id=meta["rule_set_id"], rule_set_version=meta["version"],
                        profile_id=original["profile_id"], notes=original["notes"], recalculated_from=scenario_id)
    return {
        "original": {k: v for k, v in original.items() if k not in ("inputs", "result")},
        "recalculated": {k: v for k, v in recalculated.items() if k not in ("inputs", "result")},
        "rules_changed": original["rule_set_hash"] != recalculated["rule_set_hash"],
        "old_regime_tax_change": recalculated["old_total_tax"] - original["old_total_tax"],
        "new_regime_tax_change": recalculated["new_total_tax"] - original["new_total_tax"],
    }
