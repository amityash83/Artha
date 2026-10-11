"""How risky a holding is, for goal rules ("only low-risk holdings") and display.

Effective risk, in order: a mutual fund's fund type (a liquid fund is low risk, an
equity fund high); otherwise a risk level the user set to Low or High; otherwise the
usual risk of that kind of asset. "Medium" is the column's default, so on its own it
says nothing and the kind of asset decides.
"""
import json
from typing import Optional

FUND_TYPES = ("Equity", "Hybrid", "Debt", "Liquid", "Other")
FUND_TYPE_RISK = {"Equity": "High", "Hybrid": "Medium", "Debt": "Low", "Liquid": "Low", "Other": "Medium"}
# Fund types taxed as equity-oriented funds (111A/112A, the yearly LTCG exemption).
# Hybrid funds qualify only when at least 65% is in Indian equity (aggressive hybrid),
# which is the common case; others are taxed like debt.
EQUITY_ORIENTED_FUND_TYPES = ("Equity", "Hybrid")
CATEGORY_RISK = {
    "Fixed Deposit": "Low", "PPF": "Low", "EPF": "Low", "Bond": "Low", "Insurance": "Low",
    "Stock": "High",
}


def metadata(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    try:
        meta = json.loads(raw or "{}")
    except (TypeError, ValueError):
        return {}
    return meta if isinstance(meta, dict) else {}


def fund_type(meta: dict) -> Optional[str]:
    value = meta.get("fund_type")
    return value if value in FUND_TYPES else None


def effective_risk(category: Optional[str], risk_level: Optional[str], meta) -> str:
    meta = metadata(meta)
    if category == "Mutual Fund" and fund_type(meta):
        return FUND_TYPE_RISK[fund_type(meta)]
    if risk_level in ("Low", "High"):
        return risk_level
    return CATEGORY_RISK.get(category or "", "Medium")
