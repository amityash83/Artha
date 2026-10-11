"""
Employee EPF suggestion, month by month, from EPF wages (basic + DA).

    ceiling basis: rate% x min(wages, wage ceiling in force)   (the statutory contribution)
    full basis:    rate% x wages                                (many employers contribute on full basic)

The wage ceiling is dated (backend/tax/metadata/epf_rules.json). When it changes part-way
through a month, that month is split by calendar days: each part is rate% x min(wages,
that part's ceiling) x days / days in month. The result is only a suggestion for the
Employee EPF input; the tax engine never derives EPF on its own.
"""
import calendar
from decimal import ROUND_HALF_UP, Decimal
from datetime import date
from typing import List

from backend.tax.engine import MONTHS_PER_YEAR, TaxInputError
from backend.tax.rules_loader import load_epf_rules

BASES = ("ceiling", "full")
# Indian financial year order: April of the start year to March of the next.
FY_FIRST_MONTH = 4


def rupees(amount: float) -> int:
    """To the nearest rupee, halves up, as EPFO rounds contributions (Python's round()
    sends halves to the even rupee: 2,082.50 would become 2,082, not 2,083)."""
    return int(Decimal(str(amount)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def fy_months(financial_year: str) -> List[date]:
    """'2026-27' -> [date(2026, 4, 1), ..., date(2027, 3, 1)]."""
    try:
        start = int(str(financial_year)[:4])
    except ValueError:
        raise TaxInputError(f"financial_year must look like '2026-27', got {financial_year!r}")
    out = []
    for i in range(MONTHS_PER_YEAR):
        month = (FY_FIRST_MONTH - 1 + i) % MONTHS_PER_YEAR + 1
        out.append(date(start + (1 if month < FY_FIRST_MONTH else 0), month, 1))
    return out


def _ceiling_on(day: date, periods: list) -> dict:
    current = None
    for p in periods:  # ascending by "from" (checked by the loader)
        if date.fromisoformat(p["from"]) <= day:
            current = p
    if current is None:
        raise TaxInputError(f"No EPF wage ceiling is defined for {day.isoformat()}")
    return current


def month_segments(month_start: date, periods: list) -> List[dict]:
    """The ceilings in force during a calendar month, with how many days each covers."""
    days = calendar.monthrange(month_start.year, month_start.month)[1]
    segments: List[dict] = []
    for d in range(1, days + 1):
        p = _ceiling_on(month_start.replace(day=d), periods)
        if segments and segments[-1]["period"] is p:
            segments[-1]["days"] += 1
        else:
            segments.append({"period": p, "first_day": d, "days": 1})
    for s in segments:
        s["days_in_month"] = days
    return segments


def suggest_epf(financial_year: str, wages: List[float], basis: str = "ceiling", rules: dict = None) -> dict:
    if basis not in BASES:
        raise TaxInputError(f"basis must be one of {BASES}")
    if not isinstance(wages, list) or len(wages) != MONTHS_PER_YEAR:
        raise TaxInputError("wages must list 12 months (April to March)")
    if any((not isinstance(w, (int, float))) or w < 0 for w in wages):
        raise TaxInputError("wages must be non-negative numbers")
    rules = rules or load_epf_rules()
    rate = rules["employee_rate_pct"]["value"] / 100.0
    periods = rules["wage_ceiling_monthly"]["value"]
    fy = fy_months(financial_year)
    fy_end = fy[-1].replace(day=calendar.monthrange(fy[-1].year, fy[-1].month)[1])
    months = []
    for start, wage in zip(fy, wages):
        label = start.strftime("%b %Y")
        if basis == "full":
            epf = rupees(rate * wage)
            how = f"{rules['employee_rate_pct']['value']}% of {wage:,.0f}"
            ceilings = []
        else:
            segs = month_segments(start, periods)
            epf = rupees(sum(rate * min(wage, s["period"]["amount"]) * s["days"] / s["days_in_month"] for s in segs))
            ceilings = [{"amount": s["period"]["amount"], "days": s["days"], "first_day": s["first_day"],
                         "verification": s["period"]["verification"]} for s in segs]
            if len(segs) == 1:
                capped = min(wage, segs[0]["period"]["amount"])
                how = f"{rules['employee_rate_pct']['value']}% of {capped:,.0f}" + (
                    f" (wages capped at the {segs[0]['period']['amount']:,.0f} ceiling)" if wage > capped else "")
            else:
                parts = [f"days {s['first_day']}-{s['first_day'] + s['days'] - 1} at the {s['period']['amount']:,.0f} ceiling"
                         for s in segs]
                how = (f"{rules['employee_rate_pct']['value']}% of wages, split by days: " + "; ".join(parts)
                       + " (the ceiling changed this month)")
        months.append({"label": label, "wages": round(wage, 2), "epf": float(epf), "ceilings": ceilings, "explanation": how})
    # Ceiling revisions that take effect during this financial year.
    changes = [p for p in periods if fy[0] < date.fromisoformat(p["from"]) <= fy_end]
    return {
        "financial_year": financial_year,
        "basis": basis,
        "rate_pct": rules["employee_rate_pct"]["value"],
        "months": months,
        "annual": float(sum(m["epf"] for m in months)),
        "ceiling_changes": [{"from": p["from"], "amount": p["amount"], "verification": p["verification"], "note": p.get("note")}
                            for p in changes] if basis == "ceiling" else [],
        "notes": rules.get("notes", []),
        "sources": rules.get("sources", []),
    }
