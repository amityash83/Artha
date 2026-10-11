import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { TaxInputMetadata, TaxPlannerInputs, TaxPrefillItem, TaxPrefillResult } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';
import { apiJson, formatINR, Pill } from './taxUi';
import { getIn, MONTHS, setIn } from './plannerInputs';

const BASIS: Record<TaxPrefillItem['basis'], { label: string; color: string; title: string }> = {
  recorded: { label: 'Recorded', color: '#10b981', title: 'Taken straight from your records for this year' },
  estimate: { label: 'Estimate', color: '#60a5fa', title: 'Worked out from your records; check against a statement' },
  guess: { label: 'Guess', color: '#f59e0b', title: 'Inferred from a name; untick if it is wrong' },
};

/** Fixed (non-variable) salary components: what 'salary_total' scales. */
const fixedKeys = (inputs: TaxPlannerInputs, metadata: TaxInputMetadata) => {
  const variable = new Set(metadata.salary_components.filter((f) => f.variable).map((f) => f.key));
  return Object.keys(inputs.salary).filter((k) => !variable.has(k));
};

export function currentValue(inputs: TaxPlannerInputs, metadata: TaxInputMetadata, target: string): number {
  if (target === 'salary_total') return fixedKeys(inputs, metadata).reduce((t, k) => t + (inputs.salary[k] || 0), 0);
  const v = getIn(inputs, target);
  return typeof v === 'number' ? v : 0;
}

/** Sets one target. 'salary_total' keeps the salary structure's proportions and scales it to the new total. */
export function applyTarget(inputs: TaxPlannerInputs, metadata: TaxInputMetadata, target: string, value: number): TaxPlannerInputs {
  if (target !== 'salary_total') {
    let next = setIn(inputs, target, value);
    if (target === 'hra.rent_paid_monthly' && value > 0 && !inputs.hra.months_rented) next = setIn(next, 'hra.months_rented', MONTHS);
    return next;
  }
  const keys = fixedKeys(inputs, metadata);
  const total = keys.reduce((t, k) => t + (inputs.salary[k] || 0), 0);
  const salary = { ...inputs.salary };
  if (total > 0) keys.forEach((k) => { salary[k] = Math.round((salary[k] || 0) * value / total); });
  else salary.basic = Math.round(value);
  const monthly = Object.fromEntries(Object.entries(salary).map(([k, v]) => [k, Math.round(v / MONTHS)]));
  return { ...inputs, salary, salary_monthly: inputs.salary_monthly ? { ...inputs.salary_monthly, ...monthly } : null };
}

export const PrefillDialog: React.FC<{
  inputs: TaxPlannerInputs;
  metadata: TaxInputMetadata;
  financialYear: string;
  personId?: number | null; // the planner's person; the dialog can still switch
  onClose: () => void;
  onApply: (next: TaxPlannerInputs, summary: string) => void;
}> = ({ inputs, metadata, financialYear, personId: plannerPerson = null, onClose, onApply }) => {
  const modalRef = useModalA11y(true, onClose);
  const [personId, setPersonId] = useState<number | null>(plannerPerson);
  const [data, setData] = useState<TaxPrefillResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const q = new URLSearchParams({ financial_year: financialYear, ...(personId !== null ? { person_id: String(personId) } : {}) });
    setData(null);
    apiJson<TaxPrefillResult>(`/api/tax/prefill?${q}`)
      .then((d) => { setData(d); setTicked(Object.fromEntries(d.items.map((i) => [i.id, i.selected]))); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [financialYear, personId]);

  const monthlyOn = !!inputs.monthly?.enabled;
  const blocked = (t: string) => monthlyOn && !!data?.monthly_grid_targets.includes(t);
  const groups = useMemo(() => {
    const out = new Map<string, TaxPrefillItem[]>();
    data?.items.forEach((i) => out.set(i.target, [...(out.get(i.target) ?? []), i]));
    return Array.from(out.entries());
  }, [data]);
  const changes = groups
    .filter(([t, items]) => !blocked(t) && items.some((i) => ticked[i.id]))
    .map(([t, items]) => ({ target: t, label: items[0].target_label, value: Math.round(items.filter((i) => ticked[i.id]).reduce((s, i) => s + i.amount, 0)) }))
    .filter((c) => c.value !== Math.round(currentValue(inputs, metadata, c.target))); // already matches: nothing to apply

  const apply = () => {
    const next = changes.reduce((acc, c) => applyTarget(acc, metadata, c.target, c.value), inputs);
    onApply(next, `Filled ${changes.length} field${changes.length === 1 ? '' : 's'} from your Artha data.`);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby="prefill-title"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: '880px', width: '95%', maxHeight: '88vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <h3 id="prefill-title" style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>Fill from my Artha data, FY {financialYear}</h3>
          <button className="btn btn-secondary" style={{ padding: '4px 6px' }} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
          Proposed figures from your income, investments, insurance, loans and realised gains. Tick what applies: ticked items
          for the same field are added together and replace that field. Nothing changes until you apply.
        </p>
        {data && data.people.length > 0 && (
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12.5px', color: 'var(--text-secondary)', marginBottom: '10px' }}>
            Whose tax is this?
            <select className="form-input" style={{ padding: '4px 8px', fontSize: '12.5px', width: 'auto' }}
              value={data.person_id ?? ''} onChange={(e) => setPersonId(Number(e.target.value))}>
              {data.people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
            </select>
          </label>
        )}
        {error && <div role="alert" style={{ fontSize: '12.5px', color: '#fca5a5' }}>{error}</div>}
        {!data && !error && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Reading your records…</div>}
        {data && data.items.length === 0 && (
          <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>Nothing to fill for this person and year yet. Add income, investments, policies or loans elsewhere in Artha first.</div>
        )}

        {groups.map(([target, items]) => {
          const now = currentValue(inputs, metadata, target);
          const sum = items.filter((i) => ticked[i.id]).reduce((s, i) => s + i.amount, 0);
          return (
            <section key={target} style={{ borderTop: '1px solid var(--border-glass)', padding: '10px 0' }} aria-label={items[0].target_label}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', fontSize: '13px' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{items[0].target_label}</strong>
                <span style={{ color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
                  {blocked(target)
                    ? 'Set in the month-by-month grid'
                    : <>now {formatINR(now)} → <strong style={{ color: 'var(--text-primary)' }}>{items.some((i) => ticked[i.id]) ? formatINR(sum) : 'unchanged'}</strong></>}
                </span>
              </div>
              {blocked(target) && (
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Salary entry is month by month, so this comes from the grid. Switch the salary under Income to annual to fill it here.</div>
              )}
              {items.map((i) => (
                <label key={i.id} style={{ display: 'grid', gridTemplateColumns: '20px 1fr auto', gap: '8px', alignItems: 'start', padding: '6px 0', fontSize: '12.5px', opacity: blocked(target) ? 0.5 : 1 }}>
                  <input type="checkbox" checked={!!ticked[i.id]} disabled={blocked(target)}
                    onChange={(e) => setTicked((t) => ({ ...t, [i.id]: e.target.checked }))} />
                  <span style={{ color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <span style={{ color: 'var(--text-primary)' }}>{i.label}</span>{' '}
                    <Pill color={BASIS[i.basis].color} title={BASIS[i.basis].title}>{BASIS[i.basis].label}</Pill>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{i.explanation}</div>
                    {i.note && <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{i.note}</div>}
                    {i.overlap && <div style={{ fontSize: '11.5px', color: 'var(--warning)' }}>{i.overlap}</div>}
                  </span>
                  <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatINR(i.amount)}</span>
                </label>
              ))}
            </section>
          );
        })}

        {data && data.notes.length > 0 && (
          <ul style={{ fontSize: '11.5px', color: 'var(--text-muted)', paddingLeft: '18px', lineHeight: 1.6 }}>
            {data.notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        )}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', position: 'sticky', bottom: '-32px', margin: '0 -32px -32px', padding: '12px 32px 24px', background: 'var(--bg-secondary)', borderTop: '1px solid var(--border-glass)' }}>
          <button className="btn btn-secondary" style={{ padding: '6px 14px' }} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{ padding: '6px 14px' }} disabled={!changes.length} onClick={apply}>
            Apply {changes.length} field{changes.length === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
};
