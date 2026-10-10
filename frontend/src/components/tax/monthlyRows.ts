import { TaxInputMetadata, TaxMonthInput } from '../../types';

// A grid row: how to read and write one line of the payslip for a month.
export interface GridRow {
  id: string;
  label: string;
  group: 'Earnings' | 'Payroll deductions' | 'Employer contributions' | 'Tax & rent';
  get: (m: TaxMonthInput) => number | null;
  set: (m: TaxMonthInput, v: number | null) => TaxMonthInput;
  nullable?: boolean;
  variable?: boolean;
}

export function buildRows(metadata: TaxInputMetadata, months: TaxMonthInput[]): GridRow[] {
  const known = new Set(metadata.salary_components.map((f) => f.key));
  const custom = Array.from(new Set(months.flatMap((m) => Object.keys(m.salary)))).filter((k) => !known.has(k));
  const salaryRow = (key: string, label: string, variable?: boolean): GridRow => ({
    id: `salary.${key}`, label, group: 'Earnings', variable,
    get: (m) => m.salary[key] ?? 0,
    set: (m, v) => ({ ...m, salary: { ...m.salary, [key]: v ?? 0 } }),
  });
  return [
    ...metadata.salary_components.map((f) => salaryRow(f.key, f.label, f.variable)),
    ...custom.map((k) => salaryRow(k, k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()))),
    ...metadata.payroll_deductions.map((f): GridRow => ({
      id: `payroll_deductions.${f.key}`, label: f.label, group: 'Payroll deductions',
      get: (m) => m.payroll_deductions[f.key] ?? 0,
      set: (m, v) => ({ ...m, payroll_deductions: { ...m.payroll_deductions, [f.key]: v ?? 0 } }),
    })),
    ...metadata.employer_contributions.map((f): GridRow => ({
      id: `employer_contributions.${f.key}`, label: f.label, group: 'Employer contributions',
      get: (m) => m.employer_contributions[f.key] ?? 0,
      set: (m, v) => ({ ...m, employer_contributions: { ...m.employer_contributions, [f.key]: v ?? 0 } }),
    })),
    {
      id: 'tds', label: 'TDS deducted (from payslip)', group: 'Tax & rent', nullable: true,
      get: (m) => m.tds, set: (m, v) => ({ ...m, tds: v }),
    },
    {
      id: 'rent_paid', label: 'Rent paid', group: 'Tax & rent',
      get: (m) => m.rent_paid, set: (m, v) => ({ ...m, rent_paid: v ?? 0 }),
    },
  ];
}

/** "1,23,456.50" / "₹ 1,200" / "(500)" -> number; blank -> null. */
export function parseAmount(raw: string): number | null {
  const t = raw.replace(/[₹,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (t === '' || t === '-') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.max(n, 0) : null;
}

