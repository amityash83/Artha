// Recurring-amount frequencies, as stored in income/expenses/insurance rows. Matched
// case-insensitively because older rows hold free text (backend: tax/prefill.py PER_YEAR).
export const FREQUENCIES = ['Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'] as const;

const PER_YEAR: Record<string, number> = { monthly: 12, quarterly: 4, 'half-yearly': 2, yearly: 1, annually: 1, annual: 1 };

/** Times per year, or null for text that isn't a known frequency. */
export function perYear(frequency: string | null | undefined): number | null {
  return PER_YEAR[(frequency || 'Monthly').trim().toLowerCase()] ?? null;
}

/** An amount at its frequency as a monthly figure (unknown frequencies count as yearly). */
export function monthlyEquivalent(amount: number, frequency: string | null | undefined): number {
  return ((amount || 0) * (perYear(frequency) ?? 1)) / 12;
}
