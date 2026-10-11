import React, { useState, useEffect } from 'react';
import { Calendar, CheckCircle, Save, Info } from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';

interface SnapshotProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Shown in a panel over the Dashboard: no page title, and closes once saved. */
  embedded?: boolean;
  onDone?: () => void;
}

export const Snapshot: React.FC<SnapshotProps> = ({ data, onRefresh, showToast, embedded, onDone }) => {
  const [month, setMonth] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  // Dynamic balances map state
  // Accounts have no editable balance here: current_balance is derived server-side
  // from the transactions ledger, so it's shown read-only rather than collected as input.
  const [assetValues, setAssetValues] = useState<Record<number, number>>({});
  const [liabilityBalances, setLiabilityBalances] = useState<Record<number, number>>({});

  useEffect(() => {
    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    setMonth(`${YYYY}-${MM}`);

    // Prepopulate form states
    const asts: Record<number, number> = {};
    data.assets.forEach(a => { asts[a.id] = a.current_value; });
    setAssetValues(asts);

    const liabs: Record<number, number> = {};
    data.liabilities.forEach(l => { liabs[l.id] = l.outstanding; });
    setLiabilityBalances(liabs);
  }, [data]);

  const handleSaveSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess(false);

    try {
      // Accounts are not written back here: current_balance is derived from the
      // transactions ledger and always up to date, so there is nothing to save.

      // 2. Update Assets in active database
      for (const asset of data.assets) {
        const val = assetValues[asset.id];
        if (val !== asset.current_value) {
          await fetch(`${API_BASE_URL}/api/entities/assets/${asset.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...asset, current_value: val })
          });
        }
      }

      // 3. Update Liabilities in active database
      for (const liab of data.liabilities) {
        const bal = liabilityBalances[liab.id];
        if (bal !== liab.outstanding) {
          await fetch(`${API_BASE_URL}/api/entities/liabilities/${liab.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...liab, outstanding: bal })
          });
        }
      }

      // 4. Compile and Post the frozen snapshot snapshot
      const snapshotPayload = {
        accounts: data.accounts,
        assets: data.assets.map(a => ({ ...a, current_value: assetValues[a.id] })),
        liabilities: data.liabilities.map(l => ({ ...l, outstanding: liabilityBalances[l.id] })),
        goals: data.goals
      };

      const formData = new FormData();
      formData.append('month', month);
      formData.append('snapshot_data_str', JSON.stringify(snapshotPayload));

      const res = await fetch(`${API_BASE_URL}/api/snapshots`, {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        setSuccess(true);
        onRefresh();
        if (showToast) showToast(`Snapshot for ${month} saved`, "success");
        onDone?.();
      } else {
        if (showToast) showToast("Snapshot save failed", "error");
        else alert("Snapshot save failed");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error saving snapshot details", "error");
      else alert("Error saving snapshot details");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={embedded ? undefined : { maxWidth: '800px', margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">Monthly Snapshot</h1>
          <p className="page-subtitle">Record this month's balances so the Dashboard can show your progress over time.</p>
        </div>
      )}

      <div className="glass-panel" style={{ padding: embedded ? '24px' : '32px' }}>
        <form onSubmit={handleSaveSnapshot}>
          {/* Header Row: Month selection */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={18} style={{ color: '#a78bfa' }} />
              <span style={{ fontWeight: 600, color: '#e2e8f0' }}>Snapshot Month:</span>
              <input 
                type="month" 
                className="form-control" 
                style={{ padding: '6px 12px', fontSize: '13px', width: '160px' }}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981', borderRadius: '8px', marginBottom: '24px', fontSize: '13px' }}>
              <CheckCircle size={16} />
              <span>Snapshot compiled and saved successfully. Active balances updated!</span>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            {/* Accounts balances Section (read-only: balance is derived from the transactions ledger) */}
            {data.accounts.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: '#a78bfa' }}>Accounts (Liquid Balances)</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.accounts.map(acc => (
                    <div key={acc.id} className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{acc.name} ({acc.institution_name || 'Bank'})</label>
                      <input
                        type="number"
                        className="form-control"
                        value={acc.current_balance ?? 0}
                        readOnly
                        disabled
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Assets values Section */}
            {data.assets.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: '#a78bfa' }}>Assets Valuation</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.assets.map(asset => (
                    <div key={asset.id} className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{asset.name} ({asset.category_name || 'General'})</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={assetValues[asset.id] ?? 0}
                        onChange={e => setAssetValues({ ...assetValues, [asset.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Liabilities outstanding Section */}
            {data.liabilities.length > 0 && (
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', color: '#a78bfa' }}>Liabilities Outstanding</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {data.liabilities.map(liab => (
                    <div key={liab.id} className="form-group" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{liab.name} ({liab.category_name || 'General'})</label>
                      <input 
                        type="number" 
                        className="form-control" 
                        value={liabilityBalances[liab.id] ?? 0}
                        onChange={e => setLiabilityBalances({ ...liabilityBalances, [liab.id]: parseFloat(e.target.value) || 0 })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '32px', padding: '16px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Info size={16} style={{ color: '#a78bfa', flexShrink: 0 }} />
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', margin: 0 }}>
              Note: Account balances are shown for reference only and are always derived automatically. Saving the snapshot updates asset/liability values you've edited above and will overwrite this month's archived entry if it already exists.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
