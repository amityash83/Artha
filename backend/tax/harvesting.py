"""
Capital-gains harvesting suggestions for one person and financial year, from their
Stock / Mutual Fund purchase lots (holding_lots) at today's value (assets.current_value).

Gain harvesting: long-term gains on listed equity are tax-free each year up to the rule
set's exemption (s.112A; 2025 Act equivalent). Selling long-term units and buying them
back uses that allowance and raises the cost basis, so the same gain isn't taxed later.
Units leave a holding oldest first (FIFO), so a suggestion takes long-term lots in date
order and stops before the first short-term lot (selling into it would create a taxable
short-term gain) or when the remaining exemption is used.

Loss harvesting: selling a holding that is below its cost realises a loss that offsets
this year's taxable gains (short-term losses against short- or long-term gains,
long-term losses against long-term gains only), or carries forward if the return is
filed on time.

Rates and the exemption come from the rule set's special_rates item; the holding-period
test is the same one used when sales are recorded (calculations.determine_gain_type).
Suggestions only: nothing is sold or recorded here.
"""
import math
import sqlite3
from datetime import date
from typing import Dict, List, Optional

from backend.calculations import determine_gain_type
from backend.tax.prefill import fy_bounds
from backend.risk import EQUITY_ORIENTED_FUND_TYPES, fund_type, metadata

EQUITY = ("Stock", "Mutual Fund")
FUND_UNIT_DECIMALS = 3


def _lots(conn, asset_id: int) -> List[dict]:
    rows = conn.execute("SELECT purchase_date, quantity, price_per_unit FROM holding_lots WHERE asset_id = ? ORDER BY purchase_date, id",
                        (asset_id,)).fetchall()
    return [dict(r) for r in rows if float(r["quantity"] or 0) > 0]


def _realised(conn, person_id: int, financial_year: str) -> Dict[str, float]:
    out = {"equity_ltcg": 0.0, "equity_stcg": 0.0, "other_ltcg": 0.0, "other_stcg": 0.0}
    for r in conn.execute("""SELECT cgr.asset_category, cgr.gain_type, cgr.gain_amount AS g, a.metadata_json
                             FROM capital_gains_realizations cgr LEFT JOIN assets a ON a.id = cgr.asset_id
                             WHERE cgr.owner_id = ? AND cgr.financial_year = ?""", (person_id, financial_year)):
        # A debt or liquid fund's gains aren't equity gains, so they don't use the allowance.
        kind = fund_type(metadata(r["metadata_json"])) if r["asset_category"] == "Mutual Fund" else None
        equity = r["asset_category"] in EQUITY and not (kind and kind not in EQUITY_ORIENTED_FUND_TYPES)
        key = f"{'equity' if equity else 'other'}_{r['gain_type'].lower()}"
        out[key] += float(r["g"] or 0.0)
    return out


def _round_units(units: float, category: str) -> float:
    # Shares trade in whole units; fund units to 3 decimals (as statements show them).
    return float(math.floor(units)) if category == "Stock" else math.floor(units * 10 ** FUND_UNIT_DECIMALS) / 10 ** FUND_UNIT_DECIMALS


def _gain_plan(holding: dict, budget: float, sale_day: str) -> Optional[dict]:
    """FIFO units of long-term lots whose combined gain fits the budget."""
    units = gain = cost = 0.0
    for lot in holding["lots"]:
        if determine_gain_type(lot["purchase_date"], sale_day, holding["category"]) != "LTCG":
            break  # the next unit sold would be short-term
        per_unit = holding["price"] - float(lot["price_per_unit"])
        qty = float(lot["quantity"])
        if per_unit > 0 and gain + per_unit * qty > budget:
            take = _round_units((budget - gain) / per_unit, holding["category"])
            units, gain, cost = units + take, gain + per_unit * take, cost + float(lot["price_per_unit"]) * take
            break
        units, gain, cost = units + qty, gain + per_unit * qty, cost + float(lot["price_per_unit"]) * qty
    if units <= 0 or gain <= 0:
        return None
    return {"units": round(units, 3), "sale_value": round(units * holding["price"], 2), "cost": round(cost, 2), "gain": round(gain, 2)}


def _loss_plan(holding: dict, sale_day: str) -> Optional[dict]:
    """The FIFO prefix of lots whose sale realises the largest net loss."""
    best = None
    units = net = 0.0
    split = {"STCG": 0.0, "LTCG": 0.0}
    for lot in holding["lots"]:
        qty = float(lot["quantity"])
        per_unit = holding["price"] - float(lot["price_per_unit"])
        kind = determine_gain_type(lot["purchase_date"], sale_day, holding["category"])
        units, net = units + qty, net + per_unit * qty
        split[kind] += per_unit * qty
        if net < 0 and (best is None or net < best["net"]):
            best = {"units": units, "net": net, "short_term": min(split["STCG"], 0.0), "long_term": min(split["LTCG"], 0.0)}
    if not best:
        return None
    return {"units": round(best["units"], 3), "sale_value": round(best["units"] * holding["price"], 2), "loss": round(-best["net"], 2),
            "short_term_loss": round(-best["short_term"], 2), "long_term_loss": round(-best["long_term"], 2)}


def harvest_plan(conn: sqlite3.Connection, person_id: int, financial_year: str, rules: dict, today: Optional[date] = None) -> dict:
    today = today or date.today()
    start, end = fy_bounds(financial_year)
    year_end = date.fromordinal(end.toordinal() - 1)
    sale_day = min(max(today, start), year_end).isoformat()
    rates = rules["special_rates"]["value"]
    exemption = float(rates["ltcg_112a_exemption"])
    realised = _realised(conn, person_id, financial_year)
    used = min(max(realised["equity_ltcg"], 0.0), exemption)
    budget = exemption - used

    holdings, not_equity = [], []
    for a in conn.execute("""SELECT a.id, a.name, a.current_value, a.metadata_json, c.name AS category FROM assets a JOIN categories c ON c.id = a.category_id
                             WHERE a.owner_id = ? AND c.name IN ('Stock', 'Mutual Fund') ORDER BY a.name""", (person_id,)):
        # Debt, liquid and other (gold, international) funds aren't equity-oriented: their
        # gains are taxed differently and get no yearly exemption, so they're left out.
        kind = fund_type(metadata(a["metadata_json"])) if a["category"] == "Mutual Fund" else None
        if kind and kind not in EQUITY_ORIENTED_FUND_TYPES:
            not_equity.append(f"{a['name']} ({kind.lower()})")
            continue
        lots = _lots(conn, a["id"])
        qty = sum(float(l["quantity"]) for l in lots)
        if qty <= 0 or float(a["current_value"] or 0) <= 0:
            continue
        holdings.append({"id": a["id"], "name": a["name"], "category": a["category"], "lots": lots, "units_held": qty,
                         "price": float(a["current_value"]) / qty, "metadata_json": a["metadata_json"]})

    # Gain harvesting: biggest available long-term gain first, so the allowance is used
    # with as few sales as possible.
    candidates = [(h, _gain_plan(h, float("inf"), sale_day)) for h in holdings]
    candidates.sort(key=lambda hc: -(hc[1]["gain"] if hc[1] else 0))
    gain_suggestions, left = [], budget
    for h, full in candidates:
        if left <= 0 or not full:
            continue
        plan = _gain_plan(h, left, sale_day)
        if not plan:
            continue
        left -= plan["gain"]
        gain_suggestions.append({"asset_id": h["id"], "asset": h["name"], "category": h["category"], "units_held": round(h["units_held"], 3),
                                 "price": round(h["price"], 2), **plan, "future_tax_avoided": round(plan["gain"] * rates["ltcg_112a_pct"] / 100.0, 2)})
    harvested = sum(s["gain"] for s in gain_suggestions)

    # Loss harvesting, valued against this year's gains still taxable after the exemption.
    taxable_stcg = max(realised["equity_stcg"], 0.0)
    taxable_ltcg = max(realised["equity_ltcg"] - exemption, 0.0)
    loss_suggestions = []
    for h in holdings:
        plan = _loss_plan(h, sale_day)
        if not plan:
            continue
        st_vs_st = min(plan["short_term_loss"], taxable_stcg)
        st_left = plan["short_term_loss"] - st_vs_st
        lt_offset = min(plan["long_term_loss"] + st_left, taxable_ltcg)
        value = st_vs_st * rates["stcg_111a_pct"] / 100.0 + lt_offset * rates["ltcg_112a_pct"] / 100.0
        taxable_stcg -= st_vs_st
        taxable_ltcg -= lt_offset
        loss_suggestions.append({"asset_id": h["id"], "asset": h["name"], "category": h["category"], "price": round(h["price"], 2),
                                 **plan, "tax_saved_this_year": round(value, 2),
                                 "carried_forward": round(plan["loss"] - st_vs_st - lt_offset, 2)})
    loss_suggestions.sort(key=lambda s: -s["loss"])

    notes = [
        "Units are sold oldest first (FIFO), so suggestions stop before any short-term lot.",
        "Buying back the same units right after selling keeps your investment unchanged while resetting its cost. "
        "Count brokerage, STT, stamp duty and any exit load before acting.",
        "Losses not used this year carry forward for 8 years if you file your return on time.",
        "Record each sale as a Sell transaction so Artha logs the realised gain.",
    ]
    if not_equity:
        notes.append(f"Left out as not equity-oriented, by their fund type: {', '.join(not_equity)}. Their gains are taxed differently "
                     "and don't get this exemption.")
    if any(h["category"] == "Mutual Fund" and not fund_type(metadata(h.get("metadata_json"))) for h in holdings):
        notes.append("Mutual funds without a fund type are treated as equity-oriented. Set the fund type on each fund under Assets "
                     "so debt funds and liquid funds are left out.")
    return {
        "financial_year": financial_year,
        "deadline": year_end.isoformat(),
        "days_left": max((year_end - today).days, 0) if today <= year_end else 0,
        "year_over": today > year_end,
        "exemption": exemption,
        "realised": {k: round(v, 2) for k, v in realised.items()},
        "exemption_used": round(used, 2),
        "exemption_left": round(budget, 2),
        "gain_harvest": gain_suggestions,
        "gain_harvest_total": round(harvested, 2),
        "exemption_left_after": round(max(budget - harvested, 0.0), 2),
        "future_tax_avoided": round(harvested * rates["ltcg_112a_pct"] / 100.0, 2),
        "loss_harvest": loss_suggestions,
        "holdings_considered": len(holdings),
        "rates": {"stcg_pct": rates["stcg_111a_pct"], "ltcg_pct": rates["ltcg_112a_pct"]},
        "rule": {"verification": rules["special_rates"].get("verification"), "legacy_section": rules["special_rates"].get("legacy_section")},
        "notes": notes,
    }
