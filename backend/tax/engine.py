"""
Deterministic Indian personal income-tax engine for salaried individuals.

compute(inputs, rules) runs the same 14-step computation for both regimes:

   1 gross salary            6 deductions (Chapter VI-A)     11 health & education cess
   2 salary exemptions       7 total income (rounded)        12 total tax (rounded)
   3 taxable salary          8 slab + special-rate tax       13 prepaid taxes (TDS/advance)
   4 other income            9 rebate (+ marginal relief)    14 balance payable / refund
   5 gross total income     10 surcharge (+ marginal relief)

Pure: no DB, no network, no clock (the caller passes computed_at). Every financial-
year-specific number comes from the rule set (see rules_loader.py) — this module must
never hold a slab, limit, rate or threshold literal (enforced by test_tax_rules.py).

Every figure is also recorded as an audit line saying where it came from (user input,
a rule-set item and its verification level, a derivation, or a user assertion the
engine cannot check), so the UI, reports and audit panel all explain the same numbers.
"""
import copy
import math
from typing import Dict, List, Optional

from backend.tax.hra import calculate_hra_exemption, calculate_hra_exemption_monthly, is_metro_city

RESIDENTIAL_STATUSES = ("resident", "rnor", "non_resident")
EMPLOYER_TYPES = ("private", "government")
SPECIAL_INCOME_KEYS = ("stcg_111a", "ltcg_112a", "ltcg_112")
# Order in which a resident's unused basic exemption is set against special-rate
# income: highest rate first, which is what minimises tax.
BASIC_EXEMPTION_ADJUSTMENT_ORDER = ("stcg_111a", "ltcg_112a", "ltcg_112")
MONTHS_PER_YEAR = 12

DEFAULT_INPUTS = {
    "profile": {
        "age": 30,
        "residential_status": "resident",
        "employer_type": "private",
        "city": None,
        "metro": None,               # explicit override; None = derive from city
        "selected_regime": None,     # regime the payroll is deducting TDS under, if known
    },
    # Annual cash salary components. basic/da/hra have special meaning (HRA and NPS
    # bases); any other key is treated as a fully taxable cash component, so new
    # allowances can be added without changing this module.
    "salary": {
        "basic": 0.0, "da": 0.0, "hra": 0.0, "special_allowance": 0.0,
        "bonus": 0.0, "incentives": 0.0, "other_taxable_allowances": 0.0,
    },
    "salary_monthly": None,          # optional monthly figures, only for reconciliation checks
    # Optional month-by-month entry (April..March). When enabled, the annual salary,
    # payroll and employer figures, rent and TDS paid are derived from the 12 months;
    # see _normalize_monthly. Shape: {"enabled": bool, "months": [12 x month]}, month =
    # {"label", "status": "actual"|"projected", "salary": {}, "payroll_deductions": {},
    #  "employer_contributions": {}, "tds": number|null, "rent_paid": number, "metro": bool|null}
    "monthly": None,
    "employer_contributions": {"pf": 0.0, "nps": 0.0, "superannuation": 0.0},
    "payroll_deductions": {
        "employee_epf": 0.0, "vpf": 0.0, "employee_esic": 0.0, "professional_tax": 0.0, "other": 0.0,
    },
    "hra": {"rent_paid_monthly": 0.0, "months_rented": 12},
    "exempt_allowances": {
        "children_education_received": 0.0, "children_education_children": 0,
        "hostel_received": 0.0, "hostel_children": 0,
        "other_old": 0.0, "other_new": 0.0,
    },
    "other_income": {
        "interest_savings": 0.0, "interest_deposits": 0.0, "dividends": 0.0,
        "rental_gross": 0.0, "rental_municipal_tax": 0.0, "other": 0.0,
    },
    "capital_gains": {"stcg_111a": 0.0, "ltcg_112a": 0.0, "ltcg_112": 0.0, "stcg_slab": 0.0},
    "deductions": {
        "80C": {"ppf": 0.0, "elss": 0.0, "life_insurance": 0.0, "home_loan_principal": 0.0,
                "tuition_fees": 0.0, "other": 0.0},
        "employee_nps": 0.0,
        "80D_self_family": 0.0,
        "80D_parents": 0.0,
        "parents_senior": False,
        "home_loan_interest_self_occupied": 0.0,
        "80E": 0.0,
        "80G_eligible": 0.0,
        "other_old": 0.0,
        "other_new": 0.0,
    },
    "prepaid": {"tds": 0.0, "advance_tax": 0.0},
}

_NON_MONEY_KEYS = {
    ("profile", "age"), ("profile", "residential_status"), ("profile", "employer_type"),
    ("profile", "city"), ("profile", "metro"), ("profile", "selected_regime"),
    ("hra", "months_rented"), ("exempt_allowances", "children_education_children"),
    ("exempt_allowances", "hostel_children"), ("deductions", "parents_senior"),
}


class TaxInputError(ValueError):
    pass


# ---------------------------------------------------------------------------
# Input normalisation
# ---------------------------------------------------------------------------

def _merge(defaults: dict, raw: dict, path: str, open_keys: bool) -> dict:
    out = copy.deepcopy(defaults)
    for key, value in (raw or {}).items():
        if key not in defaults and not open_keys:
            raise TaxInputError(f"Unknown input '{path}.{key}'")
        if isinstance(defaults.get(key), dict) and isinstance(value, dict):
            out[key] = _merge(defaults[key], value, f"{path}.{key}", open_keys=False)
        else:
            out[key] = value
    return out


def _as_money(value, where: str) -> float:
    if value is None:
        return 0.0
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise TaxInputError(f"{where} must be a number")
    if math.isnan(number) or math.isinf(number):
        raise TaxInputError(f"{where} must be a finite number")
    if number < 0:
        raise TaxInputError(f"{where} cannot be negative")
    return number


def normalize_inputs(raw: Optional[dict]) -> dict:
    raw = raw or {}
    inp = {}
    for section, defaults in DEFAULT_INPUTS.items():
        value = raw.get(section)
        if defaults is None:
            inp[section] = value
        elif section == "salary":
            inp[section] = _merge(defaults, value, section, open_keys=True)
        else:
            inp[section] = _merge(defaults, value, section, open_keys=False)
    unknown = set(raw) - set(DEFAULT_INPUTS)
    if unknown:
        raise TaxInputError(f"Unknown input section(s): {', '.join(sorted(unknown))}")

    for section, values in inp.items():
        if not isinstance(values, dict) or section == "monthly":  # validated by _normalize_monthly
            continue
        for key, value in values.items():
            if (section, key) in _NON_MONEY_KEYS:
                continue
            if isinstance(value, dict):
                for sub_key, sub_value in value.items():
                    value[sub_key] = _as_money(sub_value, f"{section}.{key}.{sub_key}")
            else:
                values[key] = _as_money(value, f"{section}.{key}")

    profile = inp["profile"]
    try:
        profile["age"] = int(profile["age"])
    except (TypeError, ValueError):
        raise TaxInputError("profile.age must be a whole number")
    if not 0 <= profile["age"] <= 130:
        raise TaxInputError("profile.age is out of range")
    if profile["residential_status"] not in RESIDENTIAL_STATUSES:
        raise TaxInputError(f"profile.residential_status must be one of {RESIDENTIAL_STATUSES}")
    if profile["employer_type"] not in EMPLOYER_TYPES:
        raise TaxInputError(f"profile.employer_type must be one of {EMPLOYER_TYPES}")
    if profile["selected_regime"] not in (None, "old", "new"):
        raise TaxInputError("profile.selected_regime must be 'old', 'new' or null")
    months = inp["hra"]["months_rented"]
    try:
        months = int(months)
    except (TypeError, ValueError):
        raise TaxInputError("hra.months_rented must be a whole number")
    if not 0 <= months <= MONTHS_PER_YEAR:
        raise TaxInputError("hra.months_rented must be between 0 and 12")
    inp["hra"]["months_rented"] = months
    for key in ("children_education_children", "hostel_children"):
        count = inp["exempt_allowances"][key]
        try:
            count = int(count)
        except (TypeError, ValueError):
            raise TaxInputError(f"exempt_allowances.{key} must be a whole number")
        if count < 0:
            raise TaxInputError(f"exempt_allowances.{key} cannot be negative")
        inp["exempt_allowances"][key] = count
    inp["deductions"]["parents_senior"] = bool(inp["deductions"]["parents_senior"])
    if inp["salary_monthly"] is not None:
        if not isinstance(inp["salary_monthly"], dict):
            raise TaxInputError("salary_monthly must be an object")
        inp["salary_monthly"] = {k: _as_money(v, f"salary_monthly.{k}") for k, v in inp["salary_monthly"].items()}
    _normalize_monthly(inp)
    return inp


MONTH_STATUSES = ("actual", "projected")


def _normalize_monthly(inp: dict) -> None:
    """Validates the optional month-by-month entry and, when enabled, makes it the source
    of the annual figures the rest of the engine uses."""
    raw = inp.get("monthly")
    if not raw:
        inp["monthly"] = None
        return
    if not isinstance(raw, dict):
        raise TaxInputError("monthly must be an object")
    months_raw = raw.get("months") or []
    if not isinstance(months_raw, list) or len(months_raw) != MONTHS_PER_YEAR:
        raise TaxInputError("monthly.months must list 12 months (April to March)")
    months = []
    for i, m in enumerate(months_raw):
        where = f"monthly.months[{i}]"
        if not isinstance(m, dict):
            raise TaxInputError(f"{where} must be an object")
        status = m.get("status") or "projected"
        if status not in MONTH_STATUSES:
            raise TaxInputError(f"{where}.status must be one of {MONTH_STATUSES}")
        salary = {k: _as_money(v, f"{where}.salary.{k}") for k, v in (m.get("salary") or {}).items()}
        payroll = _merge(DEFAULT_INPUTS["payroll_deductions"], m.get("payroll_deductions"), f"{where}.payroll_deductions", False)
        employer = _merge(DEFAULT_INPUTS["employer_contributions"], m.get("employer_contributions"), f"{where}.employer_contributions", False)
        tds = m.get("tds")
        metro = m.get("metro")
        if metro not in (None, True, False):
            raise TaxInputError(f"{where}.metro must be true, false or null")
        months.append({
            "label": str(m.get("label") or f"Month {i + 1}"),
            "status": status,
            "salary": salary,
            "payroll_deductions": {k: _as_money(v, f"{where}.payroll_deductions.{k}") for k, v in payroll.items()},
            "employer_contributions": {k: _as_money(v, f"{where}.employer_contributions.{k}") for k, v in employer.items()},
            "tds": None if tds in (None, "") else _as_money(tds, f"{where}.tds"),
            "rent_paid": _as_money(m.get("rent_paid"), f"{where}.rent_paid"),
            "metro": metro,
        })
    enabled = bool(raw.get("enabled"))
    inp["monthly"] = {"enabled": enabled, "months": months}
    if enabled:
        apply_monthly_totals(inp)


def apply_monthly_totals(inp: dict) -> None:
    """Annual salary/payroll/employer figures, rent and TDS paid, from the months."""
    months = inp["monthly"]["months"]
    keys = set(DEFAULT_INPUTS["salary"])
    for m in months:
        keys.update(m["salary"])
    inp["salary"] = {k: sum(m["salary"].get(k, 0.0) for m in months) for k in keys}
    for section in ("payroll_deductions", "employer_contributions"):
        inp[section] = {k: sum(m[section][k] for m in months) for k in DEFAULT_INPUTS[section]}
    inp["prepaid"]["tds"] = sum(m["tds"] or 0.0 for m in months if m["status"] == "actual")
    rented = [m["rent_paid"] for m in months if m["rent_paid"] > 0]
    inp["hra"]["months_rented"] = len(rented)
    inp["hra"]["rent_paid_monthly"] = sum(rented) / len(rented) if rented else 0.0
    inp["salary_monthly"] = None


def monthly_enabled(inp: dict) -> bool:
    return bool(inp.get("monthly") and inp["monthly"]["enabled"])


# ---------------------------------------------------------------------------
# Primitives
# ---------------------------------------------------------------------------

def round_to_nearest(amount: float, nearest: int) -> float:
    """Ignore paise, then round to the nearest multiple (a last digit of 5+ rounds up)."""
    if amount <= 0:
        return 0.0
    rupees = math.floor(amount + 1e-9)
    remainder = rupees % nearest
    return float(rupees - remainder + (nearest if remainder * 2 >= nearest else 0))


def slab_tax(income: float, brackets: list) -> float:
    tax = 0.0
    lower = 0.0
    for upper, rate in brackets:
        top = income if upper is None else min(income, upper)
        if top > lower:
            tax += (top - lower) * rate / 100.0
        if upper is None or income <= upper:
            break
        lower = upper
    return tax


def _surcharge_tier(total_income: float, tiers: list):
    rate, threshold = 0.0, None
    for tier_threshold, tier_rate in tiers:
        if total_income > tier_threshold:
            rate, threshold = tier_rate, tier_threshold
    return rate, threshold


def _age_band(age: int, resident: bool, rules: dict) -> str:
    bands = rules["age_bands"]["value"]
    if bands["senior_slabs_residents_only"] and not resident:
        return "below_60"
    if age >= bands["super_senior_from_age"]:
        return "80_plus"
    if age >= bands["senior_from_age"]:
        return "60_to_80"
    return "below_60"


class _Audit:
    def __init__(self, regime: str, rules: dict):
        self.regime = regime
        self.rules = rules
        self.lines: List[dict] = []

    def add(self, step: int, key: str, label: str, amount: float, formula: str, source: str,
            rule_ref: Optional[str] = None, inputs: Optional[dict] = None) -> float:
        line = {
            "step": step, "key": key, "label": label, "amount": round(amount, 2),
            "formula": formula, "source": source,
        }
        if rule_ref:
            item = self._resolve(rule_ref)
            line["rule_ref"] = rule_ref
            line["verification"] = item.get("verification")
            for meta in ("legacy_section", "act_2025_section"):
                if item.get(meta):
                    line[meta] = item[meta]
        if inputs:
            line["inputs"] = {k: (round(v, 2) if isinstance(v, float) else v) for k, v in inputs.items()}
        self.lines.append(line)
        return amount

    def _resolve(self, ref: str) -> dict:
        node = self.rules
        for part in ref.split("."):
            node = node[part]
        return node


# ---------------------------------------------------------------------------
# Tax on a given income split (steps 8-10), reused for marginal relief and rates
# ---------------------------------------------------------------------------

def _tax_before_cess(normal_income: float, special: Dict[str, float], regime: str,
                     rules: dict, age_band: str, resident: bool) -> dict:
    reg = rules["regimes"][regime]
    brackets = reg["slabs"]["value"]["default" if regime == "new" else age_band]
    special_rates = rules["special_rates"]["value"]
    total_income = normal_income + sum(special.values())

    # Unused basic exemption (the zero-rate first slab) offsets special-rate income for residents.
    taxable_special = dict(special)
    basic_exemption = brackets[0][0] if brackets[0][1] == 0 and brackets[0][0] is not None else 0.0
    adjustment = 0.0
    if resident and special_rates["unused_basic_exemption_adjustment_residents"] and normal_income < basic_exemption:
        shortfall = basic_exemption - normal_income
        for key in BASIC_EXEMPTION_ADJUSTMENT_ORDER:
            take = min(shortfall, taxable_special[key])
            taxable_special[key] -= take
            shortfall -= take
            adjustment += take

    slab = slab_tax(normal_income, brackets)
    tax_111a = taxable_special["stcg_111a"] * special_rates["stcg_111a_pct"] / 100.0
    ltcg_112a_taxable = max(taxable_special["ltcg_112a"] - special_rates["ltcg_112a_exemption"], 0.0)
    tax_112a = ltcg_112a_taxable * special_rates["ltcg_112a_pct"] / 100.0
    tax_112 = taxable_special["ltcg_112"] * special_rates["ltcg_112_pct"] / 100.0
    special_tax = tax_111a + tax_112a + tax_112

    rebate_rules = reg["rebate"]["value"]
    rebate_base = slab + (tax_111a if "stcg_111a" in rebate_rules["applies_to"] else 0.0)
    rebate = 0.0
    rebate_marginal_relief = False
    if resident or not rebate_rules["residents_only"]:
        if total_income <= rebate_rules["income_limit"]:
            rebate = min(rebate_base, rebate_rules["max_amount"])
        elif rebate_rules["marginal_relief"]:
            excess = total_income - rebate_rules["income_limit"]
            if excess < rebate_base:
                rebate = rebate_base - excess
                rebate_marginal_relief = True
    tax_after_rebate = slab + special_tax - rebate

    surcharge_rules = reg["surcharge"]["value"]
    rate, threshold = _surcharge_tier(total_income, surcharge_rules["tiers"])
    surcharge = 0.0
    surcharge_before_relief = 0.0
    surcharge_marginal_relief = 0.0
    if rate:
        special_part = min(special_tax, tax_after_rebate)
        normal_part = tax_after_rebate - special_part
        special_rate = min(rate, surcharge_rules["special_income_max_pct"])
        surcharge_before_relief = normal_part * rate / 100.0 + special_part * special_rate / 100.0
        surcharge = surcharge_before_relief
        if surcharge_rules["marginal_relief"]:
            # Tax + surcharge may not exceed tax + surcharge at the threshold plus the
            # income above the threshold. Recompute at exactly the threshold by removing
            # the excess from normal income first, then from special-rate income.
            excess = total_income - threshold
            reduced_normal = max(normal_income - excess, 0.0)
            remaining = excess - (normal_income - reduced_normal)
            reduced_special = dict(special)
            for key in SPECIAL_INCOME_KEYS:
                take = min(remaining, reduced_special[key])
                reduced_special[key] -= take
                remaining -= take
            at_threshold = _tax_before_cess(reduced_normal, reduced_special, regime, rules, age_band, resident)
            ceiling = at_threshold["tax_after_rebate"] + at_threshold["surcharge"] + excess
            if tax_after_rebate + surcharge > ceiling:
                surcharge_marginal_relief = tax_after_rebate + surcharge - ceiling
                surcharge = max(surcharge - surcharge_marginal_relief, 0.0)

    return {
        "total_income": total_income,
        "slab_tax": slab,
        "tax_111a": tax_111a,
        "ltcg_112a_taxable": ltcg_112a_taxable,
        "tax_112a": tax_112a,
        "tax_112": tax_112,
        "special_tax": special_tax,
        "basic_exemption_adjustment": adjustment,
        "tax_before_rebate": slab + special_tax,
        "rebate": rebate,
        "rebate_marginal_relief": rebate_marginal_relief,
        "tax_after_rebate": tax_after_rebate,
        "surcharge_rate": rate,
        "surcharge_threshold": threshold,
        "surcharge_before_relief": surcharge_before_relief,
        "surcharge_marginal_relief": surcharge_marginal_relief,
        "surcharge": surcharge,
    }


def _total_with_cess(normal_income: float, special: Dict[str, float], regime: str,
                     rules: dict, age_band: str, resident: bool) -> float:
    core = _tax_before_cess(normal_income, special, regime, rules, age_band, resident)
    base = core["tax_after_rebate"] + core["surcharge"]
    return base * (1 + rules["cess"]["value"]["rate_pct"] / 100.0)


# ---------------------------------------------------------------------------
# One regime, steps 1-14
# ---------------------------------------------------------------------------

def compute_regime(regime: str, inp: dict, rules: dict) -> dict:
    reg = rules["regimes"][regime]
    rp = f"regimes.{regime}"
    audit = _Audit(regime, rules)
    warnings: List[dict] = []

    def warn(code: str, message: str, severity: str = "warning"):
        warnings.append({"code": code, "severity": severity, "regime": regime, "message": message})

    profile = inp["profile"]
    resident = profile["residential_status"] in ("resident", "rnor")
    band = _age_band(profile["age"], resident, rules)
    senior = band != "below_60"
    salary = inp["salary"]
    emp = inp["employer_contributions"]
    payroll = inp["payroll_deductions"]
    ded_in = inp["deductions"]
    basic_da = salary["basic"] + salary["da"]

    # --- Step 1: gross salary -------------------------------------------------
    cash_salary = sum(salary.values())
    audit.add(1, "cash_salary", "Cash salary components", cash_salary,
              " + ".join(f"{k}" for k in salary) or "0", "input",
              inputs={k: v for k, v in salary.items() if v})
    audit.add(1, "employer_nps_in_salary", "Employer NPS contribution (included in salary)", emp["nps"],
              "employer_contributions.nps", "input")

    agg_cap = rules["employer_retirement_aggregate_cap"]["value"]
    nps_pct = reg["employer_nps"]["value"]["pct_of_basic_da"][profile["employer_type"]]
    nps_limit = basic_da * nps_pct / 100.0
    room_under_cap = max(agg_cap - emp["pf"] - emp["superannuation"], 0.0)
    perquisite_non_nps = max(emp["pf"] + emp["superannuation"] - agg_cap, 0.0)
    if perquisite_non_nps:
        audit.add(1, "retirement_perquisite", "Employer PF/superannuation above aggregate cap (taxable perquisite)",
                  perquisite_non_nps, "pf + superannuation - aggregate cap", "rule",
                  rule_ref="employer_retirement_aggregate_cap")
    gross_salary = cash_salary + emp["nps"] + perquisite_non_nps
    audit.add(1, "gross_salary", "Gross salary", gross_salary,
              "cash salary + employer NPS + retirement perquisite", "derived")

    # --- Step 2: exemptions ---------------------------------------------------
    exemptions = 0.0
    hra_detail = None
    hra_rules = reg["hra"]["value"]
    if hra_rules["allowed"]:
        metro = profile["metro"] if profile["metro"] is not None else is_metro_city(profile["city"], hra_rules)
        if monthly_enabled(inp):
            # Month by month: rent and salary can change during the year, so the least-of-
            # three test is applied to each month separately and summed.
            hra_detail = calculate_hra_exemption_monthly(inp["monthly"]["months"], metro, hra_rules)
        else:
            hra_detail = calculate_hra_exemption(
                salary["hra"], basic_da, inp["hra"]["rent_paid_monthly"], inp["hra"]["months_rented"], metro, hra_rules)
        if salary["hra"] or inp["hra"]["rent_paid_monthly"]:
            c = hra_detail["components"]
            formula = ("sum over {} rented month(s) of the least of: HRA received; rent - {}% of salary; "
                       "metro/non-metro % of salary (each month's own figures)".format(
                           hra_detail["months_rented"], hra_rules["rent_excess_over_salary_pct"])
                       if hra_detail.get("computed_monthly") else
                       "least of: HRA received {:,.0f}; rent - {}% of salary {:,.0f}; {}% of salary {:,.0f}".format(
                           c["actual_hra_received"], hra_rules["rent_excess_over_salary_pct"],
                           c["rent_paid_minus_pct_of_salary"], hra_detail["metro_or_non_metro_pct"],
                           c["pct_of_salary"]))
            audit.add(2, "hra_exemption", "HRA exemption", hra_detail["exemption"], formula,
                      "rule", rule_ref=f"{rp}.hra", inputs={"metro": metro, "months_rented": hra_detail["months_rented"]})
        exemptions += hra_detail["exemption"]
    elif salary["hra"]:
        audit.add(2, "hra_exemption", "HRA exemption (not available in this regime)", 0.0,
                  "HRA fully taxable", "rule", rule_ref=f"{rp}.hra")

    allowance_rules = reg["allowance_exemptions"]["value"]
    ea = inp["exempt_allowances"]
    if allowance_rules["allowed"]:
        for kind, received_key, children_key in (
                ("children_education", "children_education_received", "children_education_children"),
                ("hostel", "hostel_received", "hostel_children")):
            limits = allowance_rules[kind]
            if ea[received_key]:
                children = min(ea[children_key], limits["max_children"])
                cap = limits["per_child_per_month"] * MONTHS_PER_YEAR * children
                exempt = min(ea[received_key], cap)
                audit.add(2, f"{kind}_allowance_exemption", f"{kind.replace('_', ' ').title()} allowance exemption",
                          exempt, f"min(received, {limits['per_child_per_month']}/month x 12 x {children} child(ren))",
                          "rule", rule_ref=f"{rp}.allowance_exemptions")
                exemptions += exempt
    other_exempt = ea["other_old"] if regime == "old" else ea["other_new"]
    if other_exempt:
        audit.add(2, "other_exempt_allowances", "Other exempt allowances (user-asserted)", other_exempt,
                  f"exempt_allowances.other_{regime}", "user_asserted")
        warn("user_asserted_exemption",
             f"Other exempt allowances of {other_exempt:,.0f} were taken as entered; the engine cannot check their eligibility.")
        exemptions += other_exempt
    exemptions = min(exemptions, gross_salary)
    audit.add(2, "salary_exemptions", "Total salary exemptions", exemptions, "sum of exemptions", "derived")

    # --- Step 3: taxable salary ----------------------------------------------
    after_exemptions = gross_salary - exemptions
    standard_deduction = min(reg["standard_deduction"]["value"], after_exemptions)
    audit.add(3, "standard_deduction", "Standard deduction", standard_deduction,
              "min(standard deduction, salary after exemptions)", "rule", rule_ref=f"{rp}.standard_deduction")
    pt_rules = reg["professional_tax"]["value"]
    professional_tax = min(payroll["professional_tax"], pt_rules["max"]) if pt_rules["allowed"] else 0.0
    if payroll["professional_tax"]:
        audit.add(3, "professional_tax", "Professional tax deduction", professional_tax,
                  "min(professional tax paid, cap)" if pt_rules["allowed"] else "not deductible in this regime",
                  "rule", rule_ref=f"{rp}.professional_tax")
    taxable_salary = max(after_exemptions - standard_deduction - professional_tax, 0.0)
    audit.add(3, "taxable_salary", "Taxable salary", taxable_salary,
              "gross salary - exemptions - standard deduction - professional tax", "derived")

    # --- Step 4: other income -------------------------------------------------
    oi = inp["other_income"]
    hp_pct = rules["house_property"]["value"]["standard_deduction_pct"]
    net_annual_value = max(oi["rental_gross"] - oi["rental_municipal_tax"], 0.0)
    let_out_income = net_annual_value * (1 - hp_pct / 100.0)
    if oi["rental_gross"]:
        audit.add(4, "house_property_let_out", "Income from let-out house property", let_out_income,
                  f"(rent - municipal tax) x (1 - {hp_pct}%)", "rule", rule_ref="house_property")
    hp_cap = reg["house_property_loss_setoff_cap"]["value"]
    home_interest = ded_in["home_loan_interest_self_occupied"]
    allowed_interest = min(home_interest, hp_cap)
    if home_interest:
        audit.add(4, "home_loan_interest", "Self-occupied home loan interest", -allowed_interest,
                  "min(interest paid, cap)" if hp_cap else "not deductible in this regime",
                  "rule", rule_ref=f"{rp}.house_property_loss_setoff_cap")
        if not hp_cap:
            warn("home_loan_interest_not_allowed",
                 "Self-occupied home loan interest is not deductible under the new regime.", "info")
    house_property = max(let_out_income - allowed_interest, -hp_cap)
    other_normal = (oi["interest_savings"] + oi["interest_deposits"] + oi["dividends"] + oi["other"]
                    + inp["capital_gains"]["stcg_slab"])
    if other_normal:
        audit.add(4, "other_income", "Other income at slab rates", other_normal,
                  "interest + dividends + other + slab-rate STCG", "input")
    special = {k: inp["capital_gains"][k] for k in SPECIAL_INCOME_KEYS}
    special_total = sum(special.values())
    if special_total:
        audit.add(4, "special_rate_income", "Capital gains at special rates", special_total,
                  "STCG 111A + LTCG 112A + LTCG 112", "input", inputs=special)

    # --- Step 5: gross total income ------------------------------------------
    normal_gti = max(taxable_salary + house_property + other_normal, 0.0)
    gross_total_income = normal_gti + special_total
    audit.add(5, "gross_total_income", "Gross total income", gross_total_income,
              "taxable salary + house property + other income + special-rate income", "derived")

    # --- Step 6: deductions ---------------------------------------------------
    allowed = set(reg["deductions"]["value"]["allowed"])
    limits = reg["deductions"]["value"]
    deductions: Dict[str, float] = {}

    if "employer_nps" in allowed and emp["nps"]:
        deductible = min(emp["nps"], nps_limit, room_under_cap)
        deductions["employer_nps"] = audit.add(
            6, "deduction_employer_nps", "Employer NPS contribution", deductible,
            f"min(contribution, {nps_pct}% of basic+DA = {nps_limit:,.0f}, aggregate-cap room {room_under_cap:,.0f})",
            "rule", rule_ref=f"{rp}.employer_nps")
        if emp["nps"] > nps_limit:
            warn("employer_nps_above_limit",
                 f"Employer NPS of {emp['nps']:,.0f} exceeds the {nps_pct}% of basic+DA limit ({nps_limit:,.0f}); "
                 f"the excess stays taxable.")
        if emp["nps"] > room_under_cap and emp["nps"] <= nps_limit:
            warn("retirement_aggregate_cap",
                 f"Employer PF + NPS + superannuation exceeds the {agg_cap:,.0f} aggregate cap; "
                 f"NPS above the remaining room is taxable.")
        if reg["employer_nps"]["verification"] == "unverified":
            warn("unverified_rule",
                 f"The {regime}-regime employer NPS limit ({nps_pct}%) is unverified for this financial year.")
    if perquisite_non_nps:
        warn("retirement_aggregate_cap",
             f"Employer PF + superannuation exceed the {agg_cap:,.0f} aggregate cap; "
             f"{perquisite_non_nps:,.0f} is taxed as a perquisite.")

    if "80CCD1B" in allowed and ded_in["employee_nps"]:
        to_1b = min(ded_in["employee_nps"], limits["80CCD1B"]["cap"])
        deductions["80CCD1B"] = audit.add(
            6, "deduction_80ccd1b", "Employee NPS (additional deduction)", to_1b,
            f"min(employee NPS, {limits['80CCD1B']['cap']:,.0f})", "rule", rule_ref=f"{rp}.deductions")
    else:
        to_1b = 0.0

    if "80C" in allowed:
        items = dict(inp["deductions"]["80C"])
        items["employee_epf (payroll)"] = payroll["employee_epf"]
        items["vpf (payroll)"] = payroll["vpf"]
        nps_in_80c = 0.0
        if "80CCD1" in allowed and ded_in["employee_nps"] > to_1b:
            nps_in_80c = min(ded_in["employee_nps"] - to_1b, basic_da * limits["80CCD1"]["pct_of_basic_da"] / 100.0)
            items["employee_nps (80CCD(1))"] = nps_in_80c
        pool = sum(items.values())
        if pool:
            capped = min(pool, limits["80C"]["cap"])
            deductions["80C"] = audit.add(
                6, "deduction_80c", "80C / 80CCC / 80CCD(1) pool", capped,
                f"min(sum of eligible investments {pool:,.0f}, {limits['80C']['cap']:,.0f})", "rule",
                rule_ref=f"{rp}.deductions", inputs={k: v for k, v in items.items() if v})
            if pool > limits["80C"]["cap"]:
                warn("deduction_capped", f"80C investments of {pool:,.0f} exceed the {limits['80C']['cap']:,.0f} cap.", "info")

    if "80D" in allowed and (ded_in["80D_self_family"] or ded_in["80D_parents"]):
        d = limits["80D"]
        self_cap = d["self_family_senior"] if senior else d["self_family"]
        parents_cap = d["parents_senior"] if ded_in["parents_senior"] else d["parents"]
        amount = min(ded_in["80D_self_family"], self_cap) + min(ded_in["80D_parents"], parents_cap)
        deductions["80D"] = audit.add(
            6, "deduction_80d", "Health insurance (80D)", amount,
            f"min(self/family, {self_cap:,.0f}) + min(parents, {parents_cap:,.0f})", "rule", rule_ref=f"{rp}.deductions")

    if "80E" in allowed and ded_in["80E"]:
        deductions["80E"] = audit.add(6, "deduction_80e", "Education loan interest (80E)", ded_in["80E"],
                                      "interest paid (no cap)", "input")
    if "80G" in allowed and ded_in["80G_eligible"]:
        deductions["80G"] = audit.add(6, "deduction_80g", "Donations (80G, eligible amount)", ded_in["80G_eligible"],
                                      "as entered", "user_asserted")
        warn("user_asserted_deduction",
             "80G was taken as the eligible amount entered; qualifying limits and 50%/100% categories are not computed.", "info")

    interest_total = oi["interest_savings"] + oi["interest_deposits"]
    if "80TTB" in allowed and resident and senior and interest_total:
        deductions["80TTB"] = audit.add(
            6, "deduction_80ttb", "Interest on deposits, senior citizen (80TTB)",
            min(interest_total, limits["80TTB"]["cap"]),
            f"min(savings + deposit interest, {limits['80TTB']['cap']:,.0f})", "rule", rule_ref=f"{rp}.deductions")
    elif "80TTA" in allowed and oi["interest_savings"]:
        deductions["80TTA"] = audit.add(
            6, "deduction_80tta", "Savings account interest (80TTA)",
            min(oi["interest_savings"], limits["80TTA"]["cap"]),
            f"min(savings interest, {limits['80TTA']['cap']:,.0f})", "rule", rule_ref=f"{rp}.deductions")

    other_key = "other_old" if regime == "old" else "other_new"
    if other_key in allowed and ded_in[other_key]:
        deductions[other_key] = audit.add(6, f"deduction_{other_key}", "Other deductions (user-asserted)",
                                          ded_in[other_key], f"deductions.{other_key}", "user_asserted")
        warn("user_asserted_deduction",
             f"Other deductions of {ded_in[other_key]:,.0f} were taken as entered; the engine cannot check eligibility.")

    if regime == "new":
        ignored = [k for k in ("employee_nps", "80D_self_family", "80D_parents", "80E", "80G_eligible", "other_old")
                   if ded_in[k]] + (["80C"] if any(inp["deductions"]["80C"].values()) else [])
        if ignored:
            warn("old_regime_only_deductions",
                 "Not applied under the new regime (old-regime only): " + ", ".join(ignored) + ".", "info")

    deductions_claimed = sum(deductions.values())
    deductions_total = min(deductions_claimed, normal_gti)
    audit.add(6, "deductions_total", "Total deductions", deductions_total,
              "sum of deductions, limited to income other than special-rate gains", "derived")

    # --- Step 7: total income -------------------------------------------------
    rounding = rules["rounding"]["value"]
    total_income_exact = normal_gti - deductions_total + special_total
    total_income = round_to_nearest(total_income_exact, rounding["total_income_nearest"])
    audit.add(7, "total_income", "Total taxable income (rounded)", total_income,
              f"GTI - deductions, rounded to nearest {rounding['total_income_nearest']}", "rule", rule_ref="rounding")
    normal_income = max(total_income - special_total, 0.0)

    # --- Steps 8-10: tax, rebate, surcharge -----------------------------------
    core = _tax_before_cess(normal_income, special, regime, rules, band, resident)
    audit.add(8, "slab_tax", "Tax at slab rates", core["slab_tax"],
              f"slabs ({'all ages' if regime == 'new' else band.replace('_', ' ')}) on {normal_income:,.0f}",
              "rule", rule_ref=f"{rp}.slabs")
    if core["special_tax"]:
        audit.add(8, "special_rate_tax", "Tax on special-rate capital gains", core["special_tax"],
                  "111A + 112A (above exemption) + 112 at their rates", "rule", rule_ref="special_rates",
                  inputs={"basic_exemption_adjustment": core["basic_exemption_adjustment"]})
    audit.add(8, "tax_before_rebate", "Tax before rebate", core["tax_before_rebate"], "slab tax + special-rate tax", "derived")
    audit.add(9, "rebate", "Rebate" + (" (with marginal relief)" if core["rebate_marginal_relief"] else ""),
              core["rebate"],
              "tax limited to income above the rebate limit" if core["rebate_marginal_relief"]
              else "min(tax, max rebate) if total income within limit and resident",
              "rule", rule_ref=f"{rp}.rebate")
    if not resident:
        warn("rebate_not_available", "Rebate is available to residents only.", "info")
    audit.add(10, "surcharge", "Surcharge", core["surcharge"],
              f"{core['surcharge_rate']}% above {core['surcharge_threshold']:,.0f}"
              + (f", less marginal relief {core['surcharge_marginal_relief']:,.0f}" if core["surcharge_marginal_relief"] else "")
              if core["surcharge_rate"] else "income below the first surcharge threshold",
              "rule", rule_ref=f"{rp}.surcharge")
    if core["surcharge_rate"] and oi["dividends"]:
        warn("dividend_surcharge_cap_not_modelled",
             "Dividends are surcharged at the full rate here; the legal cap on surcharge for dividend income is not "
             "modelled, so surcharge may be slightly overstated.", "info")

    # --- Steps 11-12: cess, total ---------------------------------------------
    cess_pct = rules["cess"]["value"]["rate_pct"]
    cess = (core["tax_after_rebate"] + core["surcharge"]) * cess_pct / 100.0
    audit.add(11, "cess", "Health and education cess", cess, f"{cess_pct}% of (tax after rebate + surcharge)",
              "rule", rule_ref="cess")
    total_tax_exact = core["tax_after_rebate"] + core["surcharge"] + cess
    total_tax = round_to_nearest(total_tax_exact, rounding["tax_nearest"])
    audit.add(12, "total_tax", "Total tax liability (rounded)", total_tax,
              f"tax after rebate + surcharge + cess, rounded to nearest {rounding['tax_nearest']}", "rule",
              rule_ref="rounding")

    # --- Steps 13-14: prepaid, balance ----------------------------------------
    prepaid = inp["prepaid"]["tds"] + inp["prepaid"]["advance_tax"]
    audit.add(13, "prepaid_taxes", "TDS + advance tax paid", prepaid, "prepaid.tds + prepaid.advance_tax", "input")
    balance = total_tax - prepaid
    audit.add(14, "balance", "Tax payable" if balance >= 0 else "Refund due", balance,
              "total tax - prepaid taxes", "derived")

    # --- Rates and in-hand ----------------------------------------------------
    effective_rate = total_tax / gross_total_income * 100.0 if gross_total_income else 0.0
    step = 100.0
    marginal_rate = (
        _total_with_cess(normal_income + step, special, regime, rules, band, resident)
        - _total_with_cess(normal_income, special, regime, rules, band, resident)
    ) / step * 100.0
    payroll_total = sum(payroll.values())
    in_hand_annual = cash_salary - payroll_total - total_tax

    return {
        "regime": regime,
        "label": reg["label"],
        "age_band": band,
        "gross_salary": round(gross_salary, 2),
        "cash_salary": round(cash_salary, 2),
        "salary_exemptions": round(exemptions, 2),
        "hra": hra_detail,
        "standard_deduction": round(standard_deduction, 2),
        "professional_tax_deduction": round(professional_tax, 2),
        "taxable_salary": round(taxable_salary, 2),
        "house_property_income": round(house_property, 2),
        "other_income": round(other_normal, 2),
        "special_rate_income": round(special_total, 2),
        "gross_total_income": round(gross_total_income, 2),
        "deductions": {k: round(v, 2) for k, v in deductions.items()},
        "deductions_total": round(deductions_total, 2),
        "total_income": total_income,
        "slab_tax": round(core["slab_tax"], 2),
        "special_rate_tax": round(core["special_tax"], 2),
        "tax_before_rebate": round(core["tax_before_rebate"], 2),
        "rebate": round(core["rebate"], 2),
        "tax_after_rebate": round(core["tax_after_rebate"], 2),
        "surcharge_rate_pct": core["surcharge_rate"],
        "surcharge_before_marginal_relief": round(core["surcharge_before_relief"], 2),
        "surcharge_marginal_relief": round(core["surcharge_marginal_relief"], 2),
        "surcharge": round(core["surcharge"], 2),
        "cess": round(cess, 2),
        "total_tax_unrounded": round(total_tax_exact, 2),
        "total_tax": total_tax,
        "prepaid_taxes": round(prepaid, 2),
        "balance_payable": round(balance, 2),
        "effective_rate_pct": round(effective_rate, 2),
        "marginal_rate_pct": round(marginal_rate, 2),
        "monthly_average": {
            "tax": round(total_tax / MONTHS_PER_YEAR, 2),
            "in_hand_salary": round(in_hand_annual / MONTHS_PER_YEAR, 2),
            "note": "Annual figures divided by 12; actual payroll TDS is usually uneven across months.",
        },
        "in_hand_salary_annual": round(in_hand_annual, 2),
        "monthly": monthly_breakdown(inp, total_tax) if monthly_enabled(inp) else None,
        "payroll_deductions_total": round(payroll_total, 2),
        "audit": audit.lines,
        "warnings": warnings,
    }


def monthly_breakdown(inp: dict, total_tax: float) -> dict:
    """
    Per-month cash view plus a TDS projection, the way an employer spreads TDS: whatever
    annual tax is still due after TDS already deducted (actual months) and advance tax is
    divided equally across the remaining (projected) months.
    """
    months = inp["monthly"]["months"]
    actual_tds = sum(m["tds"] or 0.0 for m in months if m["status"] == "actual")
    projected = [m for m in months if m["status"] == "projected"]
    still_due = max(total_tax - actual_tds - inp["prepaid"]["advance_tax"], 0.0)
    per_projected_month = still_due / len(projected) if projected else 0.0
    rows = []
    for m in months:
        gross = sum(m["salary"].values())
        deductions = sum(m["payroll_deductions"].values())
        if m["status"] == "actual":
            tds, basis = (m["tds"], "actual") if m["tds"] is not None else (0.0, "missing")
        else:
            tds, basis = per_projected_month, "projected"
        rows.append({
            "label": m["label"],
            "status": m["status"],
            "gross_cash": round(gross, 2),
            "payroll_deductions": round(deductions, 2),
            "tds": round(tds, 2),
            "tds_basis": basis,
            "in_hand": round(gross - deductions - tds, 2),
            "employer_nps": round(m["employer_contributions"]["nps"], 2),
        })
    over_deducted = max(actual_tds + inp["prepaid"]["advance_tax"] - total_tax, 0.0)
    return {
        "months": rows,
        "actual_months": len(months) - len(projected),
        "projected_months": len(projected),
        "tds_paid_to_date": round(actual_tds, 2),
        "tax_still_due": round(still_due, 2),
        "suggested_tds_per_remaining_month": round(per_projected_month, 2),
        "expected_refund": round(over_deducted, 2),
        "missing_tds_months": [m["label"] for m in months if m["status"] == "actual" and m["tds"] is None],
        "method": "Tax still due after TDS already deducted and advance tax, spread equally over the remaining months.",
    }


# ---------------------------------------------------------------------------
# Both regimes + comparison
# ---------------------------------------------------------------------------

def compute(raw_inputs: Optional[dict], rules: dict, computed_at: Optional[str] = None) -> dict:
    from backend.tax.validation import input_warnings

    inp = normalize_inputs(raw_inputs)
    old = compute_regime("old", inp, rules)
    new = compute_regime("new", inp, rules)

    savings = old["total_tax"] - new["total_tax"]
    best = "new" if savings >= 0 else "old"
    if savings > 0:
        explanation = "The new regime's lower slab rates outweigh the old regime's exemptions and deductions."
    elif savings < 0:
        explanation = ("The old regime's exemptions and deductions reduce taxable income by enough to outweigh "
                       "the new regime's lower slab rates.")
    else:
        explanation = "Both regimes produce the same tax; the new regime is the default."

    warnings = old["warnings"] + new["warnings"] + input_warnings(inp, rules, {"old": old, "new": new})

    return {
        "rule_set": {
            "rule_set_id": rules["rule_set_id"],
            "version": rules["version"],
            "financial_year": rules["financial_year"],
            "assessment_year": rules["assessment_year"],
            "act": rules["act"],
        },
        "computed_at": computed_at,
        "regimes": {"old": old, "new": new},
        "comparison": {
            "best_regime": best,
            "savings_old_minus_new": round(savings, 2),
            "savings_pct_of_old": round(savings / old["total_tax"] * 100.0, 2) if old["total_tax"] else None,
            "monthly_savings_old_minus_new": round(savings / MONTHS_PER_YEAR, 2),
            "explanation": explanation,
        },
        "warnings": warnings,
        "inputs": inp,
    }
