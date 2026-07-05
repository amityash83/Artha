import React, { useState, useEffect } from 'react';
import { Save, Calendar, CheckCircle, Info } from 'lucide-react';
import { InitData } from '../types';

interface SnapshotProps {
  data: InitData;
  onRefresh: () => void;
}

export const Snapshot: React.FC<SnapshotProps> = ({ data, onRefresh }) => {
  const [month, setMonth] = useState('');
  
  // Local forms state mapping item ID to its balance / value
  const [accountBalances, setAccountBalances] = useState<{[key: number]: number}>({});
  const [loanBalances, setLoanBalances] = useState<{[key: number]: number}>({});
  const [investmentValues, setInvestmentValues] = useState<{[key: number]: number}>({});
  const [propertyValues, setPropertyValues] = useState<{[key: number]: number}>({});
  
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Default to current year and month YYYY-MM
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    setMonth(`${YYYY}-${MM}`);

    // Prepopulate form states
    const accs: {[key: number]: number} = {};
    data.accounts.forEach(a => { accs[a.id] = a.current_balance; });
    setAccountBalances(accs);

    const lns: {[key: number]: number} = {};
    data.loans.forEach(l => { lns[l.id] = l.outstanding; });
    setLoanBalances(lns);

    const invs: {[key: number]: number} = {};
    data.investments.forEach(i => { invs[i.id] = i.current_value; });
    setInvestmentValues(invs);

    const props: {[key: number]: number} = {};
    data.properties.forEach(p => { props[p.id] = p.current_value; });
    setPropertyValues(props);
  }, [data]);

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      // 1. Update Accounts in active database
      for (const acc of data.accounts) {
        const bal = accountBalances[acc.id];
        if (bal !== acc.current_balance) {
          await fetch(`http://127.0.0.1:8000/api/accounts/${acc.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...acc, current_balance: bal })
          });
        }
      }

      // 2. Update Loans in active database
      for (const loan of data.loans) {
        const bal = loanBalances[loan.id];
        if (bal !== loan.outstanding) {
          await fetch(`http://127.0.0.1:8000/api/loans/${loan.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...loan, outstanding: bal })
          });
        }
      }

      // 3. Update Investments in active database
      for (const inv of data.investments) {
        const val = investmentValues[inv.id];
        if (val !== inv.current_value) {
          await fetch(`http://127.0.0.1:8000/api/investments/${inv.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...inv, current_value: val })
          });
        }
      }

      // 4. Update Properties in active database
      for (const prop of data.properties) {
        const val = propertyValues[prop.id];
        if (val !== prop.current_value) {
          await fetch(`http://127.0.0.1:8000/api/properties/${prop.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...prop, current_value: val })
          });
        }
      }

      // 5. Compile and Post the frozen snapshot snapshot
      const snapshotPayload = {
        accounts: data.accounts.map(a => ({ ...a, current_balance: accountBalances[a.id] })),
        loans: data.loans.map(l => ({ ...l, outstanding: loanBalances[l.id] })),
        investments: data.investments.map(i => ({ ...i, current_value: investmentValues[i.id] })),
        properties: data.properties.map(p => ({ ...p, current_value: propertyValues[p.id] })),
        goals: data.goals
      };

      const formData = new FormData();
      formData.append('month', month);
      formData.append('snapshot_data_str', JSON.stringify(snapshotPayload));

      const res = await fetch('http://127.0.0.1:8000/api/snapshots', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        setSuccess(true);
        onRefresh();
      } else {
        alert("Snapshot save failed");
      }
    } catch (err) {
      console.error(err);
      alert("Error saving snapshot details");
    } finally {
      setSaving(false);
    }
  };


  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div className="page-header">
        <h1 className="page-title">Monthly snapshot</h1>
        <p className="page-subtitle">Freeze monthly balances to archive historical progress (Under 15 minutes setup)</p>
      </div>

      <div className="glass-panel" style={{ padding: '32px' }}>
        <form onSubmit={handleSaveSnapshot}>
          {/* Header Row: Month selection */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={18} style={{ color: 'var(--accent)' }} />
              <span style={{ fontWeight: 600 }}>Snapshot Month:</span>
              <input 
                type="month" 
                className="form-input" 
                style={{ padding: '6px 12px', fontSize: '13px' }}
                value={month} 
                onChange={e => setMonth(e.target.value)} 
              />
            </div>
            
            <button type="submit" disabled={saving} className="btn btn-primary">
              <Save size={16} /> {saving ? 'Saving...' : 'Save Snapshot'}
            </button>
          </div>

          {/* Alert Success */}
          {success && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--success)', borderRadius: 'var(--radius-sm)', marginBottom: '24px', fontSize: '13px' }}>
              <CheckCircle size={16} />
              <span>Snapshot compiled and saved successfully. Active balances updated!</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Accounts balances Section */}
            {data.accounts.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: 'var(--accent-light)' }}>Accounts (Liquid Balances)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.accounts.map(acc => (
                    <div key={acc.id} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{acc.name} ({acc.institution})</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={accountBalances[acc.id] ?? 0}
                        onChange={e => setAccountBalances({ ...accountBalances, [acc.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Investments values Section */}
            {data.investments.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: 'var(--accent-light)' }}>Investments (Current Value)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.investments.map(inv => (
                    <div key={inv.id} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{inv.name} ({inv.type})</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={investmentValues[inv.id] ?? 0}
                        onChange={e => setInvestmentValues({ ...investmentValues, [inv.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Loans outstanding Section */}
            {data.loans.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: 'var(--accent-light)' }}>Active Loans (Outstanding Principal)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.loans.map(loan => (
                    <div key={loan.id} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{loan.name} (Lender: {loan.lender})</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={loanBalances[loan.id] ?? 0}
                        onChange={e => setLoanBalances({ ...loanBalances, [loan.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Properties values Section */}
            {data.properties.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: 'var(--accent-light)' }}>Real Estate (Valuation)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.properties.map(prop => (
                    <div key={prop.id} className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">{prop.name}</label>
                      <input 
                        type="number" 
                        className="form-input" 
                        value={propertyValues[prop.id] ?? 0}
                        onChange={e => setPropertyValues({ ...propertyValues, [prop.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Note: Saving the snapshot will overwrite values for this month if it already exists, and will keep historical trends clean. Make sure to update values monthly to keep net worth growth chart accurate.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
