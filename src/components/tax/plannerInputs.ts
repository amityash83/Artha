import { TaxPlannerInputs } from '../../types';

// Starting values from the Tax Planner spec's sample payroll. They are user data, not
// tax rules: every one is editable, and no tax threshold or limit lives in the UI.
export const DEFAULT_PLANNER_INPUTS: TaxPlannerInputs = {
  profile: { age: 30, residential_status: 'resident', employer_type: 'private', city: null, metro: null, selected_regime: null },
  salary: {
    basic: 2702250, da: 0, hra: 1080900, special_allowance: 1621350, bonus: 0, incentives: 0, other_taxable_allowances: 0,
  },
  salary_monthly: {
    basic: 225188, da: 0, hra: 90075, special_allowance: 135113, bonus: 0, incentives: 0, other_taxable_allowances: 0,
  },
  employer_contributions: { pf: 0, nps: 0, superannuation: 0 },
  payroll_deductions: { employee_epf: 36000, vpf: 0, employee_esic: 0, professional_tax: 0, other: 0 },
  hra: { rent_paid_monthly: 0, months_rented: 12 },
  exempt_allowances: {
    children_education_received: 0, children_education_children: 0, hostel_received: 0, hostel_children: 0,
    other_old: 0, other_new: 0,
  },
  other_income: { interest_savings: 0, interest_deposits: 0, dividends: 0, rental_gross: 0, rental_municipal_tax: 0, other: 0 },
  capital_gains: { stcg_111a: 0, ltcg_112a: 0, ltcg_112: 0, stcg_slab: 0 },
  deductions: {
    '80C': { ppf: 0, elss: 0, life_insurance: 0, home_loan_principal: 0, tuition_fees: 0, other: 0 },
    employee_nps: 0,
    '80D_self_family': 0,
    '80D_parents': 0,
    parents_senior: false,
    home_loan_interest_self_occupied: 0,
    '80E': 0,
    '80G_eligible': 0,
    other_old: 0,
    other_new: 0,
  },
  prepaid: { tds: 0, advance_tax: 0 },
};

export const MONTHS = 12;

export function getIn(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[key] : undefined), obj);
}

/** Immutable set of a dotted path ("deductions.80C.ppf"). */
export function setIn<T>(obj: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split('.');
  const current = (obj as Record<string, unknown>) ?? {};
  return {
    ...current,
    [head]: rest.length ? setIn(current[head] as Record<string, unknown>, rest.join('.'), value) : value,
  } as T;
}

/** Engine payload: drops monthly figures for components no longer present. */
export function toEngineInputs(inputs: TaxPlannerInputs): TaxPlannerInputs {
  const monthly = inputs.salary_monthly
    ? Object.fromEntries(Object.entries(inputs.salary_monthly).filter(([k]) => k in inputs.salary))
    : null;
  return { ...inputs, salary_monthly: monthly };
}

const DRAFT_KEY = 'artha.taxPlanner.draft.v1';

// Per-device convenience only: the durable record is a saved scenario (server-side).
export function loadDraft(): { inputs: TaxPlannerInputs; financialYear?: string } | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDraft(inputs: TaxPlannerInputs, financialYear: string): void {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ inputs, financialYear }));
  } catch {
    // storage unavailable (private window etc.) — the draft simply isn't kept
  }
}

export function clearDraft(): void {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // ignore
  }
}
