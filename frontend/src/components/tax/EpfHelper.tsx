import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { TaxEpfSuggestion, TaxPlannerInputs } from '../../types';
import { epfWages } from './plannerInputs';
import { formatINR, Pill, VERIFICATION_STYLES } from './taxUi';
import { useTaxPost } from './useTaxPost';

type Basis = TaxEpfSuggestion['basis'];

/** "Apr–Aug ₹1,800 · Sep ₹2,360 · Oct–Mar ₹3,000": consecutive months with the same figure grouped. */
function runs(s: TaxEpfSuggestion): string {
  const out: string[] = [];
  let start = 0;
  s.months.forEach((m, i) => {
    const next = s.months[i + 1];
    if (next && next.epf === m.epf) return;
    const name = (j: number) => s.months[j].label.split(' ')[0];
    out.push(`${start === i ? name(i) : `${name(start)}–${name(i)}`} ${formatINR(m.epf)}`);
    start = i + 1;
  });
  return out.join(' · ');
}

/**
 * Suggests Employee EPF from basic + DA using the dated EPFO wage ceiling (backend/tax/metadata/epf_rules.json),
 * so a ceiling change part-way through the year lands in the right months. Only a suggestion: applying it
 * fills the ordinary, editable EPF input.
 */
export const EpfHelper: React.FC<{
  inputs: TaxPlannerInputs;
  financialYear: string;
  onApply: (suggestion: TaxEpfSuggestion, scope: 'projected' | 'all') => void;
  monthly: boolean;
}> = ({ inputs, financialYear, onApply, monthly }) => {
  const [basis, setBasis] = useState<Basis>('ceiling');
  const [scope, setScope] = useState<'projected' | 'all'>('projected');
  const wages = epfWages(inputs);
  const { data, error, stale } = useTaxPost<TaxEpfSuggestion>('/api/tax/epf-suggestion',
    { financial_year: financialYear, wages, basis }, !!financialYear);
  const select: React.CSSProperties = { padding: '4px 6px', fontSize: '12px', width: 'auto' };
  const btn: React.CSSProperties = { padding: '4px 10px', fontSize: '11.5px', display: 'inline-flex', gap: '4px', alignItems: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Wand2 size={13} /> Employee EPF {data ? `${data.rate_pct}%` : ''} of basic + DA,
        <select aria-label="EPF basis" className="form-input" style={select} value={basis} onChange={(e) => setBasis(e.target.value as Basis)}>
          <option value="ceiling">capped at the EPFO wage ceiling (statutory)</option>
          <option value="full">on full basic + DA (if your employer contributes on full pay)</option>
        </select>
        {monthly && (
          <select aria-label="EPF months to fill" className="form-input" style={select} value={scope} onChange={(e) => setScope(e.target.value as 'projected' | 'all')}>
            <option value="projected">in projected months</option>
            <option value="all">in every month</option>
          </select>
        )}
        <button className="btn btn-secondary" style={btn} disabled={!data || stale} onClick={() => data && onApply(data, scope)}>Apply</button>
      </div>
      {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
      {data && (
        <div style={{ opacity: stale ? 0.55 : 1, lineHeight: 1.55 }}>
          {runs(data)} = <strong style={{ color: 'var(--text-primary)' }}>{formatINR(data.annual)}</strong> a year.
          {data.ceiling_changes.map((c) => (
            <div key={c.from} style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Wage ceiling {formatINR(c.amount)} from {new Date(c.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{' '}
              <Pill color={VERIFICATION_STYLES[c.verification].color} title={VERIFICATION_STYLES[c.verification].title}>{VERIFICATION_STYLES[c.verification].label}</Pill>
              {c.note && <> {c.note}</>}
            </div>
          ))}
          {!monthly && data.ceiling_changes.length > 0 && (
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
              Annual entry fills the year's total; the payslip under Pay & TDS then shows an average month. Switch to month by month to see each month's own EPF.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
