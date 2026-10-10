// The Tax Planner report as a list of tables. Both the CSV downloads and the printable
// PDF report are built from these, so a file can never disagree with the printout.
import {
  TaxComputeResult, TaxNpsScenariosResult, TaxPayslipResult, TaxRegimeKey, TaxWaterfallResult,
} from '../../types';
import type { CsvCell } from './csvExport';
import { COMPARISON_ROWS } from './RegimeComparison';
import type { SensitivityResult } from './SensitivityPanel';

// 'auto': numbers print as rupees, text as-is (CSV keeps raw numbers either way).
export type ColumnFormat = 'text' | 'inr' | 'pct' | 'auto';

export interface ReportTable {
  id: string;
  title: string;
  note?: string;
  columns: { label: string; format: ColumnFormat }[];
  rows: CsvCell[][];
}

export interface ReportData {
  result: TaxComputeResult;
  nps: TaxNpsScenariosResult | null;
  payslip: TaxPayslipResult | null;
  sensitivity: SensitivityResult | null;
  waterfalls: Partial<Record<TaxRegimeKey, TaxWaterfallResult>>;
}

const col = (label: string, format: ColumnFormat = 'inr') => ({ label, format });
const REGIME_NAME: Record<TaxRegimeKey, string> = { new: 'New regime', old: 'Old regime' };

export function buildReportTables(d: ReportData): ReportTable[] {
  const { result } = d;
  const { old: o, new: n } = result.regimes;
  const cmp = result.comparison;
  const tables: ReportTable[] = [];

  tables.push({
    id: 'summary', title: 'Summary',
    columns: [col('Metric', 'text'), col('Value', 'auto')],
    rows: [
      ['Financial year', `${result.rule_set.financial_year} (AY ${result.rule_set.assessment_year})`],
      ['Rule set', `${result.rule_set.name ?? result.rule_set.rule_set_id} v${result.rule_set.version} (${result.rule_set.act})`],
      ['Gross salary', n.gross_salary],
      ['Tax: old regime', o.total_tax],
      ['Tax: new regime', n.total_tax],
      ['Cheaper regime', REGIME_NAME[cmp.best_regime]],
      ['Annual saving with the cheaper regime', Math.abs(cmp.savings_old_minus_new)],
      ['Monthly in-hand: old regime (average)', o.monthly_average.in_hand_salary],
      ['Monthly in-hand: new regime (average)', n.monthly_average.in_hand_salary],
    ],
  });

  tables.push({
    id: 'comparison', title: 'Old vs new regime',
    note: 'Difference = old regime minus new regime.',
    columns: [col('Metric', 'text'), col('Old regime', 'auto'), col('New regime', 'auto'), col('Difference', 'auto')],
    rows: COMPARISON_ROWS.map((r) => {
      const ov = r.value(o);
      const nv = r.value(n);
      const fmt = (v: number) => (r.format === 'pct' ? `${v.toFixed(2)}%` : Math.round(v));
      return [r.label, fmt(ov), fmt(nv), fmt(ov - nv)];
    }),
  });

  (['new', 'old'] as TaxRegimeKey[]).forEach((k) => {
    tables.push({
      id: `computation-${k}`, title: `Tax computation: ${REGIME_NAME[k]}`,
      note: 'Every figure with where it came from: your input, a tax rule (with how far it is verified), or arithmetic.',
      columns: [col('Step', 'text'), col('Item', 'text'), col('Amount'), col('Source', 'text'), col('Verification', 'text'),
        col('Section (1961 / 2025 Act)', 'text'), col('How it was derived', 'text')],
      rows: result.regimes[k].audit.map((l) => [
        l.step, l.label, l.amount, l.source.replace('_', ' '), l.verification?.replace('_', ' ') ?? '',
        [l.legacy_section, l.act_2025_section].filter(Boolean).join(' / '), l.formula,
      ]),
    });
  });

  (['new', 'old'] as TaxRegimeKey[]).forEach((k) => {
    const w = d.waterfalls[k];
    if (!w) return;
    tables.push({
      id: `waterfall-${k}`, title: `Tax savings waterfall: ${REGIME_NAME[k]}`, note: w.baseline_definition,
      columns: [col('Step', 'text'), col('Effect on tax'), col('Tax after step')],
      rows: [['Baseline (nothing deducted)', null, w.baseline_tax], ...w.steps.map((s) => [s.label, s.effect, s.tax_after_step]), ['Final tax', null, w.final_tax]],
    });
  });

  if (d.nps) {
    const sc = d.nps.scenarios;
    const metric = (label: string, pick: (s: typeof sc[number]) => CsvCell, format: ColumnFormat = 'inr') => ({ label, pick, format });
    const metrics = [
      metric('Employer NPS (annual)', (s) => s.employer_nps_annual),
      metric('Deductible employer NPS', (s) => s.deductible_employer_nps),
      metric('Taxable income after', (s) => s.taxable_income_after),
      metric('Annual tax after', (s) => s.tax_after),
      metric('Annual tax saved', (s) => s.tax_saved_annual),
      metric('Monthly tax saved', (s) => s.tax_saved_monthly),
      metric('Tax saved per rupee of NPS', (s) => (s.tax_saved_per_rupee == null ? '' : s.tax_saved_per_rupee.toFixed(2)), 'text'),
      metric('Monthly in-hand', (s) => s.in_hand_monthly),
      metric('Change in monthly in-hand', (s) => s.in_hand_change_monthly),
      metric('Net economic benefit (annual)', (s) => s.net_economic_benefit_annual),
      metric('CTC after', (s) => s.ctc_after),
    ];
    tables.push({
      id: 'nps', title: 'Corporate NPS scenarios',
      note: `${d.nps.funding === 'restructure' ? 'Restructured from existing salary' : 'Added over CTC'}; salary base ${Math.round(d.nps.salary_base_annual)} (${d.nps.salary_base_source}). ${d.nps.definitions.net_economic_benefit}`,
      columns: [col('Metric', 'text'), ...sc.map((s) => col(s.pct_of_base != null ? `${s.pct_of_base}%` : s.label.replace('Custom: ', ''), 'auto'))],
      rows: metrics.map((m) => [m.label, ...sc.map((s) => {
        const v = m.pick(s);
        return typeof v === 'number' && m.format === 'inr' ? Math.round(v) : v;
      })]),
    });
  }

  if (d.payslip) {
    const { before: b, after: a, difference: diff } = d.payslip;
    const line = (label: string, x: number, y: number): CsvCell[] => [label, x, y, y - x];
    tables.push({
      id: 'payslip', title: `${d.payslip.month ? `Payslip for ${d.payslip.month.label}` : 'Monthly payslip (average month)'}: before vs after optimisation`, note: d.payslip.tds_note,
      columns: [col('Line', 'text'), col(`Before (${b.regime} regime)`), col(`After (${a.regime} regime)`), col('Difference')],
      rows: [
        line('Gross monthly cash earnings', b.gross_monthly_cash, a.gross_monthly_cash),
        line('Payroll deductions', b.payroll_deductions_total, a.payroll_deductions_total),
        line('TDS', b.tds_monthly, a.tds_monthly),
        line('Net monthly in-hand', b.net_in_hand_monthly, a.net_in_hand_monthly),
        line('Employer NPS (not cash)', b.employer_nps_monthly, a.employer_nps_monthly),
        line('Annual tax', b.annual_tax, a.annual_tax),
        ['Net monthly impact (cash + NPS)', null, null, diff.net_monthly_impact],
      ],
    });
  }

  const regime: TaxRegimeKey = result.inputs.profile.selected_regime ?? cmp.best_regime;
  const view = result.regimes[regime].monthly;
  if (view) {
    tables.push({
      id: 'monthly', title: `Month by month (${REGIME_NAME[regime]})`, note: view.method,
      columns: [col('Month', 'text'), col('Status', 'text'), col('Gross cash'), col('Payroll deductions'), col('TDS'), col('TDS basis', 'text'), col('Take-home'), col('Employer NPS')],
      rows: [
        ...view.months.map((m) => [m.label, m.status, m.gross_cash, m.payroll_deductions, m.tds, m.tds_basis, m.in_hand, m.employer_nps]),
        ['TDS deducted so far', null, null, null, view.tds_paid_to_date, null, null, null],
        ['Still to be deducted', null, null, null, view.tax_still_due, null, null, null],
        ['Expected TDS per remaining month', null, null, null, view.suggested_tds_per_remaining_month, null, null, null],
      ],
    });
  }

  if (d.sensitivity) {
    const s = d.sensitivity;
    tables.push({
      id: 'break-even', title: 'Old-regime break-even', note: s.break_even.explanation,
      columns: [col('Measure', 'text'), col('Amount')],
      rows: s.break_even.status === 'found'
        ? [['Extra old-regime deductions needed', s.break_even.additional_deductions_needed], ['New regime tax', s.break_even.new_tax]]
        : [['Old regime already cheaper by', s.break_even.margin ?? 0]],
    });
    tables.push({
      id: 'salary-sweep', title: 'If your salary changes',
      columns: [col('Salary change', 'text'), col('Cash salary'), col('Old regime'), col('New regime'), col('Cheaper', 'text'), col('Monthly in-hand')],
      rows: s.salary_sweep.map((r) => [r.factor === 1 ? 'Current' : `${Math.round((r.factor - 1) * 100)}%`, r.cash_salary, r.old_tax, r.new_tax, REGIME_NAME[r.best_regime], r.monthly_in_hand_best]),
    });
    tables.push({
      id: 'bonus-sweep', title: 'What a bonus costs in tax',
      columns: [col('Bonus'), col('Extra tax'), col('Bonus kept'), col('Tax rate on bonus', 'text'), col('Cheaper', 'text')],
      rows: s.bonus_sweep.filter((r) => r.bonus > 0).map((r) => [r.bonus, r.extra_tax, r.bonus_kept, r.tax_rate_on_bonus_pct != null ? `${r.tax_rate_on_bonus_pct}%` : '', REGIME_NAME[r.best_regime]]),
    });
    tables.push({
      id: 'basic-share-sweep', title: "If basic's share of fixed pay changes", note: `Current basic share: ${s.current_basic_share_pct ?? '-'}%.`,
      columns: [col('Basic share', 'text'), col('Old regime'), col('New regime'), col('HRA exempt (old)'), col('Employer NPS limit (new)')],
      rows: s.basic_share_sweep.map((r) => (r.feasible
        ? [`${r.basic_share_pct}%`, r.old_tax ?? null, r.new_tax ?? null, r.hra_exemption_old ?? null, r.employer_nps_limit_new ?? null]
        : [`${r.basic_share_pct}%`, null, null, null, null])),
    });
  }

  tables.push({
    id: 'checks', title: 'Checks and notes',
    columns: [col('Severity', 'text'), col('Regime', 'text'), col('Note', 'text')],
    rows: result.warnings.map((w) => [w.severity, w.regime ? REGIME_NAME[w.regime] : '', w.message]),
  });
  return tables;
}

/** All tables in one CSV, each under its own title row. */
export function allTablesCsvRows(tables: ReportTable[]): CsvCell[][] {
  return tables.flatMap((t) => [[t.title], ...(t.note ? [[t.note]] : []), t.columns.map((c) => c.label), ...t.rows, []]);
}
