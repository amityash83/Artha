import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { formatDate, formatINR } from '../format';
import { AmountInput } from './settings/ui';

interface RateChange {
  id: number;
  effective_date: string;
  rate: number;
  emi: number | null;
  previous_rate: number | null;
  previous_emi: number | null;
}

/** The terms in force today, as backend main.loan_terms_on works them out. */
function termsToday(changes: RateChange[]): { rate: number; emi: number | null } | null {
  if (!changes.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  let rate = changes[0].previous_rate ?? changes[0].rate;
  let emi = changes[0].previous_emi;
  for (const c of changes) {
    if (c.effective_date > today) break;
    rate = c.rate;
    if (c.emi) emi = c.emi;
  }
  return { rate, emi };
}

/**
 * Rate history for a floating-rate loan: each change applies from its date (interest posted
 * from then uses it); past entries are never rewritten. Saved straight away, like documents.
 * onTermsChange keeps the form's own rate/EMI boxes in step, so saving the form afterwards
 * can't put back stale figures.
 */
export const LoanRateChangesEditor: React.FC<{ loanId: number; onTermsChange: (rate: number, emi: number | null) => void }> = ({ loanId, onTermsChange }) => {
  const [changes, setChanges] = useState<RateChange[]>([]);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [rate, setRate] = useState(0);
  const [bankChangedEmi, setBankChangedEmi] = useState(false);
  const [emi, setEmi] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`${API_BASE_URL}/api/liabilities/${loanId}/rate-changes`).catch(() => null);
    const list: RateChange[] = res?.ok ? await res.json() : [];
    setChanges(list);
    return list;
  };
  useEffect(() => { void load(); }, [loanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const after = async (res: Response | null) => {
    if (!res?.ok) {
      setError((await res?.json().catch(() => null))?.detail ?? "Couldn't save the change");
      return;
    }
    setError(null);
    const terms = termsToday(await load());
    if (terms) onTermsChange(terms.rate, terms.emi);
  };
  const add = async () => {
    if (!(rate > 0)) { setError('Enter the new rate'); return; }
    await after(await fetch(`${API_BASE_URL}/api/liabilities/${loanId}/rate-changes`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ effective_date: day, rate, emi: bankChangedEmi && emi > 0 ? emi : null }),
    }).catch(() => null));
    setRate(0); setEmi(0); setBankChangedEmi(false);
  };
  const remove = async (id: number) => after(await fetch(`${API_BASE_URL}/api/liabilities/${loanId}/rate-changes/${id}`, { method: 'DELETE' }).catch(() => null));

  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="df-field df-wide lr-history">
      <span className="df-label">Rate history</span>
      <span className="df-hint">For a floating rate: record each change from the bank's letter. Interest from that date uses the new rate; earlier entries stay as they are.</span>
      {changes.length > 0 && (
        <div className="df-checks">
          {changes.map((c) => (
            <div key={c.id} className="df-check lr-row">
              <span className="lr-text">
                <span>From {formatDate(c.effective_date)}: <strong>{c.rate}%</strong>{c.previous_rate != null && changes[0].id === c.id ? ` (was ${c.previous_rate}%)` : ''}</span>
                <small>{c.emi ? `EMI changed to ${formatINR(c.emi)}` : 'EMI unchanged, so the tenure moves'}{c.effective_date > today ? ' · not yet in force' : ''}</small>
              </span>
              <button type="button" className="settings-link settings-link--danger" onClick={() => void remove(c.id)}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="lr-add">
        <input type="date" className="form-control" aria-label="Rate change date" value={day} onChange={(e) => setDay(e.target.value)} />
        <AmountInput label="New rate" suffix="%" width={60} value={rate} onChange={setRate} />
        <select className="form-control" aria-label="What the bank did" value={bankChangedEmi ? 'emi' : 'tenure'} onChange={(e) => setBankChangedEmi(e.target.value === 'emi')}>
          <option value="tenure">EMI stays, tenure changes</option>
          <option value="emi">EMI changes</option>
        </select>
        {bankChangedEmi && <AmountInput label="New EMI" prefix="₹" width={90} value={emi} onChange={setEmi} />}
        <button type="button" className="settings-btn" onClick={() => void add()}>Add change</button>
      </div>
      {error && <span className="df-hint" style={{ color: '#fca5a5' }}>{error}</span>}
    </div>
  );
};
