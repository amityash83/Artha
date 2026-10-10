import React, { useState } from 'react';
import type { OptimizationProps } from './NpsOptimizer';
import { toEngineInputs } from './plannerInputs';
import { EmptyState, ErrorBanner, Freshness, formatINR, formatPct, NumberField, Pill, Section } from './taxUi';
import { BarChart, barDataset, barOptions, ChartCard, LineChart, lineDataset, lineOptions, REGIME_COLOR, SERIES } from './taxCharts';
import { useTaxPost } from './useTaxPost';

interface SweepBase {
  old_tax: number;
  new_tax: number;
  best_regime: 'old' | 'new';
  best_tax: number;
  effective_rate_old_pct: number;
  effective_rate_new_pct: number;
  monthly_in_hand_best: number;
}

export interface SensitivityResult {
  base: SweepBase;
  current_basic_share_pct: number | null;
  break_even: {
    status: 'found' | 'old_already_cheaper';
    additional_deductions_needed: number;
    old_tax: number;
    new_tax: number;
    margin?: number;
    explanation: string;
  };
  salary_sweep: (SweepBase & { factor: number; cash_salary: number })[];
  bonus_sweep: (SweepBase & { bonus: number; extra_tax: number; bonus_kept: number; tax_rate_on_bonus_pct: number | null })[];
  bonus_month: string | null;
  basic_share_sweep: (Partial<SweepBase> & {
    basic_share_pct: number; feasible: boolean; basic?: number; hra?: number; special_allowance?: number;
    hra_exemption_old?: number; employer_nps_limit_new?: number;
  })[];
  notes: string[];
}

interface NpsTargetResult {
  status: 'found' | 'not_reachable';
  target_saving: number;
  contribution_annual?: number;
  contribution_monthly?: number;
  pct_of_salary_base?: number | null;
  saving_at_contribution?: number;
  max_saving?: number;
  contribution_at_limit?: number;
  explanation: string;
}

const pctLabel = (factor: number) => (factor === 1 ? 'Current' : `${factor > 1 ? '+' : '−'}${Math.round(Math.abs(factor - 1) * 100)}%`);
const regimeName = (r: 'old' | 'new') => (r === 'new' ? 'New' : 'Old');

export const SensitivityPanel: React.FC<OptimizationProps> = ({ inputs, financialYear, optimization: opt }) => {
  const [target, setTarget] = useState(100000);
  const engineInputs = toEngineInputs(inputs);
  const sens = useTaxPost<SensitivityResult>('/api/tax/sensitivity', { financial_year: financialYear, inputs: engineInputs }, !!financialYear);
  const nps = useTaxPost<NpsTargetResult>('/api/tax/nps-target', {
    financial_year: financialYear, inputs: engineInputs, target_saving: target, funding: opt.funding,
    restructure_from: opt.restructure_from, regime: opt.regime, salary_base_override: opt.salary_base_override,
  }, !!financialYear && target > 0);

  if (sens.error) return <ErrorBanner message={sens.error} />;
  const s = sens.data;
  if (!s) return <EmptyState>Running the analysis…</EmptyState>;
  const be = s.break_even;

  const salaryData = {
    labels: s.salary_sweep.map((r) => pctLabel(r.factor)),
    datasets: [
      lineDataset('New regime', s.salary_sweep.map((r) => r.new_tax), REGIME_COLOR.new),
      lineDataset('Old regime', s.salary_sweep.map((r) => r.old_tax), REGIME_COLOR.old),
    ],
  };
  const bonusRows = s.bonus_sweep.filter((r) => r.bonus > 0);
  const bonusData = {
    labels: bonusRows.map((r) => formatINR(r.bonus)),
    datasets: [
      barDataset('Bonus kept', bonusRows.map((r) => r.bonus_kept), SERIES[0], true),
      barDataset('Extra tax on the bonus', bonusRows.map((r) => r.extra_tax), SERIES[1], true),
    ],
  };
  const shares = s.basic_share_sweep.filter((r) => r.feasible);
  const shareData = {
    labels: shares.map((r) => `${r.basic_share_pct}%`),
    datasets: [
      lineDataset('New regime', shares.map((r) => r.new_tax ?? 0), REGIME_COLOR.new),
      lineDataset('Old regime', shares.map((r) => r.old_tax ?? 0), REGIME_COLOR.old),
    ],
  };

  return (
    <Freshness stale={sens.stale}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
          <Section title="Old-regime break-even" subtitle={be.explanation}>
            {be.status === 'found' ? (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                The old regime needs <strong style={{ color: 'var(--text-primary)', fontSize: '18px' }}>{formatINR(be.additional_deductions_needed)}</strong> more
                in deductions or exemptions a year before it costs no more than the new regime ({formatINR(be.new_tax)}).
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                The old regime is already cheaper by <strong style={{ color: '#10b981', fontSize: '18px' }}>{formatINR(be.margin ?? 0)}</strong> a year
                ({formatINR(be.old_tax)} vs {formatINR(be.new_tax)}).
              </div>
            )}
          </Section>

          <Section title="Employer NPS for a target saving"
            subtitle={`Smallest employer NPS that saves at least this much a year (${opt.funding === 'restructure' ? 'restructured from salary' : 'over CTC'}, ${opt.regime === 'best' ? 'cheaper regime' : `${opt.regime} regime`}; set these on the NPS Optimizer tab).`}>
            <NumberField id="sens-target" label="Target annual tax saving" value={target} onChange={(v) => setTarget(Math.max(v, 0))} />
            <Freshness stale={nps.stale}>
              {nps.error ? <ErrorBanner message={nps.error} /> : !nps.data ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Calculating…</span> : nps.data.status === 'found' ? (
                <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <strong style={{ color: 'var(--text-primary)', fontSize: '18px' }}>{formatINR(nps.data.contribution_annual)}</strong> a year
                  ({formatINR(nps.data.contribution_monthly)} a month{nps.data.pct_of_salary_base != null ? `, ${nps.data.pct_of_salary_base}% of the salary base` : ''})
                  saves {formatINR(nps.data.saving_at_contribution)}.
                </div>
              ) : (
                <div style={{ fontSize: '13px', color: 'var(--warning)', lineHeight: 1.6 }}>
                  Not reachable. {nps.data.explanation}
                </div>
              )}
            </Freshness>
          </Section>
        </div>

        <ChartCard title="If your salary changes" subtitle="Every cash component scaled; tax in each regime from a full computation. Watch for the regimes crossing."
          table={{ columns: ['Salary', 'Cash salary', 'Old regime', 'New regime', 'Cheaper', 'Monthly in-hand'],
            rows: s.salary_sweep.map((r) => [pctLabel(r.factor), r.cash_salary, r.old_tax, r.new_tax, regimeName(r.best_regime), r.monthly_in_hand_best]) }}>
          <LineChart label="Tax by regime as salary changes" data={salaryData} options={lineOptions('inr')} />
        </ChartCard>

        <ChartCard title="What a bonus costs in tax"
          subtitle={<>Bonus added {s.bonus_month ? `in ${s.bonus_month}` : 'to the year'}, taxed in whichever regime is then cheaper. A bonus that crosses a surcharge threshold can be taxed far above your slab rate; see the rate column.</>}
          table={{ columns: ['Bonus', 'Extra tax', 'Bonus kept', 'Tax rate on the bonus', 'Cheaper regime'],
            rows: bonusRows.map((r) => [r.bonus, r.extra_tax, r.bonus_kept, r.tax_rate_on_bonus_pct != null ? `${r.tax_rate_on_bonus_pct}%` : '-', regimeName(r.best_regime)]) }}>
          <BarChart label="Bonus kept and tax on the bonus" data={bonusData} options={barOptions('inr', { stacked: true })} />
        </ChartCard>

        <Section title="Tax rate on each bonus" subtitle="Extra tax ÷ bonus. Jumps mark thresholds (surcharge, regime switch) being crossed.">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {bonusRows.map((r, i) => {
              const jumped = i > 0 && (r.tax_rate_on_bonus_pct ?? 0) > (bonusRows[i - 1].tax_rate_on_bonus_pct ?? 0) + 5;
              return (
                <div key={r.bonus} className="glass-card" style={{ padding: '8px 12px', minWidth: '130px', border: jumped ? '1px solid rgba(245,158,11,0.5)' : undefined }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{formatINR(r.bonus)}</div>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>{r.tax_rate_on_bonus_pct != null ? formatPct(r.tax_rate_on_bonus_pct) : '-'}</div>
                  {jumped && <Pill color="#f59e0b">Threshold crossed</Pill>}
                </div>
              );
            })}
          </div>
        </Section>

        <ChartCard title="If basic's share of fixed pay changes"
          subtitle={`Same total fixed pay; HRA stays the same proportion of basic and special allowance absorbs the change. Current share: ${s.current_basic_share_pct ?? '-'}%. A higher basic raises the HRA exemption cap (old regime) and the employer-NPS limit.`}
          table={{ columns: ['Basic share', 'Basic', 'HRA', 'Special', 'Old regime', 'New regime', 'HRA exempt (old)', 'Employer NPS limit (new)'],
            rows: s.basic_share_sweep.map((r) => (r.feasible
              ? [`${r.basic_share_pct}%`, r.basic ?? 0, r.hra ?? 0, r.special_allowance ?? 0, r.old_tax ?? 0, r.new_tax ?? 0, r.hra_exemption_old ?? 0, r.employer_nps_limit_new ?? 0]
              : [`${r.basic_share_pct}%`, 'not possible with this pay mix', '', '', '', '', '', ''])) }}>
          <LineChart label="Tax by regime as basic's share changes" data={shareData} options={lineOptions('inr')} />
        </ChartCard>

        <Section title="About these numbers">
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {s.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Section>
      </div>
    </Freshness>
  );
};
