import React from 'react';
import {
  TaxComputeResult, TaxNpsScenariosResult, TaxPayslipResult, TaxPlannerInputs, TaxRegimeKey, TaxWaterfallResult,
} from '../../types';
import { formatINR, formatPct } from './taxUi';
import { BarChart, barDataset, barOptions, ChartCard, NEUTRAL_TOTAL, REGIME_COLOR, SERIES } from './taxCharts';

const REGIMES: TaxRegimeKey[] = ['new', 'old'];
const REGIME_LABEL: Record<TaxRegimeKey, string> = { new: 'New regime', old: 'Old regime' };
const grid2: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' };

/** Chart A: old vs new tax. Annual and monthly figures are small multiples, not one axis. */
export const RegimeTaxChart: React.FC<{ result: TaxComputeResult; waterfalls: Partial<Record<TaxRegimeKey, TaxWaterfallResult>> }> = (
  { result, waterfalls },
) => {
  const before = (k: TaxRegimeKey) => waterfalls[k]?.baseline_tax ?? 0;
  const annual = {
    labels: ['Tax before deductions', 'Final annual tax'],
    datasets: REGIMES.map((k) => barDataset(REGIME_LABEL[k], [before(k), result.regimes[k].total_tax], REGIME_COLOR[k])),
  };
  const monthly = {
    labels: ['Average monthly tax'],
    datasets: REGIMES.map((k) => barDataset(REGIME_LABEL[k], [result.regimes[k].monthly_average.tax], REGIME_COLOR[k])),
  };
  return (
    <div style={grid2}>
      <ChartCard title="A. Old vs new regime: annual tax"
        subtitle="'Before deductions' is the same engine run with every exemption and deduction switched off."
        table={{ columns: ['Metric', 'New regime', 'Old regime'], rows: [
          ['Tax before deductions', before('new'), before('old')],
          ['Final annual tax', result.regimes.new.total_tax, result.regimes.old.total_tax],
        ] }}>
        <BarChart label="Annual tax by regime" data={annual} options={barOptions('inr')} />
      </ChartCard>
      <ChartCard title="A. Old vs new regime: average monthly tax" subtitle="Annual tax ÷ 12."
        table={{ columns: ['Metric', 'New regime', 'Old regime'], rows: [
          ['Average monthly tax', result.regimes.new.monthly_average.tax, result.regimes.old.monthly_average.tax],
        ] }}>
        <BarChart label="Average monthly tax by regime" data={monthly} options={barOptions('inr')} />
      </ChartCard>
    </div>
  );
};

/** Chart B: what the salary is made of, and where it goes in each regime. */
export const SalaryBreakdownChart: React.FC<{ inputs: TaxPlannerInputs; result: TaxComputeResult }> = ({ result }) => {
  // The year as computed: with month-by-month entry the plan's yearly fields are stale and
  // the months' totals are what's taxed.
  const year = result.inputs;
  const s = year.salary;
  const known = new Set(['basic', 'hra', 'special_allowance', 'bonus', 'incentives']);
  const other = Object.entries(s).filter(([k]) => !known.has(k)).reduce((t, [, v]) => t + (v || 0), 0);
  const parts: [string, number][] = [
    ['Basic', s.basic || 0], ['HRA', s.hra || 0], ['Special allowance', s.special_allowance || 0],
    ['Bonus & incentives', (s.bonus || 0) + (s.incentives || 0)], ['Other & custom', other],
  ];
  const composition = {
    labels: ['Cash salary'],
    datasets: parts.map(([label, v], i) => barDataset(label, [v], SERIES[i], true)),
  };
  const nps = year.employer_contributions.nps || 0;
  const destinations: [string, (k: TaxRegimeKey) => number][] = [
    ['Net cash received', (k) => result.regimes[k].in_hand_salary_annual],
    ['Income tax', (k) => result.regimes[k].total_tax],
    ['Payroll deductions', (k) => result.regimes[k].payroll_deductions_total],
    ['Employer NPS (not cash)', () => nps],
  ];
  const whereItGoes = {
    labels: REGIMES.map((k) => REGIME_LABEL[k]),
    datasets: destinations.map(([label, fn], i) => barDataset(label, REGIMES.map(fn), SERIES[i], true)),
  };
  return (
    <div style={grid2}>
      <ChartCard title="B. Salary breakdown: cash components" height={170}
        table={{ columns: ['Component', 'Annual'], rows: parts.map(([l, v]) => [l, v]) }}>
        <BarChart label="Cash salary composition" data={composition} options={barOptions('inr', { stacked: true, horizontal: true })} />
      </ChartCard>
      <ChartCard title="B. Where the salary goes" height={170}
        subtitle="Cash salary split into net cash, tax and payroll deductions; employer NPS sits outside cash."
        table={{ columns: ['Destination', 'New regime', 'Old regime'], rows: destinations.map(([l, fn]) => [l, fn('new'), fn('old')]) }}>
        <BarChart label="Where the salary goes by regime" data={whereItGoes} options={barOptions('inr', { stacked: true, horizontal: true })} />
      </ChartCard>
    </div>
  );
};

const STEP_SHORT: Record<string, string> = {
  exemptions: 'Exemptions', standard_deduction: 'Std deduction', investments: 'Investments',
  home_loan: 'Home loan', employer_nps: 'Employer NPS', other_deductions: 'Other',
};

/**
 * Chart C: savings waterfall, each step recomputed by the engine (sums exactly). The
 * waterfall stays zero-based (a truncated axis would exaggerate small savings), so a
 * second zero-based bar chart shows each item's saving at a readable scale.
 */
export const WaterfallChart: React.FC<{ waterfall: TaxWaterfallResult }> = ({ waterfall }) => {
  const labels = ['Baseline', ...waterfall.steps.map((s) => STEP_SHORT[s.key] ?? s.label), 'Final tax'];
  let running = waterfall.baseline_tax;
  const bars: [number, number][] = [[0, waterfall.baseline_tax]];
  const colors: string[] = [NEUTRAL_TOTAL];
  for (const step of waterfall.steps) {
    const next = running + step.effect;
    bars.push([Math.min(running, next), Math.max(running, next)]);
    colors.push(step.effect <= 0 ? SERIES[2] : SERIES[1]);
    running = next;
  }
  bars.push([0, waterfall.final_tax]);
  colors.push(NEUTRAL_TOTAL);
  const data = { labels, datasets: [barDataset('Tax', bars, colors)] };
  const savings = {
    labels: waterfall.steps.map((s) => STEP_SHORT[s.key] ?? s.label),
    datasets: [barDataset('Tax saved', waterfall.steps.map((s) => -s.effect), SERIES[2])],
  };
  const totalSaved = waterfall.baseline_tax - waterfall.final_tax;
  return (
    <ChartCard title={`C. Tax savings waterfall (${REGIME_LABEL[waterfall.regime]})`}
      subtitle={<>{waterfall.baseline_definition} Each step adds one group back and recomputes the full tax, so the steps sum exactly to the final tax. Green steps reduce tax.</>}
      height={460}
      table={{ columns: ['Step', 'Effect on tax', 'Tax after step'], rows: [
        ['Baseline', '', waterfall.baseline_tax],
        ...waterfall.steps.map((s) => [s.label, s.effect, s.tax_after_step] as (string | number)[]),
        ['Final tax', '', waterfall.final_tax],
      ] }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: '10px' }}>
        <div style={{ position: 'relative', flex: '1 1 60%' }}>
          <BarChart label="Tax savings waterfall" data={data} options={barOptions('inr', { legend: false })} />
        </div>
        <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
          Saving by item: {formatINR(totalSaved)} in total, from {formatINR(waterfall.baseline_tax)} to {formatINR(waterfall.final_tax)}.
        </div>
        <div style={{ position: 'relative', flex: '1 1 40%' }}>
          <BarChart label="Tax saved by item" data={savings} options={barOptions('inr', { legend: false, horizontal: true })} />
        </div>
      </div>
    </ChartCard>
  );
};

const scenarioLabel = (s: { pct_of_base: number | null; label: string }) =>
  s.pct_of_base !== null ? `${s.pct_of_base}%` : s.label.replace('Custom: ', '');

/** Chart D: NPS scenarios. Annual and monthly measures as two charts (one axis each). */
export const NpsScenarioCharts: React.FC<{ nps: TaxNpsScenariosResult }> = ({ nps }) => {
  const labels = nps.scenarios.map(scenarioLabel);
  const annual = {
    labels,
    datasets: [
      barDataset('Annual tax', nps.scenarios.map((s) => s.tax_after), SERIES[0]),
      barDataset('Annual tax saved', nps.scenarios.map((s) => s.tax_saved_annual), SERIES[2]),
    ],
  };
  const monthly = {
    labels,
    datasets: [
      barDataset('Monthly in-hand', nps.scenarios.map((s) => s.in_hand_monthly), SERIES[0]),
      barDataset('Monthly employer NPS', nps.scenarios.map((s) => s.employer_nps_monthly), SERIES[3]),
      barDataset('Monthly tax saved', nps.scenarios.map((s) => s.tax_saved_monthly), SERIES[2]),
    ],
  };
  return (
    <div style={grid2}>
      <ChartCard title="D. NPS scenarios: annual" subtitle="Contribution as % of the salary base."
        table={{ columns: ['Scenario', 'Annual tax', 'Annual tax saved'], rows: nps.scenarios.map((s) => [s.label, s.tax_after, s.tax_saved_annual]) }}>
        <BarChart label="Annual tax and tax saved by NPS scenario" data={annual} options={barOptions('inr')} />
      </ChartCard>
      <ChartCard title="D. NPS scenarios: monthly"
        table={{ columns: ['Scenario', 'Monthly in-hand', 'Monthly NPS', 'Monthly tax saved'],
          rows: nps.scenarios.map((s) => [s.label, s.in_hand_monthly, s.employer_nps_monthly, s.tax_saved_monthly]) }}>
        <BarChart label="Monthly in-hand, NPS and tax saved by NPS scenario" data={monthly} options={barOptions('inr')} />
      </ChartCard>
    </div>
  );
};

/** Chart E: monthly cash flow before vs after, with the NPS money shown separately from cash. */
export const CashFlowChart: React.FC<{ payslip: TaxPayslipResult }> = ({ payslip }) => {
  const { before, after, difference } = payslip;
  const data = {
    labels: ['Before optimisation', 'After optimisation'],
    datasets: [
      barDataset('Cash in hand', [before.net_in_hand_monthly, after.net_in_hand_monthly], SERIES[0], true),
      barDataset('Employer NPS (not cash)', [before.employer_nps_monthly, after.employer_nps_monthly], SERIES[2], true),
    ],
  };
  return (
    <ChartCard title="E. Monthly cash flow: before vs after"
      subtitle={<>Cash in hand changes by {formatINR(difference.monthly_cash_change)} a month while
        NPS changes by {formatINR(difference.monthly_nps_change)}: a net {formatINR(difference.net_monthly_impact)} a month.</>}
      table={{ columns: ['Metric', 'Before', 'After'], rows: [
        ['Cash in hand (monthly)', before.net_in_hand_monthly, after.net_in_hand_monthly],
        ['Employer NPS (monthly)', before.employer_nps_monthly, after.employer_nps_monthly],
        ['Monthly TDS', before.tds_monthly, after.tds_monthly],
      ] }}>
      <BarChart label="Monthly cash in hand and NPS before and after" data={data} options={barOptions('inr', { stacked: true })} />
    </ChartCard>
  );
};

/** Chart F: effective and marginal tax rates by regime. */
export const TaxRateChart: React.FC<{ result: TaxComputeResult }> = ({ result }) => {
  const data = {
    labels: ['Effective tax rate', 'Marginal tax rate'],
    datasets: REGIMES.map((k) => barDataset(REGIME_LABEL[k],
      [result.regimes[k].effective_rate_pct, result.regimes[k].marginal_rate_pct], REGIME_COLOR[k])),
  };
  return (
    <ChartCard title="F. Effective and marginal tax rates"
      subtitle="Effective = total tax ÷ gross total income. Marginal = tax on the next rupee, including surcharge and cess."
      table={{ columns: ['Rate', 'New regime', 'Old regime'], rows: [
        ['Effective', formatPct(result.regimes.new.effective_rate_pct), formatPct(result.regimes.old.effective_rate_pct)],
        ['Marginal', formatPct(result.regimes.new.marginal_rate_pct), formatPct(result.regimes.old.marginal_rate_pct)],
      ] }}>
      <BarChart label="Effective and marginal tax rates by regime" data={data} options={barOptions('pct')} />
    </ChartCard>
  );
};
