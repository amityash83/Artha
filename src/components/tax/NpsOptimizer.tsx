import React from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { TaxInputMetadata, TaxNpsScenario, TaxNpsScenariosResult, TaxOptimization, TaxPlannerInputs } from '../../types';
import { npsRequest } from './plannerInputs';
import { EmptyState, ErrorBanner, fieldGrid, Freshness, formatINR, formatPct, NumberField, Pill, Section, SelectField } from './taxUi';
import { NpsScenarioCharts } from './TaxChartViews';
import { useTaxPost } from './useTaxPost';

export interface OptimizationProps {
  inputs: TaxPlannerInputs;
  financialYear: string;
  metadata: TaxInputMetadata;
  optimization: TaxOptimization;
  setOptimization: (next: TaxOptimization) => void;
}

type Row = { label: string; value: (s: TaxNpsScenario) => string; strong?: boolean; hint?: string };

const ROWS: Row[] = [
  { label: 'Employer NPS (annual)', value: (s) => formatINR(s.employer_nps_annual), strong: true },
  { label: 'Employer NPS (monthly)', value: (s) => formatINR(s.employer_nps_monthly) },
  { label: 'Deductible employer NPS', value: (s) => formatINR(s.deductible_employer_nps), hint: 'Within the regime limit and aggregate cap' },
  { label: 'Taxable income before', value: (s) => formatINR(s.taxable_income_before) },
  { label: 'Taxable income after', value: (s) => formatINR(s.taxable_income_after) },
  { label: 'Annual tax before', value: (s) => formatINR(s.tax_before) },
  { label: 'Annual tax after', value: (s) => formatINR(s.tax_after), strong: true },
  { label: 'Annual tax saved', value: (s) => formatINR(s.tax_saved_annual), strong: true },
  { label: 'Monthly tax saved', value: (s) => formatINR(s.tax_saved_monthly) },
  { label: 'Tax saved per ₹1 of NPS', value: (s) => (s.tax_saved_per_rupee === null ? '—' : `₹${s.tax_saved_per_rupee.toFixed(2)}`), hint: 'Varies by level: surcharge thresholds and marginal relief' },
  { label: 'Cash salary reduction (annual)', value: (s) => formatINR(s.cash_reduction_annual) },
  { label: 'Cash salary reduction (monthly)', value: (s) => formatINR(s.cash_reduction_monthly) },
  { label: 'In-hand salary (annual)', value: (s) => formatINR(s.in_hand_annual) },
  { label: 'In-hand salary (monthly)', value: (s) => formatINR(s.in_hand_monthly), strong: true },
  { label: 'Change in monthly in-hand', value: (s) => formatINR(s.in_hand_change_monthly) },
  { label: 'Effective tax rate before → after', value: (s) => `${formatPct(s.effective_rate_before_pct)} → ${formatPct(s.effective_rate_after_pct)}` },
  { label: 'Additional retirement investment', value: (s) => formatINR(s.additional_retirement_investment_annual) },
  { label: 'Net economic benefit (annual)', value: (s) => formatINR(s.net_economic_benefit_annual), strong: true, hint: 'Change in in-hand cash + change in employer NPS' },
  { label: 'CTC before → after', value: (s) => `${formatINR(s.ctc_before)} → ${formatINR(s.ctc_after)}` },
  { label: 'Regime used', value: (s) => (s.regime === 'new' ? 'New' : 'Old') },
];

const cell: React.CSSProperties = { padding: '8px 10px', fontSize: '12.5px', borderBottom: '1px solid var(--border-glass)', textAlign: 'right', whiteSpace: 'nowrap' };

export const NpsOptimizer: React.FC<OptimizationProps> = ({ inputs, financialYear, metadata, optimization: opt, setOptimization }) => {
  const { data, error, loading, stale } = useTaxPost<TaxNpsScenariosResult>('/api/tax/nps-scenarios', npsRequest(inputs, financialYear, opt), !!financialYear);
  const set = (patch: Partial<TaxOptimization>) => setOptimization({ ...opt, ...patch });
  const cashComponents = metadata.salary_components.filter((f) => f.kind !== 'basic' && f.kind !== 'da')
    .concat(Object.keys(inputs.salary).filter((k) => !metadata.salary_components.some((f) => f.key === k)).map((k) => ({ key: k, label: k })));

  const isChosen = (s: TaxNpsScenario) => (opt.mode === 'pct' ? s.pct_of_base === opt.employer_nps_pct
    : s.pct_of_base === null && Math.abs(s.employer_nps_monthly - opt.employer_nps_monthly) < 0.5);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Section title="How the contribution is funded"
        subtitle="Restructuring moves part of your existing cash salary into NPS (CTC unchanged). Over CTC adds NPS on top (cash unchanged, CTC rises). Every scenario is a full tax computation.">
        <div style={fieldGrid}>
          <SelectField id="nps-funding" label="Funding method" value={opt.funding}
            options={[{ value: 'restructure', label: 'A. Restructure existing salary' }, { value: 'over_ctc', label: 'B. Over and above CTC' }]}
            onChange={(v) => set({ funding: v as TaxOptimization['funding'] })} />
          {opt.funding === 'restructure' && (
            <SelectField id="nps-from" label="Take it from" value={opt.restructure_from}
              options={cashComponents.map((f) => ({ value: f.key, label: f.label }))}
              onChange={(v) => set({ restructure_from: v })} help="The cash component your employer would reduce." />
          )}
          <SelectField id="nps-regime" label="Regime" value={opt.regime}
            options={[{ value: 'best', label: 'Whichever is cheaper' }, { value: 'new', label: 'New regime' }, { value: 'old', label: 'Old regime' }]}
            onChange={(v) => set({ regime: v as TaxOptimization['regime'] })} />
          <NumberField id="nps-base" label="Salary base for % (blank = basic + DA)" value={opt.salary_base_override ?? 0}
            onChange={(v) => set({ salary_base_override: v > 0 ? v : null })}
            help={data ? `Using ${formatINR(data.salary_base_annual)} (${data.salary_base_source}).` : undefined} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label htmlFor="nps-offered" className="form-label" style={{ fontSize: '12px' }}>Levels your employer offers (%)</label>
            <input id="nps-offered" className="form-input" style={{ padding: '8px 10px', fontSize: '13px' }} placeholder="e.g. 10, 14 (blank = not confirmed)"
              value={opt.offered_pcts} onChange={(e) => set({ offered_pcts: e.target.value })} />
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Not every employer offers every level; unconfirmed levels are flagged.</span>
          </div>
          <SelectField id="nps-custom-mode" label="Custom level" value={opt.mode}
            options={[{ value: 'pct', label: '% of salary base' }, { value: 'monthly', label: 'Fixed monthly amount' }]}
            onChange={(v) => set({ mode: v as TaxOptimization['mode'] })} />
          {opt.mode === 'pct'
            ? <NumberField id="nps-custom-pct" label="Contribution %" value={opt.employer_nps_pct} max={100} step={0.5}
                onChange={(v) => set({ employer_nps_pct: v })} help="Standard levels 0/5/10/12/14% are always shown; other values add a custom column." />
            : <NumberField id="nps-custom-monthly" label="Monthly employer NPS" value={opt.employer_nps_monthly}
                onChange={(v) => set({ employer_nps_monthly: v })} />}
        </div>
      </Section>

      {error && <ErrorBanner message={error} />}
      {!data ? <EmptyState>{loading ? 'Comparing contribution levels…' : 'No results.'}</EmptyState> : (
        <Freshness stale={stale}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Section title="Scenario comparison"
            subtitle={<>Before: {data.before.regime === 'new' ? 'new' : 'old'} regime tax {formatINR(data.before.tax)}, in-hand {formatINR(data.before.in_hand_monthly)} a month,
              current employer NPS {formatINR(data.current_employer_nps_annual)} a year. {data.definitions.net_economic_benefit}</>}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...cell, textAlign: 'left', fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Metric</th>
                    {data.scenarios.map((s) => (
                      <th key={s.label} scope="col" style={{ ...cell, fontSize: '11.5px', color: 'var(--text-primary)', background: isChosen(s) ? 'rgba(139,92,246,0.08)' : undefined }}>
                        {s.pct_of_base !== null ? `${s.pct_of_base}%` : s.label.replace('Custom: ', '')}
                        {!s.feasible && <div><Pill color="#f59e0b">Not feasible</Pill></div>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ROWS.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" style={{ ...cell, textAlign: 'left', fontWeight: row.strong ? 700 : 500, color: row.strong ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                        {row.label}
                        {row.hint && <div style={{ fontSize: '10.5px', fontWeight: 400, color: 'var(--text-muted)' }}>{row.hint}</div>}
                      </th>
                      {data.scenarios.map((s) => (
                        <td key={s.label} style={{ ...cell, color: 'var(--text-primary)', fontWeight: row.strong ? 700 : 400, background: isChosen(s) ? 'rgba(139,92,246,0.08)' : undefined }}>
                          {row.value(s)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" style={{ ...cell, textAlign: 'left' }} />
                    {data.scenarios.map((s) => (
                      <td key={s.label} style={cell}>
                        {isChosen(s) ? <span style={{ fontSize: '11.5px', color: '#10b981', display: 'inline-flex', gap: '4px', alignItems: 'center' }}><CheckCircle2 size={12} /> In payslip</span> : (
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11px' }}
                            onClick={() => set(s.pct_of_base !== null ? { mode: 'pct', employer_nps_pct: s.pct_of_base } : { mode: 'monthly', employer_nps_monthly: s.employer_nps_monthly })}>
                            Use in payslip
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Flags" subtitle="Limits, caps and employer-policy assumptions for each scenario.">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {data.scenarios.flatMap((s) => s.flags.map((f, i) => (
                <li key={`${s.label}-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  <AlertTriangle size={13} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
                  <span><strong style={{ color: 'var(--text-primary)' }}>{s.label}:</strong> {f.message}</span>
                </li>
              )))}
              {data.scenarios.every((s) => !s.flags.length) && <li style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No flags.</li>}
            </ul>
          </Section>

          <NpsScenarioCharts nps={data} />
        </div>
        </Freshness>
      )}
    </div>
  );
};
