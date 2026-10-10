import copy
import json
import re
from pathlib import Path

import pytest

from backend.tax import rules_loader
from backend.tax.rules_loader import RuleSetError, list_rule_sets, load_rule_set, validate_rule_set

TAX_PACKAGE = Path(rules_loader.__file__).resolve().parent


def test_every_rule_file_loads_and_validates():
    files = sorted((TAX_PACKAGE / "rules").glob("*.json"))
    assert files, "no rule files found"
    for path in files:
        validate_rule_set(json.loads(path.read_text(encoding="utf-8")))


def test_rule_sets_are_listed_newest_first_and_cover_both_years():
    years = [r["financial_year"] for r in list_rule_sets()]
    assert years == sorted(years, reverse=True)
    assert {"2025-26", "2026-27"} <= set(years)


def test_unknown_financial_year_is_rejected():
    with pytest.raises(RuleSetError, match="No tax rule set"):
        load_rule_set("1999-00")


def test_2026_27_is_the_new_act_and_2025_26_the_old_act():
    assert load_rule_set("2026-27")["act"] == "Income-tax Act, 2025"
    assert load_rule_set("2025-26")["act"] == "Income-tax Act, 1961"


def test_hra_metro_list_differs_between_years():
    # Income-tax Rules 2026 added four cities to the 50% list.
    new_cities = set(load_rule_set("2026-27")["regimes"]["old"]["hra"]["value"]["metro_cities"])
    old_cities = set(load_rule_set("2025-26")["regimes"]["old"]["hra"]["value"]["metro_cities"])
    assert old_cities == {"Mumbai", "Kolkata", "Delhi", "Chennai"}
    assert new_cities == old_cities | {"Hyderabad", "Pune", "Ahmedabad", "Bengaluru"}


@pytest.mark.parametrize("mutate, message", [
    (lambda r: r["regimes"]["new"]["slabs"]["value"]["default"].reverse(), "ascending|null"),
    (lambda r: r["regimes"]["new"]["slabs"]["value"]["default"].__setitem__(-1, [9999999999, 30]), "open-ended"),
    (lambda r: r["regimes"]["old"]["rebate"].__setitem__("verification", "probably"), "verification"),
    (lambda r: r["regimes"]["old"]["surcharge"]["value"]["tiers"].reverse(), "ascending"),
    (lambda r: r["regimes"]["old"]["slabs"]["value"].pop("80_plus"), "80_plus"),
    (lambda r: r["regimes"]["new"].pop("rebate"), "rebate"),
    (lambda r: r["regimes"]["new"]["employer_nps"].__setitem__("source", "nonexistent"), "unknown source"),
    (lambda r: r.pop("cess"), "cess"),
])
def test_malformed_rule_sets_fail_loudly(mutate, message):
    rules = copy.deepcopy(load_rule_set("2026-27"))
    mutate(rules)
    with pytest.raises(RuleSetError, match=message):
        validate_rule_set(rules)


def _code_without_comments_and_docstrings(source: str) -> str:
    source = re.sub(r'"""[\s\S]*?"""', "", source)
    return "\n".join(line.split("#", 1)[0] for line in source.splitlines())


@pytest.mark.parametrize("module", ["engine.py", "hra.py", "validation.py", "rules_loader.py"])
def test_no_financial_thresholds_hardcoded_in_tax_code(module):
    # Financial-year-specific numbers (slab bounds, limits, caps) belong in the rule
    # files. Any literal of 4+ digits in executable code is almost certainly one.
    code = _code_without_comments_and_docstrings((TAX_PACKAGE / module).read_text(encoding="utf-8"))
    literals = re.findall(r"(?<![\w.])\d{4,}(?:\.\d+)?(?![\w])", code)
    assert literals == [], f"{module} contains numeric literals {literals}; move them to a rule set"
