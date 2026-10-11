"""Money as Indians read it, for text the backend writes (recommendations, explanations)."""


def indian_digits(amount) -> str:
    """4900000 -> '49,00,000' (lakh/crore grouping), rounded to whole rupees."""
    value = float(amount or 0)
    digits = f"{abs(value):.0f}"
    head, tail = digits[:-3], digits[-3:]
    groups = []
    while len(head) > 2:
        head, groups = head[:-2], [head[-2:]] + groups
    out = ",".join(([head] if head else []) + groups + [tail])
    return ("-" if round(value) < 0 else "") + out


def inr(amount) -> str:
    """4900000 -> '₹49,00,000'."""
    text = indian_digits(amount)
    return f"-₹{text[1:]}" if text.startswith("-") else f"₹{text}"
