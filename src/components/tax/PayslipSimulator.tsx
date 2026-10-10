import React from 'react';
import { TaxPayslipResult, TaxPayslipSide } from '../../types';
import type { OptimizationProps } from './NpsOptimizer';
import { payslipRequest } from './plannerInputs';
import { EmptyState, ErrorBanner, fieldGrid, Freshness, formatINR, NumberField, Pill, Section } from './taxUi';
import { CashFlowChart } from './TaxChartViews';
import { useTaxPost } from './useTaxPost';

const cell: React.CSSProperties = { padding: '8px 12px', fontSize: '13px', borderBottom: '1px solid var(--border-glass)', textAlign: 'right', whiteSpace: 'nowrap' };

const humanize = (k: string) => k.replace(/_/g, ' ').replace(/\bepf\b/i, 'EPF').replace(/\bvpf\b/i, 'VPF').replace(/\besic\b/i, 'ESIC')
  .replace(/\bhra\b/i, 'HRA').replace(/\bda\b/i, 'DA').replace(/^\w/, (c) => c.toUpperCase());

export const PayslipSimulator: React.FC<OptimizationProps> = ({ inputs, financialYear, metadata, optimization: opt, setOptimization }) => {
  const { data, error, loading, stale } = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, opt), !!financialYear);
  const set = (patch: Partial<typeof opt>) => setOptimization({ ...opt, ...patch });
  const labelFor = (key: string, list: { key: string; label: string }[]) => list.find((f) => f.key === key)?.label ?? humanize(key);

  const describe = opt.mode === 'pct'
    ? `employer NPS at ${opt.employer_nps_pct}% of the salary base`
    : `employer NPS of ${formatINR(opt.employer_nps_monthly)} a month`;

  const row = (label: string, b: number, a: number, opts: { strong?: boolean; hint?: string } = {}) => (
    <tr key={label}>
      <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: opts.strong ? 700 : 500, color: opts.strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
        {label}{opts.hint && <div style={{ fontSize: '10.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{opts.hint}</div>}
      </th>
      <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: opts.strong ? 700 : 400 }}>{formatINR(b)}</td>
      <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: opts.strong ? 700 : 400 }}>{formatINR(a)}</td>
      <td style={{ ...cell, color: 'var(--text-secondary)' }}>{Math.abs(a - b) < 0.5 ? '—' : `${a - b > 0 ? '+' : '−'}${formatINR(Math.abs(a - b))}`}</td>
    </tr>
  );

  const tdsHint = (side: TaxPayslipSide) => ({
    payroll_actual: `Payroll figure; engine average ${formatINR(side.engine_average_tds_monthly)}`,
    payroll_adjusted: 'Current payroll TDS moved by the computed change in tax',
    average: 'Average: annual tax ÷ 12',
  }[side.tds_basis]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Section title="What's being compared"
        subtitle={<>Before: your current inputs. After: {describe}, funded by {opt.funding === 'restructure' ? `restructuring ${labelFor(opt.restructure_from, metadata.salary_components)}` : 'adding it over CTC'}, in {opt.regime === 'best' ? 'whichever regime is cheaper' : `the ${opt.regime} regime`}. Change these on the NPS Optimizer tab.</>}>
        <div style={fieldGrid}>
          <NumberField id="ps-tds-before" label="Actual monthly TDS now (from your payslip)" value={opt.actual_monthly_tds_before ?? 0}
            onChange={(v) => set({ actual_monthly_tds_before: v > 0 ? v : null })} help="Leave at 0 to use the annual tax ÷ 12 average." />
          <NumberField id="ps-tds-after" label="Expected monthly TDS after (if payroll has told you)" value={opt.actual_monthly_tds_after ?? 0}
            onChange={(v) => set({ actual_monthly_tds_after: v > 0 ? v : null })} help="Leave at 0 to use the average." />
        </div>
      </Section>

      {error && <ErrorBanner message={error} />}
      {!data ? <EmptyState>{loading ? 'Building payslips…' : 'No results.'}</EmptyState> : (
        <Freshness stale={stale}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {!data.feasible && <ErrorBanner message={data.notes.join(' ')} />}
          {data.before.regime !== data.after.regime && (
            <div role="note" style={{
              padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5,
              background: 'var(--info-bg)', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--text-secondary)',
            }}>
              The cheaper regime changes from <strong style={{ color: 'var(--text-primary)' }}>{data.before.regime}</strong> to{' '}
              <strong style={{ color: 'var(--text-primary)' }}>{data.after.regime}</strong> with this optimisation, so the tax saved
              below includes the effect of switching regime, not just NPS. Pick a fixed regime on the NPS Optimizer tab to isolate the NPS effect.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: '12px' }}>
            {[
              ['Monthly in-hand before', data.before.net_in_hand_monthly],
              ['Monthly in-hand after', data.after.net_in_hand_monthly],
              ['Change in monthly cash', data.difference.monthly_cash_change],
              ['Invested in NPS each month', data.after.employer_nps_monthly],
              ['Annual tax saved', data.difference.annual_tax_saved],
              ['Net monthly financial impact', data.difference.net_monthly_impact],
            ].map(([label, value]) => (
              <div key={label as string} className="glass-card" style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatINR(value as number)}</div>
              </div>
            ))}
          </div>

          <Section title="Monthly payslip" subtitle={<>{data.tds_note} Monthly in-hand = cash earnings − payroll deductions − TDS. Employer NPS is not cash.</>}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Line', `Before (${data.before.regime} regime)`, `After (${data.after.regime} regime)`, 'Difference'].map((h, i) => (
                      <th key={h} scope="col" style={{ ...cell, textAlign: i ? 'right' : 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Object.keys({ ...data.before.earnings, ...data.after.earnings })
                    .filter((k) => (data.before.earnings[k] || 0) + (data.after.earnings[k] || 0) > 0)
                    .map((k) => row(labelFor(k, metadata.salary_components), data.before.earnings[k] || 0, data.after.earnings[k] || 0))}
                  {row('Gross monthly cash earnings', data.before.gross_monthly_cash, data.after.gross_monthly_cash, { strong: true })}
                  {Object.keys(data.before.payroll_deductions)
                    .filter((k) => data.before.payroll_deductions[k] || data.after.payroll_deductions[k])
                    .map((k) => row(`− ${labelFor(k, metadata.payroll_deductions)}`, data.before.payroll_deductions[k], data.after.payroll_deductions[k]))}
                  <tr>
                    <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)' }}>
                      − TDS <span style={{ marginLeft: '6px' }}><Pill color={data.before.tds_basis === 'average' ? '#f59e0b' : '#a78bfa'}>{data.before.tds_basis === 'average' ? 'Average' : 'From payroll'}</Pill></span>
                      <div style={{ fontSize: '10.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{tdsHint(data.before)} / {tdsHint(data.after)}</div>
                    </th>
                    <td style={{ ...cell, color: 'var(--text-primary)' }}>{formatINR(data.before.tds_monthly)}</td>
                    <td style={{ ...cell, color: 'var(--text-primary)' }}>{formatINR(data.after.tds_monthly)}</td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{formatINR(data.after.tds_monthly - data.before.tds_monthly)}</td>
                  </tr>
                  {row('Net monthly in-hand', data.before.net_in_hand_monthly, data.after.net_in_hand_monthly, { strong: true })}
                  {row('Employer NPS (not cash)', data.before.employer_nps_monthly, data.after.employer_nps_monthly)}
                  {row('Taxable salary (annual)', data.before.taxable_salary_annual, data.after.taxable_salary_annual)}
                  {row('Annual tax', data.before.annual_tax, data.after.annual_tax, { strong: true })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              Net annual impact (cash + NPS): <strong style={{ color: 'var(--text-primary)' }}>{formatINR(data.difference.net_annual_impact)}</strong>.
              NPS money is locked until retirement, so weigh the cash reduction against your monthly needs.
            </div>
          </Section>

          <CashFlowChart payslip={data} />
        </div>
        </Freshness>
      )}
    </div>
  );
};
