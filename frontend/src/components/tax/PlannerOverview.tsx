import React from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Info } from 'lucide-react';
import { TaxWarning } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { EmptyState, formatINR, formatPct, Section } from './taxUi';

interface KpiProps {
  label: string;
  value: string;
  better?: 'lower' | 'higher';
  highlight?: boolean;
  sub?: string;
}

const Kpi: React.FC<KpiProps> = ({ label, value, better, highlight, sub }) => (
  <div className="glass-card" style={{
    padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px',
    border: highlight ? '1px solid rgba(16, 185, 129, 0.35)' : undefined,
    background: highlight ? 'rgba(16, 185, 129, 0.06)' : undefined,
  }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
      <span>{label}</span>
      {better && (
        <span title={`${better === 'lower' ? 'Lower' : 'Higher'} is better`} style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          {better === 'lower' ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
          <span style={{ fontSize: '10px' }}>{better} is better</span>
        </span>
      )}
    </div>
    <div style={{ fontSize: '19px', fontWeight: 700, color: highlight ? '#10b981' : 'var(--text-primary)', fontFamily: 'var(--font-display)' }}>{value}</div>
    {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>}
  </div>
);

export const WarningList: React.FC<{ warnings: TaxWarning[] }> = ({ warnings }) => {
  if (!warnings.length) return null;
  const sorted = [...warnings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1));
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sorted.map((w, i) => (
        <li key={`${w.code}-${w.regime}-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {w.severity === 'warning'
            ? <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
            : <Info size={14} style={{ color: 'var(--info)', flexShrink: 0, marginTop: '2px' }} />}
          <span>{w.regime && <strong style={{ color: 'var(--text-primary)' }}>{w.regime === 'old' ? 'Old regime: ' : 'New regime: '}</strong>}{w.message}</span>
        </li>
      ))}
    </ul>
  );
};

export const PlannerOverview: React.FC<PlannerChildProps> = ({ result, inputs, payslip }) => {
  if (!result) return <EmptyState>Computing…</EmptyState>;
  const { old: oldR, new: newR } = result.regimes;
  const cmp = result.comparison;
  const best = result.regimes[cmp.best_regime];
  const savings = Math.abs(cmp.savings_old_minus_new);
  const employerNps = inputs.employer_contributions.nps || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
        <Kpi label="Gross annual salary" value={formatINR(newR.gross_salary)} sub={`${formatINR(newR.gross_salary / 12)} / month`} />
        <Kpi label="Taxable income: old regime" value={formatINR(oldR.total_income)} better="lower" />
        <Kpi label="Taxable income: new regime" value={formatINR(newR.total_income)} better="lower" />
        <Kpi label="Annual tax: old regime" value={formatINR(oldR.total_tax)} better="lower" highlight={cmp.best_regime === 'old'}
          sub={`Effective ${formatPct(oldR.effective_rate_pct)}`} />
        <Kpi label="Annual tax: new regime" value={formatINR(newR.total_tax)} better="lower" highlight={cmp.best_regime === 'new'}
          sub={`Effective ${formatPct(newR.effective_rate_pct)}`} />
        <Kpi label="Best regime" value={best.label} highlight />
        <Kpi label="Annual tax saving with best regime" value={formatINR(savings)} better="higher"
          sub={cmp.savings_pct_of_old !== null ? `${Math.abs(cmp.savings_pct_of_old).toFixed(1)}% of old-regime tax` : undefined} />
        <Kpi label="Monthly tax saving" value={formatINR(Math.abs(cmp.monthly_savings_old_minus_new))} better="higher" sub="Annual ÷ 12 (average)" />
        <Kpi label="Monthly in-hand: old regime" value={formatINR(oldR.monthly_average.in_hand_salary)} better="higher" sub="Average, after payroll deductions and tax" />
        <Kpi label="Monthly in-hand: new regime" value={formatINR(newR.monthly_average.in_hand_salary)} better="higher" sub="Average, after payroll deductions and tax" />
        {(() => {
          const view = result.regimes[inputs.profile.selected_regime ?? cmp.best_regime].monthly;
          return view ? (
            <Kpi label="TDS still to be deducted this year" value={formatINR(view.tax_still_due)}
              sub={view.projected_months
                ? `${formatINR(view.suggested_tds_per_remaining_month)} / month over ${view.projected_months} remaining month(s)`
                : view.expected_refund ? `Refund expected: ${formatINR(view.expected_refund)}` : 'All months are actual'} />
          ) : null;
        })()}
        <Kpi label="Annual employer NPS (current)" value={formatINR(employerNps)} sub={employerNps ? `${formatINR(employerNps / 12)} / month, not paid as cash` : 'None entered'} />
        {payslip ? (
          <>
            <Kpi label="Monthly in-hand before optimisation" value={formatINR(payslip.before.net_in_hand_monthly)} better="higher"
              sub={`${payslip.before.regime} regime · TDS ${payslip.before.tds_basis === 'average' ? 'average' : 'from payroll'}`} />
            <Kpi label="Monthly in-hand after optimisation" value={formatINR(payslip.after.net_in_hand_monthly)} better="higher"
              sub={`${payslip.after.regime} regime · set on the NPS Optimizer tab`} />
            <Kpi label="Annual corporate NPS after optimisation" value={formatINR(payslip.after.employer_nps_monthly * 12)}
              sub={`${formatINR(payslip.after.employer_nps_monthly)} / month, not cash`} />
            <Kpi label="Net monthly cash impact" value={formatINR(payslip.difference.monthly_cash_change)} better="higher"
              sub={`Plus ${formatINR(payslip.difference.monthly_nps_change)} / month into NPS; tax saved ${formatINR(payslip.difference.annual_tax_saved)} / year`} />
          </>
        ) : <Kpi label="Before vs after optimisation" value="…" sub="Calculating" />}
      </div>

      <div style={{
        padding: '14px 18px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.6,
        background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--text-secondary)',
      }}>
        <strong style={{ color: '#10b981' }}>{best.label}</strong>{' '}
        {savings > 0 ? <>saves <strong style={{ color: 'var(--text-primary)' }}>{formatINR(savings)}</strong> a year ({formatINR(savings / 12)} a month). </> : 'gives the same tax. '}
        {cmp.explanation}
      </div>

      <Section title="Checks and notes" subtitle="Validation results, limits that were applied, and how far each rule used here is verified.">
        <WarningList warnings={result.warnings} />
        {!result.warnings.length && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No issues found.</span>}
      </Section>
    </div>
  );
};
