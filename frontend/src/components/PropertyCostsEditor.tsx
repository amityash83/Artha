import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { formatDate, formatINR } from '../format';
import { AmountInput } from './settings/ui';

interface CostSummary {
  entries: { id: number; cost_date: string; kind: string; amount: number; notes: string }[];
  kinds: Record<string, { label: string; tax_cost: boolean }>;
  loans: { id: number; name: string; interest: number }[];
  interest_recorded: number;
  value: number;
  tax_cost: number;
  total_paid: number;
  net_rent: number;
  gain_for_tax: number;
  gain_overall: number;
  notes: string[];
}

const signed = (v: number) => `${v < 0 ? '−' : '+'}${formatINR(Math.abs(v))}`;

/**
 * What a property cost: a dated list by kind, giving the cost for capital gains (purchase,
 * stamp duty and registration, buying costs, improvements) and the total actually paid
 * (those plus maintenance, loan fees and the loans' interest). Saved straight away.
 */
export const PropertyCostsEditor: React.FC<{ assetId: number }> = ({ assetId }) => {
  const [s, setS] = useState<CostSummary | null>(null);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [kind, setKind] = useState('stamp_registration');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const call = async (path: string, init?: RequestInit) => {
    const res = await fetch(`${API_BASE_URL}/api/assets/${assetId}/property-costs${path}`, init).catch(() => null);
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.detail ?? "Couldn't save"); return; }
    setError(null);
    setS(await res.json());
  };
  useEffect(() => { void call(''); }, [assetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = async () => {
    if (!(amount > 0)) { setError('Enter an amount'); return; }
    await call('', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cost_date: day, kind, amount, notes }) });
    setAmount(0); setNotes('');
  };

  if (!s) return null;
  return (
    <div className="df-field df-wide pc-costs">
      <span className="df-label">What this property cost</span>
      <div className="pc-summary">
        <div><span className="cc-label">Value today</span><strong>{formatINR(s.value)}</strong></div>
        <div><span className="cc-label">Cost for tax</span><strong>{formatINR(s.tax_cost)}</strong><span className="cc-note">gain {signed(s.gain_for_tax)}</span></div>
        <div><span className="cc-label">Total paid</span><strong>{formatINR(s.total_paid)}</strong>
          <span className="cc-note">overall {signed(s.gain_overall)}{s.net_rent ? `, incl. rent less expenses ${signed(s.net_rent)}` : ''}</span></div>
      </div>
      <span className="df-hint">
        Cost for tax: purchase, stamp duty and registration, buying costs and improvements, which capital gains are worked out from.
        Total paid adds maintenance, loan fees and loan interest{s.interest_recorded ? ` (${formatINR(s.interest_recorded)} recorded on ${s.loans.map((l) => l.name).join(', ')})` : ''}.
        Interest generally isn't part of the tax cost; check with your CA if you never deducted it.
      </span>
      {s.notes.map((n) => <span key={n} className="df-hint" style={{ color: 'var(--warning)' }}>{n}</span>)}

      {s.entries.length > 0 && (
        <div className="df-checks">
          {s.entries.map((e) => (
            <div key={e.id} className="df-check lr-row">
              <span className="lr-text">
                <span>{s.kinds[e.kind]?.label ?? e.kind}: <strong>{formatINR(e.amount)}</strong></span>
                <small>{[formatDate(e.cost_date), s.kinds[e.kind]?.tax_cost ? 'counts for tax' : 'total paid only', e.notes || null].filter(Boolean).join(' · ')}</small>
              </span>
              <button type="button" className="settings-link settings-link--danger" onClick={() => void call(`/${e.id}`, { method: 'DELETE' })}>Remove</button>
            </div>
          ))}
        </div>
      )}
      <div className="lr-add">
        <input type="date" className="form-control" aria-label="Date" value={day} onChange={(e) => setDay(e.target.value)} />
        <select className="form-control" aria-label="Kind of cost" value={kind} onChange={(e) => setKind(e.target.value)}>
          {Object.entries(s.kinds).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <AmountInput label="Amount" prefix="₹" width={100} value={amount} onChange={setAmount} />
        <input className="form-control pc-note" aria-label="Note" placeholder="Note (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button type="button" className="settings-btn" onClick={() => void add()}>Add cost</button>
      </div>
      {error && <span className="df-hint" style={{ color: '#fca5a5' }}>{error}</span>}
    </div>
  );
};
