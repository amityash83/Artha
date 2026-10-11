import React, { useEffect, useState } from 'react';
import { ArrowRight, Wand2 } from 'lucide-react';
import { KnowledgeArticle, TaxAdvanceSchedule, TaxComputeResult, TaxPayslipResult, TaxRegimeKey } from '../../types';
import { formatDate } from '../../format';
import { InfoTooltip } from '../InfoTooltip';
import type { PlannerChildProps } from './TaxPlanner';
import type { OptimizationProps } from './NpsOptimizer';
import { isEmptyPlan, toEngineInputs } from './plannerInputs';
import { apiJson, EmptyState, ErrorBanner, formatINR, formatPct, Freshness, Section } from './taxUi';
import { WarningList } from './TaxWarnings';
import { RegimeComparison } from './RegimeComparison';
import { SalaryInputs, TaxPaidInputs } from './SalaryInputs';
import { OldRegimeInputs } from './OldRegimeInputs';
import { NewRegimeInputs } from './NewRegimeInputs';
import { PayslipSimulator } from './PayslipSimulator';
import { AdvanceTaxPanel } from './AdvanceTaxPanel';
import { NpsOptimizer } from './NpsOptimizer';
import { HarvestingPanel } from './HarvestingPanel';
import { useTaxPost } from './useTaxPost';

export type MainTab = 'summary' | 'income' | 'deductions' | 'pay' | 'save';

interface HarvestBrief { gain_harvest_total: number; future_tax_avoided: number; year_over: boolean; deadline: string }

const regimeName = (r: TaxRegimeKey) => (r === 'new' ? 'new regime' : 'old regime');

const Tile: React.FC<{ label: string; value: string; sub?: string; tone?: 'good' | 'warn' }> = ({ label, value, sub, tone }) => (
  <div className="tp-tile">
    <span className="tp-tile-label">{label}</span>
    <strong className={tone ? `tp-${tone}` : undefined}>{value}</strong>
    {sub && <span className="tp-tile-sub">{sub}</span>}
  </div>
);

// ---------------------------------------------------------------------------
// Summary: the answer, what to do next, the full old-vs-new table, and the checks.
// ---------------------------------------------------------------------------

export const TaxSummary: React.FC<PlannerChildProps & {
  personId: number | null;
  payslip: TaxPayslipResult | null;
  articles?: KnowledgeArticle[];
  onGo: (tab: MainTab) => void;
  onFill: () => void;
  onSample: () => void;
}> = (props) => {
  const { inputs, result, financialYear, personId, payslip, articles, onGo, onFill, onSample } = props;
  const empty = isEmptyPlan(inputs);
  const advance = useTaxPost<TaxAdvanceSchedule>('/api/tax/advance-tax', { financial_year: financialYear, inputs: toEngineInputs(inputs) },
    !!financialYear && !empty);
  const [harvest, setHarvest] = useState<HarvestBrief | null>(null);
  useEffect(() => {
    if (personId === null || !financialYear) return;
    apiJson<HarvestBrief>(`/api/tax/harvesting?person_id=${personId}&financial_year=${encodeURIComponent(financialYear)}`)
      .then(setHarvest).catch(() => setHarvest(null));
  }, [personId, financialYear]);

  if (empty) {
    return (
      <div className="glass-panel tp-start">
        <h3>Start with your figures for FY {financialYear}</h3>
        <p>Artha can fill most of this from what it already knows: salary from Income &amp; Expenses, investments, insurance premiums, home loans and the year's sales.
          You tick what to use.</p>
        <div className="tp-start-actions">
          <button type="button" className="btn btn-primary" onClick={onFill}><Wand2 size={14} /> Fill from my data</button>
          <button type="button" className="settings-btn" onClick={() => onGo('income')}>Enter my salary</button>
          <button type="button" className="settings-link" onClick={onSample}>Try sample figures</button>
        </div>
      </div>
    );
  }
  if (!result) return <EmptyState>Working it out…</EmptyState>;

  const cmp = result.comparison;
  const bestKey = cmp.best_regime;
  const best = result.regimes[bestKey];
  const other = result.regimes[bestKey === 'new' ? 'old' : 'new'];
  const saving = Math.abs(cmp.savings_old_minus_new);
  const employerRegime = inputs.profile.selected_regime;
  const owed = best.balance_payable;
  // TDS is deducted under the employer's regime (the cheaper one if not known), as in the month grid.
  const tdsKey: TaxRegimeKey = employerRegime ?? bestKey;
  const monthly = result.regimes[tdsKey].monthly;

  const todo: { text: React.ReactNode; tab?: MainTab }[] = [];
  if (employerRegime && employerRegime !== bestKey && saving > 0) {
    todo.push({ text: <>Your employer deducts TDS under the {regimeName(employerRegime)}. The {regimeName(bestKey)} costs <strong>{formatINR(saving)}</strong> less this year; you can still choose it when you file your return.</>, tab: 'income' });
  }
  if (monthly && monthly.projected_months > 0 && monthly.tax_still_due > 0) {
    todo.push({ text: <>About <strong>{formatINR(monthly.suggested_tds_per_remaining_month)}</strong> a month should be deducted as TDS over the remaining {monthly.projected_months} month{monthly.projected_months === 1 ? '' : 's'} ({formatINR(monthly.tax_still_due)} in all).</>, tab: 'pay' });
  } else if (monthly && monthly.projected_months === 0 && monthly.tax_still_due > 0) {
    todo.push({ text: <>Every month is in as actual, and <strong>{formatINR(monthly.tax_still_due)}</strong> is still due beyond the TDS: pay it as advance or self-assessment tax before filing.</>, tab: 'pay' });
  } else if (monthly?.expected_refund) {
    todo.push({ text: <>Your TDS already covers the year: a refund of about <strong>{formatINR(monthly.expected_refund)}</strong> is expected.</>, tab: 'pay' });
  }
  const next = advance.data?.available && advance.data.required ? advance.data.next_due : null;
  if (next && next.still_to_pay > 0) {
    todo.push({ text: <>Pay <strong>{formatINR(next.still_to_pay)}</strong> advance tax by {formatDate(next.due_date)} ({next.cumulative_pct}% of the year's tax is due by then).</>, tab: 'pay' });
  }
  // Compared with the employer NPS already in the plan (the payslip's "before" reads it from the
  // month grid too). The cash effect is left to Ways to save: in a month-by-month plan the
  // remaining payslips also absorb the year's whole tax saving, which isn't the lasting change.
  if (payslip && payslip.difference.annual_tax_saved > 0 && payslip.before.employer_nps_monthly < payslip.after.employer_nps_monthly - 1) {
    const now = payslip.before.employer_nps_monthly;
    todo.push({ text: <>{now > 0 ? `Raising employer NPS from ${formatINR(now)} to ${formatINR(payslip.after.employer_nps_monthly)} a month` : `Employer NPS of ${formatINR(payslip.after.employer_nps_monthly)} a month`} would
      cut tax by <strong>{formatINR(payslip.difference.annual_tax_saved)}</strong> a year, if your employer offers it. Ways to save shows what it does to your take-home.</>, tab: 'save' });
  }
  if (harvest && !harvest.year_over && harvest.gain_harvest_total > 0) {
    todo.push({ text: <>Sell and buy back equity to take <strong>{formatINR(harvest.gain_harvest_total)}</strong> of gains tax-free before {formatDate(harvest.deadline)} (about {formatINR(harvest.future_tax_avoided)} less tax later).</>, tab: 'save' });
  }
  const toCheck = result.warnings.filter((w) => w.severity === 'warning').length;

  return (
    <div className="tp-stack">
      <div className="glass-panel tp-answer">
        <div className="tp-answer-head">
          <span className="tp-tile-label">Better for you <InfoTooltip articles={articles ?? []} slug="old-vs-new-tax-regime" /></span>
          <strong className="tp-answer-title">The {regimeName(bestKey)}</strong>
          <span className="tp-answer-line">
            {saving > 0 ? <><strong>{formatINR(saving)}</strong> less tax a year than the {regimeName(bestKey === 'new' ? 'old' : 'new')} ({formatINR(saving / 12)} a month
              {cmp.savings_pct_of_old !== null ? `, ${Math.abs(cmp.savings_pct_of_old).toFixed(1)}% of the old regime's tax` : ''}). </> : 'Both regimes give the same tax. '}
            {cmp.explanation}
          </span>
        </div>
        <div className="tp-tiles">
          <Tile label={`Tax for the year (${regimeName(bestKey)})`} value={formatINR(best.total_tax)} sub={`${formatPct(best.effective_rate_pct)} of income · ${formatINR(other.total_tax)} under the other`} />
          <Tile label="Already paid" value={formatINR(best.prepaid_taxes)}
            sub={best.prepaid_taxes > 0 ? 'TDS and advance tax' : 'None entered yet: add TDS so far under Pay & TDS'} />
          <Tile label={owed >= 0 ? 'Still to pay' : 'Refund due'} value={formatINR(Math.abs(owed))} tone={owed > 0 ? 'warn' : 'good'}
            sub={owed > 0 ? 'Through TDS or advance tax' : 'When you file your return'} />
          <Tile label="Take-home a month" value={formatINR(best.monthly_average.in_hand_salary)} sub="Average, after tax and payroll deductions" />
        </div>
      </div>

      <Section title="What to do next" subtitle={todo.length ? undefined : 'Nothing needs doing right now.'}>
        {todo.length > 0 && (
          <ul className="tp-todo">
            {todo.map((t, i) => (
              <li key={i}>
                <span>{t.text}</span>
                {t.tab && <button type="button" className="settings-link" onClick={() => onGo(t.tab!)}>{TAB_LABELS[t.tab]} <ArrowRight size={12} /></button>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <RegimeComparison {...props} hideBanner />

      <Section title={toCheck ? `Checks and notes (${toCheck} to look at)` : 'Checks and notes'} subtitle="Limits that were applied, figures that don't add up, and how far each rule used here is verified.">
        <WarningList warnings={result.warnings} />
        {!result.warnings.length && <span className="tp-muted">No issues found.</span>}
      </Section>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Income: about you, salary (yearly or month by month), other income and gains.
// ---------------------------------------------------------------------------

interface Realisation { id: number; asset_name: string | null; asset_id: number; sale_date: string; sale_value: number; cost_basis: number; gain_amount: number; gain_type: 'LTCG' | 'STCG' }

const RealisedGains: React.FC<{ personId: number | null; financialYear: string }> = ({ personId, financialYear }) => {
  const [rows, setRows] = useState<Realisation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (personId === null) return;
    apiJson<Realisation[]>(`/api/tax/realised-gains?person_id=${personId}&financial_year=${encodeURIComponent(financialYear)}`)
      .then((r) => { setRows(r); setError(null); }).catch((e: Error) => setError(e.message));
  }, [personId, financialYear]);
  if (error) return <ErrorBanner message={`Couldn't load this year's sales: ${error}`} />;
  if (personId === null || rows === null) return null;
  return (
    <Section title={`Sales recorded in FY ${financialYear}`}
      subtitle="From the Sell transactions you've logged. Fill from my data adds their gains to the capital gains figures above.">
      {rows.length === 0 ? <span className="tp-muted">No sales yet. A sale appears here when you record a "Sell or redeem an asset" transaction for a stock, fund or property this person owns.</span> : (
        <div className="tp-list">
          {rows.map((r) => (
            <div key={r.id} className="tp-list-row">
              <span>
                <strong>{r.asset_name || `Asset ${r.asset_id}`}</strong>
                <small>{[formatDate(r.sale_date), `sold for ${formatINR(r.sale_value)}`, `cost ${formatINR(r.cost_basis)}`, r.gain_type === 'LTCG' ? 'long-term' : 'short-term'].join(' · ')}</small>
              </span>
              <strong className={r.gain_amount >= 0 ? 'tp-good' : 'tp-bad'}>{r.gain_amount >= 0 ? '+' : '−'}{formatINR(Math.abs(r.gain_amount))}</strong>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
};

export const IncomeTab: React.FC<PlannerChildProps & { personId: number | null }> = (props) => (
  <div className="tp-stack">
    <SalaryInputs {...props} />
    <RealisedGains personId={props.personId} financialYear={props.financialYear} />
  </div>
);

// ---------------------------------------------------------------------------
// Deductions: one place for both regimes, saying which allows what.
// ---------------------------------------------------------------------------

export const DeductionsTab: React.FC<PlannerChildProps> = (props) => (
  <div className="tp-stack">
    <NewRegimeInputs {...props} part="allowances" />
    <OldRegimeInputs {...props} />
    <NewRegimeInputs {...props} part="rare" />
  </div>
);

// ---------------------------------------------------------------------------
// Pay & TDS: tax already paid, the payslip, and advance tax.
// ---------------------------------------------------------------------------

export const PayTab: React.FC<PlannerChildProps & { opt: OptimizationProps }> = ({ opt, ...props }) => (
  <div className="tp-stack">
    <TaxPaidInputs {...props} />
    <h3 className="tp-heading">Your payslip, before and after the employer NPS change</h3>
    <PayslipSimulator {...opt} />
    <h3 className="tp-heading">Advance tax</h3>
    <AdvanceTaxPanel {...props} />
  </div>
);

// ---------------------------------------------------------------------------
// Ways to save: employer NPS, what the old regime would need, and capital gains.
// ---------------------------------------------------------------------------

interface BreakEven { status: 'found' | 'old_already_cheaper'; additional_deductions_needed: number; old_tax: number; new_tax: number; margin?: number; explanation: string }

const BreakEvenCard: React.FC<{ inputs: PlannerChildProps['inputs']; financialYear: string }> = ({ inputs, financialYear }) => {
  const be = useTaxPost<BreakEven>('/api/tax/break-even', { financial_year: financialYear, inputs: toEngineInputs(inputs) }, !!financialYear);
  return (
    <Section title="Would the old regime be better with more deductions?"
      subtitle="The extra old-regime deductions (80C, 80D, NPS, home loan interest and so on, after their limits) at which both regimes cost the same. For your own salary and this year's rules.">
      {be.error ? <ErrorBanner message={be.error} /> : !be.data ? <span className="tp-muted">Working it out…</span> : (
        <Freshness stale={be.stale}>
          {be.data.status === 'old_already_cheaper'
            ? <p className="tp-para">The old regime is already cheaper, by {formatINR(be.data.margin ?? 0)} a year.</p>
            : <p className="tp-para">You'd need <strong>{formatINR(be.data.additional_deductions_needed)}</strong> more in deductions for the old regime to match the new one
                ({formatINR(be.data.old_tax)} now against {formatINR(be.data.new_tax)}). {be.data.additional_deductions_needed > 300000 ? "That's more than most people can add, so the new regime is likely to stay better." : 'If you can add that much (unused 80C, health insurance, NPS), compare again.'}</p>}
        </Freshness>
      )}
    </Section>
  );
};

interface Unrealised { gains: Record<'stcg_111a' | 'ltcg_112a' | 'ltcg_112' | 'stcg_slab', number>; total: number; notes: string[] }

const UnrealisedGains: React.FC<{ personId: number | null; articles?: KnowledgeArticle[]; opt: OptimizationProps }> = ({ personId, articles, opt }) => {
  const [data, setData] = useState<Unrealised | null>(null);
  useEffect(() => {
    if (personId === null) return;
    apiJson<Unrealised>(`/api/tax/unrealised-gains?person_id=${personId}`).then(setData).catch(() => setData(null));
  }, [personId]);
  // The tax it would add: this year's plan with those gains on top, through the full engine
  // (so the tax-free equity allowance, special rates and surcharge all apply), against the plan as it is.
  const base = toEngineInputs(opt.inputs);
  const withGains = data ? { ...base, capital_gains: Object.fromEntries(Object.entries(base.capital_gains).map(([k, v]) => [k, (v || 0) + (data.gains[k as keyof Unrealised['gains']] || 0)])) } : base;
  const now = useTaxPost<TaxComputeResult>('/api/tax/compute', { financial_year: opt.financialYear, inputs: base }, !!data && data.total > 0);
  const sold = useTaxPost<TaxComputeResult>('/api/tax/compute', { financial_year: opt.financialYear, inputs: withGains }, !!data && data.total > 0);
  if (!data) return null;
  const bestTax = (r: TaxComputeResult | null) => (r ? r.regimes[r.comparison.best_regime].total_tax : null);
  const extra = bestTax(sold.data) !== null && bestTax(now.data) !== null ? (bestTax(sold.data) as number) - (bestTax(now.data) as number) : null;
  const rows: [string, number][] = [
    ['Equity, short-term (111A)', data.gains.stcg_111a], ['Equity, long-term (112A)', data.gains.ltcg_112a],
    ['Property, long-term (112)', data.gains.ltcg_112], ['Taxed at slab rates (short-term property, debt and liquid funds)', data.gains.stcg_slab],
  ];
  return (
    <Section title="If you sold everything today" subtitle={<>Gains still unrealised on this person's stocks, funds and property, by how they'd be taxed. Nothing here is taxed until you sell. <InfoTooltip articles={articles ?? []} slug="ltcg-vs-stcg" /></>}>
      {data.total <= 0 ? <span className="tp-muted">No unrealised gains.</span> : (
        <div className="tp-list">
          {rows.filter(([, v]) => v > 0).map(([label, v]) => (
            <div key={label} className="tp-list-row"><span>{label}</span><strong>{formatINR(v)}</strong></div>
          ))}
          <div className="tp-list-row"><span>Tax it would add this year, after the tax-free allowance</span>
            <strong>{extra === null ? '…' : formatINR(Math.max(extra, 0))}</strong></div>
        </div>
      )}
      {data.notes.map((n) => <span key={n} className="tp-muted">{n}</span>)}
    </Section>
  );
};

export const WaysToSaveTab: React.FC<{ opt: OptimizationProps; personId: number | null; articles?: KnowledgeArticle[] }> = ({ opt, personId, articles }) => (
  <div className="tp-stack">
    <h3 className="tp-heading">Employer NPS</h3>
    <NpsOptimizer {...opt} />
    <BreakEvenCard inputs={opt.inputs} financialYear={opt.financialYear} />
    <h3 className="tp-heading">Capital gains</h3>
    <HarvestingPanel personId={personId} financialYear={opt.financialYear} />
    <UnrealisedGains personId={personId} articles={articles} opt={opt} />
  </div>
);

export const TAB_LABELS: Record<MainTab, string> = { summary: 'Summary', income: 'Income', deductions: 'Deductions', pay: 'Pay & TDS', save: 'Ways to save' };
