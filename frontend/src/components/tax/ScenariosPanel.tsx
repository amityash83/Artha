import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Save, Trash2, Upload } from 'lucide-react';
import { TaxPlannerInputs, TaxScenario, TaxScenarioSummary } from '../../types';
import { toEngineInputs } from './plannerInputs';
import { apiJson, EmptyState, ErrorBanner, formatINR, Pill, Section } from './taxUi';

interface RecalcResult {
  original: TaxScenarioSummary;
  recalculated: TaxScenarioSummary;
  rules_changed: boolean;
  old_regime_tax_change: number;
  new_regime_tax_change: number;
}

interface ScenariosPanelProps {
  inputs: TaxPlannerInputs;
  financialYear: string;
  onLoad: (inputs: TaxPlannerInputs, financialYear: string) => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const signed = (v: number) => (v === 0 ? 'no change' : `${v > 0 ? '+' : '−'}${formatINR(Math.abs(v))}`);

export const ScenariosPanel: React.FC<ScenariosPanelProps> = ({ inputs, financialYear, onLoad, showToast }) => {
  const [scenarios, setScenarios] = useState<TaxScenarioSummary[] | null>(null);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recalc, setRecalc] = useState<RecalcResult | null>(null);

  const load = useCallback(() => {
    apiJson<TaxScenarioSummary[]>('/api/tax/scenarios').then(setScenarios).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(async () => {
    await apiJson('/api/tax/scenarios', {
      method: 'POST',
      body: JSON.stringify({ name, notes: notes || null, inputs: toEngineInputs(inputs), financial_year: financialYear }),
    });
    setName('');
    setNotes('');
    showToast?.('Scenario saved', 'success');
    load();
  });

  const loadScenario = (id: number) => run(async () => {
    const s = await apiJson<TaxScenario>(`/api/tax/scenarios/${id}`);
    onLoad(s.inputs, s.financial_year);
    showToast?.(`Loaded "${s.name}"`, 'info');
  });

  const recalculate = (id: number) => run(async () => {
    const r = await apiJson<RecalcResult>(`/api/tax/scenarios/${id}/recalculate`, { method: 'POST' });
    setRecalc(r);
    load();
  });

  const remove = (s: TaxScenarioSummary) => {
    if (!window.confirm(`Delete scenario "${s.name}"? This can't be undone.`)) return;
    run(async () => {
      await apiJson(`/api/tax/scenarios/${s.id}`, { method: 'DELETE' });
      showToast?.('Scenario deleted', 'success');
      load();
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {error && <ErrorBanner message={error} />}

      <Section title="Save current inputs as a scenario"
        subtitle={`Saves your inputs, the full computation with its audit trail, and the exact rule set version used for FY ${financialYear}. Saved results never change, even if the rules are edited later.`}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: '1 1 220px' }}>
            <label htmlFor="sc-name" className="form-label" style={{ fontSize: '12px' }}>Name</label>
            <input id="sc-name" className="form-input" style={{ padding: '8px 10px', fontSize: '13px' }} value={name}
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Current payroll" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: '2 1 280px' }}>
            <label htmlFor="sc-notes" className="form-label" style={{ fontSize: '12px' }}>Notes (optional)</label>
            <input id="sc-notes" className="form-input" style={{ padding: '8px 10px', fontSize: '13px' }} value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Assumptions, payroll policy confirmations…" />
          </div>
          <button className="btn btn-primary" style={{ padding: '8px 16px', display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={save} disabled={busy || !name.trim()}>
            <Save size={14} /> Save scenario
          </button>
        </div>
      </Section>

      {recalc && (
        <div role="status" style={{
          padding: '12px 16px', borderRadius: '12px', fontSize: '12.5px', lineHeight: 1.6,
          background: 'var(--info-bg)', border: '1px solid rgba(59, 130, 246, 0.3)', color: 'var(--text-secondary)',
        }}>
          Recalculated <strong style={{ color: 'var(--text-primary)' }}>{recalc.original.name}</strong> under{' '}
          {recalc.recalculated.rule_set_id} v{recalc.recalculated.rule_set_version}
          {recalc.rules_changed ? '' : ' (same rules as before)'}: old regime {signed(recalc.old_regime_tax_change)},
          new regime {signed(recalc.new_regime_tax_change)}. Saved as "{recalc.recalculated.name}"; the original is unchanged.
        </div>
      )}

      <Section title="Saved scenarios">
        {!scenarios ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Loading…</span> : scenarios.length === 0 ? (
          <EmptyState>No saved scenarios yet.</EmptyState>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Scenario</th><th>FY</th><th>Rules used</th>
                  <th style={{ textAlign: 'right' }}>Old regime</th><th style={{ textAlign: 'right' }}>New regime</th>
                  <th>Saved</th><th />
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id}>
                    <td style={{ color: 'var(--text-primary)' }}>
                      {s.name}
                      {s.recalculated_from && <div><Pill color="#60a5fa">Recalculated from #{s.recalculated_from}</Pill></div>}
                      {s.notes && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.notes}</div>}
                    </td>
                    <td>{s.financial_year}</td>
                    <td style={{ fontSize: '12px' }}>{s.rule_set_id} v{s.rule_set_version}</td>
                    <td style={{ textAlign: 'right', fontWeight: s.best_regime === 'old' ? 700 : 400 }}>{formatINR(s.old_total_tax)}</td>
                    <td style={{ textAlign: 'right', fontWeight: s.best_regime === 'new' ? 700 : 400 }}>{formatINR(s.new_total_tax)}</td>
                    <td style={{ fontSize: '12px' }}>{s.computed_at.replace('T', ' ')}</td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', display: 'flex', gap: '4px', alignItems: 'center' }}
                          onClick={() => loadScenario(s.id)} disabled={busy} title="Load these inputs into the planner">
                          <Upload size={12} /> Load
                        </button>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '11.5px', display: 'flex', gap: '4px', alignItems: 'center' }}
                          onClick={() => recalculate(s.id)} disabled={busy} title="Recompute under the rules that currently apply to this year, as a new scenario">
                          <RefreshCw size={12} /> Recalculate
                        </button>
                        <button className="btn btn-secondary" aria-label={`Delete ${s.name}`} style={{ padding: '4px 8px' }}
                          onClick={() => remove(s)} disabled={busy}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
};
