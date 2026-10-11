"""
Loads and validates the versioned tax rule sets in backend/tax/rules/*.json.

A rule set is the ONLY place financial-year-specific numbers (slabs, limits, rates,
thresholds) may live — engine.py reads everything through here. Each leaf "item" is
{"value": ..., "verification": ...} plus optional provenance (legacy_section,
act_2025_section, source, note), so every figure the engine uses can be traced back
to where it came from and how confident we are in it.

Validation is strict and runs on load: a malformed rule file raises RuleSetError
rather than producing a quietly-wrong tax figure.
"""
import hashlib
import json
import sys
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional

# user_entered: set automatically on any item a user changed in their own rule set
# (see rule_store.py) — it is never valid in a shipped file.
VERIFICATION_LEVELS = ("verified", "secondary_source", "unverified", "assumption", "user_entered")

REQUIRED_TOP_LEVEL = (
    "rule_set_id", "version", "financial_year", "assessment_year", "act",
    "effective_from", "effective_to", "sources", "age_bands", "rounding", "cess",
    "employer_retirement_aggregate_cap", "house_property", "special_rates", "regimes",
)
REQUIRED_TOP_LEVEL_ITEMS = (
    "age_bands", "rounding", "cess", "employer_retirement_aggregate_cap",
    "house_property", "special_rates",
)
# Optional: rule sets made before these existed (including users' copies) stay valid; the
# features that use them say so when they're missing.
OPTIONAL_TOP_LEVEL_ITEMS = ("advance_tax", "return_due_date")
REQUIRED_REGIME_ITEMS = (
    "slabs", "standard_deduction", "rebate", "surcharge", "professional_tax", "hra",
    "allowance_exemptions", "house_property_loss_setoff_cap", "employer_nps", "deductions",
)
REGIMES = ("old", "new")


class RuleSetError(ValueError):
    pass


def _data_dir(name: str) -> Path:
    # In a PyInstaller build, data files added via --add-data land under sys._MEIPASS
    # mirroring their source path; __file__-relative usually resolves there too, but
    # fall back explicitly in case it doesn't. Every directory read here must also be
    # listed in package.json's build:backend* --add-data flags.
    here = Path(__file__).resolve().parent / name
    if here.is_dir():
        return here
    meipass = getattr(sys, "_MEIPASS", None)
    if meipass:
        frozen = Path(meipass) / "backend" / "tax" / name
        if frozen.is_dir():
            return frozen
    raise RuleSetError(f"Tax data directory '{name}' not found (looked in {here})")


def _rules_dir() -> Path:
    return _data_dir("rules")


@lru_cache(maxsize=None)
def load_input_metadata() -> dict:
    """Tax Planner input-field metadata (labels, groups, help) — not year-specific."""
    return json.loads((_data_dir("metadata") / "input_fields.json").read_text(encoding="utf-8"))


def _check_item(item, path: str) -> None:
    if not isinstance(item, dict) or "value" not in item:
        raise RuleSetError(f"{path}: expected an item object with a 'value' key")
    if item.get("verification") not in VERIFICATION_LEVELS:
        raise RuleSetError(f"{path}: verification must be one of {VERIFICATION_LEVELS}, got {item.get('verification')!r}")


def _check_brackets(brackets, path: str) -> None:
    if not isinstance(brackets, list) or not brackets:
        raise RuleSetError(f"{path}: expected a non-empty list of [upper_bound, rate_pct] pairs")
    previous = 0
    for i, pair in enumerate(brackets):
        if not (isinstance(pair, list) and len(pair) == 2):
            raise RuleSetError(f"{path}[{i}]: expected [upper_bound, rate_pct]")
        upper, rate = pair
        if not isinstance(rate, (int, float)) or rate < 0:
            raise RuleSetError(f"{path}[{i}]: rate must be a non-negative number")
        is_last = i == len(brackets) - 1
        if upper is None:
            if not is_last:
                raise RuleSetError(f"{path}[{i}]: only the last bracket may have a null upper bound")
            continue
        if not isinstance(upper, (int, float)) or upper <= previous:
            raise RuleSetError(f"{path}[{i}]: upper bounds must be strictly ascending numbers")
        previous = upper
    if brackets[-1][0] is not None:
        raise RuleSetError(f"{path}: last bracket must have a null (open-ended) upper bound")


def _check_tiers(tiers, path: str) -> None:
    previous = 0
    for i, pair in enumerate(tiers):
        if not (isinstance(pair, list) and len(pair) == 2 and all(isinstance(x, (int, float)) for x in pair)):
            raise RuleSetError(f"{path}[{i}]: expected [threshold, rate_pct]")
        if pair[0] <= previous:
            raise RuleSetError(f"{path}[{i}]: thresholds must be strictly ascending")
        previous = pair[0]


def validate_rule_set(rules: dict) -> None:
    for key in REQUIRED_TOP_LEVEL:
        if key not in rules:
            raise RuleSetError(f"missing top-level key '{key}'")
    for key in REQUIRED_TOP_LEVEL_ITEMS:
        _check_item(rules[key], key)
    source_ids = {s.get("id") for s in rules["sources"]}
    for key in OPTIONAL_TOP_LEVEL_ITEMS:
        if key in rules:
            _check_item(rules[key], key)
            src = rules[key].get("source")
            if src is not None and src not in source_ids:
                raise RuleSetError(f"{key}: unknown source id '{src}'")
    for regime in REGIMES:
        if regime not in rules["regimes"]:
            raise RuleSetError(f"missing regime '{regime}'")
        reg = rules["regimes"][regime]
        for key in REQUIRED_REGIME_ITEMS:
            if key not in reg:
                raise RuleSetError(f"regimes.{regime}: missing '{key}'")
            _check_item(reg[key], f"regimes.{regime}.{key}")
            src = reg[key].get("source")
            if src is not None and src not in source_ids:
                raise RuleSetError(f"regimes.{regime}.{key}: unknown source id '{src}'")
        for band, brackets in reg["slabs"]["value"].items():
            _check_brackets(brackets, f"regimes.{regime}.slabs.{band}")
        _check_tiers(reg["surcharge"]["value"]["tiers"], f"regimes.{regime}.surcharge.tiers")
    for band in ("below_60", "60_to_80", "80_plus"):
        if band not in rules["regimes"]["old"]["slabs"]["value"]:
            raise RuleSetError(f"regimes.old.slabs: missing age band '{band}'")
    if "default" not in rules["regimes"]["new"]["slabs"]["value"]:
        raise RuleSetError("regimes.new.slabs: missing 'default' band")


def _load_file(path: Path) -> dict:
    try:
        rules = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise RuleSetError(f"{path.name}: invalid JSON ({e})")
    try:
        validate_rule_set(rules)
    except RuleSetError as e:
        raise RuleSetError(f"{path.name}: {e}")
    return rules


def content_hash(rules: dict) -> str:
    """Stable fingerprint of a rule set's content, recorded with every saved scenario."""
    canonical = json.dumps(rules, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _has_user_entered(node) -> bool:
    if isinstance(node, dict):
        if node.get("verification") == "user_entered":
            return True
        return any(_has_user_entered(v) for v in node.values())
    return False


@lru_cache(maxsize=None)
def _all_rule_sets() -> Dict[str, dict]:
    by_fy = {}
    for path in sorted(_rules_dir().glob("*.json")):
        rules = _load_file(path)
        if _has_user_entered(rules):
            raise RuleSetError(f"{path.name}: shipped rule sets may not contain 'user_entered' items")
        fy = rules["financial_year"]
        if fy in by_fy:
            raise RuleSetError(f"two rule sets claim financial year {fy}")
        by_fy[fy] = rules
    return by_fy


def shipped_rule_sets() -> Dict[str, dict]:
    """Shipped (read-only) rule sets keyed by rule_set_id."""
    return {r["rule_set_id"]: r for r in _all_rule_sets().values()}


def list_rule_sets() -> List[dict]:
    """Summary of every shipped rule set, newest financial year first."""
    out = []
    for fy, r in sorted(_all_rule_sets().items(), reverse=True):
        out.append({
            "rule_set_id": r["rule_set_id"],
            "version": r["version"],
            "financial_year": fy,
            "assessment_year": r["assessment_year"],
            "act": r["act"],
            "effective_from": r["effective_from"],
            "effective_to": r["effective_to"],
            "status_note": r.get("status_note"),
            "content_hash": content_hash(r),
        })
    return out


def load_rule_set(financial_year: str) -> dict:
    rule_sets = _all_rule_sets()
    if financial_year not in rule_sets:
        available = ", ".join(sorted(rule_sets))
        raise RuleSetError(f"No tax rule set for financial year {financial_year} (available: {available})")
    return rule_sets[financial_year]


def latest_financial_year(on_or_before: Optional[str] = None) -> str:
    """Newest FY with a rule set, optionally restricted to FYs not later than on_or_before."""
    years = sorted(_all_rule_sets())
    if on_or_before is not None:
        years = [y for y in years if y <= on_or_before]
    if not years:
        raise RuleSetError("No tax rule sets available")
    return years[-1]


@lru_cache(maxsize=None)
def load_epf_rules() -> dict:
    """EPFO contribution rules for the EPF helper (dated wage ceilings) — not tax rules."""
    rules = json.loads((_data_dir("metadata") / "epf_rules.json").read_text(encoding="utf-8"))
    validate_epf_rules(rules)
    return rules


def validate_epf_rules(rules: dict) -> None:
    from datetime import date
    source_ids = {s.get("id") for s in rules.get("sources") or []}
    _check_item(rules.get("employee_rate_pct"), "employee_rate_pct")
    rate = rules["employee_rate_pct"]["value"]
    if not isinstance(rate, (int, float)) or not 0 < rate <= 100:
        raise RuleSetError("employee_rate_pct must be a percentage above 0")
    periods = (rules.get("wage_ceiling_monthly") or {}).get("value")
    if not isinstance(periods, list) or not periods:
        raise RuleSetError("wage_ceiling_monthly.value must be a non-empty list of {from, amount}")
    previous = None
    for i, p in enumerate(periods):
        where = f"wage_ceiling_monthly.value[{i}]"
        try:
            start = date.fromisoformat(p["from"])
        except (KeyError, TypeError, ValueError):
            raise RuleSetError(f"{where}.from must be a YYYY-MM-DD date")
        if previous is not None and start <= previous:
            raise RuleSetError(f"{where}: periods must be in ascending date order")
        previous = start
        if not isinstance(p.get("amount"), (int, float)) or p["amount"] <= 0:
            raise RuleSetError(f"{where}.amount must be a positive number")
        if p.get("verification") not in VERIFICATION_LEVELS[:-1]:
            raise RuleSetError(f"{where}.verification must be one of {VERIFICATION_LEVELS[:-1]}")
        if p.get("source") not in source_ids:
            raise RuleSetError(f"{where}: unknown source id {p.get('source')!r}")
