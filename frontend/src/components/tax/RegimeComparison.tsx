import React from 'react';
import { TaxRegimeComputation } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { EmptyState, formatINR, formatPct, Section } from './taxUi';

export interface ComparisonRow {
  label: string;
  value: (r: TaxRegimeComputation) => number;
  format?: 'money' | 'pct';
  strong?: boolean;
  hint?: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { label: 'Gross salary', value: (r) => r.gross_salary },
  { label: 'Salary exemptions', value: (r) => r.salary_exemptions, hint: 'HRA and allowance exemptions' },
  { label: 'Standard deduction', value: (r) => r.standard_deduction },
  { label: 'Other income', value: (r) => r.other_income + r.house_property_income + r.special_rate_income, hint: 'Including house property and capital gains' },
  { label: 'Total deductions', value: (r) => r.deductions_total + r.professional_tax_deduction, hint: 'Chapter VI-A deductions plus professional tax' },
  { label: 'Taxable income', value: (r) => r.total_income, strong: true },
  { label: 'Tax before rebate', value: (r) => r.tax_before_rebate },
  { label: 'Rebate', value: (r) => r.rebate },
  { label: 'Surcharge', value: (r) => r.surcharge },
  { label: 'Cess', value: (r) => r.cess },
  { label: 'Total annual tax', value: (r) => r.total_tax, strong: true },
  { label: 'Average monthly tax', value: (r) => r.monthly_average.tax, strong: true },
  { label: 'Effective tax rate', value: (r) => r.effective_rate_pct, format: 'pct', hint: 'Total tax ÷ gross total income' },
  { label: 'Marginal tax rate', value: (r) => r.marginal_rate_pct, format: 'pct', hint: 'Tax on the next rupee, including surcharge and cess' },
  { label: 'Annual in-hand salary', value: (r) => r.in_hand_salary_annual },
  { label: 'Monthly in-hand salary', value: (r) => r.monthly_average.in_hand_salary, hint: 'Average' },
];

const cell: React.CSSProperties = { padding: '9px 12px', fontSize: '13px', borderBottom: '1px solid var(--border-glass)', textAlign: 'right', whiteSpace: 'nowrap' };

/** The full old-vs-new table. On the Summary the headline above it already says which is cheaper (hideBanner). */
export const RegimeComparison: React.FC<PlannerChildProps & { hideBanner?: boolean }> = ({ result, hideBanner }) => {
  if (!result) return <EmptyState>Computing…</EmptyState>;
  const { old: oldR, new: newR } = result.regimes;
  const cmp = result.comparison;
  const fmt = (v: number, format?: 'money' | 'pct') => (format === 'pct' ? formatPct(v) : formatINR(v));
  const fmtDiff = (v: number, format?: 'money' | 'pct') => {
    if (Math.abs(v) < 0.005) return '—';
    const sign = v > 0 ? '+' : '−';
    return format === 'pct' ? `${sign}${Math.abs(v).toFixed(2)} pts` : `${sign}${formatINR(Math.abs(v))}`;
  };
  const savings = cmp.savings_old_minus_new;
  const cheaper = savings > 0 ? 'new' : savings < 0 ? 'old' : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {!hideBanner && <div style={{
        padding: '14px 18px', borderRadius: '12px', fontSize: '13px', lineHeight: 1.6,
        background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.25)', color: 'var(--text-secondary)',
      }}>
        {cheaper ? (
          <>
            The <strong style={{ color: '#10b981' }}>{cheaper} regime</strong> is cheaper by{' '}
            <strong style={{ color: 'var(--text-primary)' }}>{formatINR(Math.abs(savings))}</strong> a year
            ({formatINR(Math.abs(cmp.monthly_savings_old_minus_new))} a month
            {cmp.savings_pct_of_old !== null && `, ${Math.abs(cmp.savings_pct_of_old).toFixed(1)}% of old-regime tax`}). {cmp.explanation}
          </>
        ) : <>Both regimes give the same tax. {cmp.explanation}</>}
      </div>}

      <Section title="Old vs new regime" subtitle="Difference = old regime − new regime. A positive tax difference means the new regime saves that much.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Metric', 'Old regime', 'New regime', 'Difference (old − new)'].map((h, i) => (
                  <th key={h} scope="col" style={{ ...cell, textAlign: i === 0 ? 'left' : 'right', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', letterSpacing: '0.4px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON_ROWS.map((row) => {
                const o = row.value(oldR);
                const n = row.value(newR);
                return (
                  <tr key={row.label}>
                    <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: row.strong ? 700 : 500, color: row.strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      {row.label}
                      {row.hint && <div style={{ fontSize: '10.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{row.hint}</div>}
                    </th>
                    <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: row.strong ? 700 : 400 }}>{fmt(o, row.format)}</td>
                    <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: row.strong ? 700 : 400 }}>{fmt(n, row.format)}</td>
                    <td style={{ ...cell, color: 'var(--text-secondary)' }}>{fmtDiff(o - n, row.format)}</td>
                  </tr>
                );
              })}
              <tr>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)' }}>Annual tax savings with the new regime</th>
                <td style={cell} colSpan={2} />
                <td style={{ ...cell, fontWeight: 700, color: savings >= 0 ? '#10b981' : 'var(--warning)' }}>{fmtDiff(savings)}</td>
              </tr>
              <tr>
                <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: 700, color: 'var(--text-primary)' }}>Monthly tax savings with the new regime</th>
                <td style={cell} colSpan={2} />
                <td style={{ ...cell, fontWeight: 700, color: savings >= 0 ? '#10b981' : 'var(--warning)' }}>{fmtDiff(cmp.monthly_savings_old_minus_new)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Monthly figures are annual ÷ 12. Actual payroll TDS is usually uneven across months.
        </div>
      </Section>
    </div>
  );
};
