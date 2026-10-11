import React, { useState } from 'react';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';
import { AmountInput, ConfirmAction } from './settings/ui';

/**
 * Balance transfer: a loan at another bank pays this one off. The new loan keeps the
 * property, owner, use and EMI settings; this one closes as "transferred" with its history.
 */
export const LoanTransferPanel: React.FC<{
  loan: { id: number; name: string; outstanding: number; interest_rate: number; emi: number; lender_name?: string };
  institutions: { id: number; name: string }[];
  onDone: (message: string) => void;
}> = ({ loan, institutions, onDone }) => {
  const [open, setOpen] = useState(false);
  const [bank, setBank] = useState<number | ''>('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState(loan.interest_rate || 0);
  const [emi, setEmi] = useState(loan.emi || 0);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [fees, setFees] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const bankName = institutions.find((i) => i.id === bank)?.name;
  // "HDFC Top-up Loan" moving to "ICICI Bank Ltd." -> "ICICI Top-up Loan": the old lender's
  // word swapped for the new bank's name (without "Bank Ltd."); otherwise "<loan> (<bank>)".
  const short = bankName?.replace(/\s+(Bank\s+)?Ltd\.?$/i, '').replace(/\s+Bank$/i, '');
  const oldWord = loan.lender_name?.split(' ')[0];
  const newName = name || (short ? (oldWord && loan.name.startsWith(`${oldWord} `) ? `${short} ${loan.name.slice(oldWord.length + 1)}` : `${loan.name} (${short})`) : '');

  if (!(loan.outstanding > 0)) return null;
  if (!open) {
    return (
      <div className="df-field df-wide">
        <button type="button" className="settings-link df-share-link" onClick={() => setOpen(true)}>Moving this loan to another bank?</button>
      </div>
    );
  }
  const transfer = async () => {
    const res = await fetch(`${API_BASE_URL}/api/liabilities/${loan.id}/transfer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lender_institution_id: bank || null, name: newName, interest_rate: rate, emi, transfer_date: day, fees }),
    }).catch(() => null);
    if (!res?.ok) { setError((await res?.json().catch(() => null))?.detail ?? "Couldn't transfer the loan"); return; }
    onDone(`${formatINR(loan.outstanding)} moved to ${newName}`);
  };
  return (
    <div className="df-field df-wide lt-panel">
      <span className="df-label">Move to another bank (balance transfer)</span>
      <span className="df-hint">The new loan takes over {formatINR(loan.outstanding)} on the same property; this one closes as transferred, keeping its history and interest.</span>
      <div className="df-grid">
        <div className="df-field"><label className="df-label" htmlFor="lt-bank">New bank</label>
          <select id="lt-bank" className="form-control" value={bank} onChange={(e) => setBank(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Choose the bank</option>
            {[...institutions].sort((a, b) => a.name.localeCompare(b.name)).map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select></div>
        <div className="df-field"><label className="df-label" htmlFor="lt-name">New loan's name</label>
          <input id="lt-name" className="form-control" value={newName} onChange={(e) => setName(e.target.value)} placeholder="e.g. SBI Home Loan" /></div>
        <div className="df-field"><label className="df-label" htmlFor="lt-rate">New rate</label>
          <AmountInput id="lt-rate" label="New rate" suffix="%" value={rate} onChange={setRate} /></div>
        <div className="df-field"><label className="df-label" htmlFor="lt-emi">New EMI</label>
          <AmountInput id="lt-emi" label="New EMI" prefix="₹" value={emi} onChange={setEmi} /></div>
        <div className="df-field"><label className="df-label" htmlFor="lt-date">Transfer date</label>
          <input id="lt-date" type="date" className="form-control" value={day} onChange={(e) => setDay(e.target.value)} /></div>
        <div className="df-field"><label className="df-label" htmlFor="lt-fees">Fees for the move</label>
          <AmountInput id="lt-fees" label="Fees" prefix="₹" value={fees} onChange={setFees} />
          <span className="df-hint">Processing and legal fees; added to the property's costs.</span></div>
      </div>
      <div className="tx-actions">
        <ConfirmAction label="Transfer the loan" confirmLabel="Transfer" question={`Move ${formatINR(loan.outstanding)} to ${newName || 'the new loan'}?`}
          disabled={!newName.trim()} onConfirm={transfer} />
        <button type="button" className="settings-link" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <span className="df-hint" style={{ color: '#fca5a5' }}>{error}</span>}
    </div>
  );
};
