"""
Payslip PDFs -> month + (label, amount) lines, for the planner's month-by-month grid.

Everything happens in memory; the PDF is never written to disk. Payslip layouts differ
by employer, so this does not try to understand any one format. It reads the text,
finds the pay month, and collects every "label amount" pair; the UI then shows them in
the same mapping step as CSV import (guessing a target per label, all editable), so a
misread line is visible and can be ignored.

Not handled: scanned (image-only) PDFs, which have no text to read (reported, not guessed).
"""
import io
import re
from typing import List, Optional

from pypdf import PdfReader
from pypdf.errors import FileNotDecryptedError, PdfReadError


class PayslipPdfError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code  # password_required | wrong_password | no_text | unreadable


MONTHS = ["january", "february", "march", "april", "may", "june", "july",
          "august", "september", "october", "november", "december"]
_MONTH_WORD = r"(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
_MONTH_YEAR = re.compile(_MONTH_WORD + r"[\s,.'’-]*((?:19|20)\d{2}|\d{2})\b", re.IGNORECASE)
_NUMERIC_MONTH_YEAR = re.compile(r"\b(0?[1-9]|1[0-2])[/-]((?:19|20)\d{2})\b")
_PAY_PERIOD_HINT = re.compile(r"(month of|for the month|pay\s*(?:slip|period)|salary\s*(?:slip|for)|period)", re.IGNORECASE)

# "Basic Salary 1,12,500.00", "Prof. Tax : 200", "HRA Rs. 45,000" — several per line in
# two-column (earnings | deductions) layouts. Indian (1,12,500) and western (112,500)
# grouping, optional paise.
_AMOUNT = r"(\d{1,3}(?:,\d{2})*,\d{3}(?:\.\d{1,2})?|\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)"
_PAIR = re.compile(r"([A-Za-z][A-Za-z .&/()'%+-]{0,60}?)\s*[:=-]?\s*(?:Rs\.?|INR|₹)?\s*" + _AMOUNT + r"(?![\w,])")

# Labels that carry numbers but not money: identifiers, counts, dates.
_NOT_MONEY = re.compile(
    r"\b(days?|lop|leaves?|attendance|code|no|number|id|a/?c|account|ifsc|pan|uan|esi\s*no|pf\s*no|"
    r"year|date|dob|age|grade|level|band|hours?|units?|employees?\s*(?:no|id|code)|page)\b",
    re.IGNORECASE)


def extract_text(data: bytes, password: Optional[str] = None) -> str:
    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            if not password:
                raise PayslipPdfError("password_required", "This PDF is password-protected. Enter its password (often your PAN or date of birth).")
            if not reader.decrypt(password):
                raise PayslipPdfError("wrong_password", "That password didn't open this PDF.")
        pages = []
        for page in reader.pages:
            try:
                pages.append(page.extract_text(extraction_mode="layout") or "")
            except Exception:  # some producers trip layout mode; plain mode still works
                pages.append(page.extract_text() or "")
    except PayslipPdfError:
        raise
    except FileNotDecryptedError:
        raise PayslipPdfError("password_required", "This PDF is password-protected. Enter its password.")
    except (PdfReadError, ValueError, KeyError, TypeError) as e:
        raise PayslipPdfError("unreadable", f"This file couldn't be read as a PDF ({e}).")
    text = "\n".join(pages)
    if not re.search(r"[A-Za-z]{3}", text):
        raise PayslipPdfError("no_text", "No text found: this looks like a scanned payslip (an image). Enter it by hand or from a CSV.")
    return text


def find_pay_month(text: str) -> Optional[dict]:
    """The payslip's month: a month+year near words like 'month of' / 'pay slip' first,
    else the first month+year in the document."""
    candidates = []
    for line in text.splitlines():
        hint = bool(_PAY_PERIOD_HINT.search(line))
        for m in _MONTH_YEAR.finditer(line):
            name = m.group(1).lower()[:3]
            month = next(i + 1 for i, full in enumerate(MONTHS) if full.startswith(name))
            yy = m.group(2)
            candidates.append((hint, month, int(yy if len(yy) == 4 else "20" + yy)))  # '26 -> 2026
        for m in _NUMERIC_MONTH_YEAR.finditer(line):
            candidates.append((hint, int(m.group(1)), int(m.group(2))))
    if not candidates:
        return None
    hinted = [c for c in candidates if c[0]]
    _, month, year = (hinted or candidates)[0]
    return {"year": year, "month": month}


def _clean_label(label: str) -> str:
    label = re.sub(r"\s+", " ", label).strip(" .:-=/")
    return re.sub(r"^(?:rs|inr)\.?\s+", "", label, flags=re.IGNORECASE)


def find_amounts(text: str) -> List[dict]:
    """Every 'label amount' pair, in reading order; the first amount per label wins (a
    second number after a label, e.g. a year-to-date column, has no label and is skipped)."""
    seen = set()
    out = []
    for line in text.splitlines():
        for m in _PAIR.finditer(line):
            label = _clean_label(m.group(1))
            if len(label) < 2 or _NOT_MONEY.search(label):
                continue
            raw = m.group(2)
            # "Pay slip for April 2026": a month name followed by a year is a date, not money.
            if re.search(_MONTH_WORD + r"$", label, re.IGNORECASE) and re.fullmatch(r"(?:19|20)\d{2}", raw):
                continue
            amount = float(raw.replace(",", ""))
            key = label.lower()
            if key in seen:
                continue
            seen.add(key)
            out.append({"label": label, "amount": amount})
    return out


def read_payslip(data: bytes, password: Optional[str] = None) -> dict:
    text = extract_text(data, password)
    items = find_amounts(text)
    warnings = []
    month = find_pay_month(text)
    if month is None:
        warnings.append("No pay month found; pick the month yourself.")
    if not items:
        warnings.append("No amounts found in this PDF.")
    return {"month": month, "items": items, "warnings": warnings}
