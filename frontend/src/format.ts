// Display formatting shared across pages: Indian rupee grouping and short readable dates.
// (Exports such as CSV keep ISO dates, which spreadsheets read best.)

/** 4900000 -> "₹49,00,000" */
export const formatINR = (v: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);

/** "2026-07-07" -> "7 Jul 2026"; anything unparseable is returned as given. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
