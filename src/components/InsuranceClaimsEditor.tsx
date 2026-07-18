import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { InsuranceClaim } from '../types';

interface InsuranceClaimsEditorProps {
  claims: InsuranceClaim[];
  onChange: (claims: InsuranceClaim[]) => void;
}

const STATUS_OPTIONS = ['Filed', 'Approved', 'Rejected', 'Settled'];

export const InsuranceClaimsEditor: React.FC<InsuranceClaimsEditorProps> = ({ claims, onChange }) => {
  const addClaim = () => {
    onChange([...claims, { claim_date: new Date().toISOString().slice(0, 10), claim_amount: 0, status: 'Filed', description: '' }]);
  };

  const updateClaim = (index: number, key: keyof InsuranceClaim, value: any) => {
    const next = claims.map((claim, i) => (i === index ? { ...claim, [key]: value } : claim));
    onChange(next);
  };

  const removeClaim = (index: number) => {
    onChange(claims.filter((_, i) => i !== index));
  };

  const totalClaimed = claims.reduce((sum, c) => sum + (Number(c.claim_amount) || 0), 0);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Claims History</label>
        <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }} onClick={addClaim}>
          <Plus size={12} /> Add Claim
        </button>
      </div>

      {claims.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No claims recorded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {claims.map((claim, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1.5fr auto', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                className="form-control"
                value={claim.claim_date}
                onChange={(e) => updateClaim(i, 'claim_date', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Amount"
                className="form-control"
                value={claim.claim_amount}
                onChange={(e) => updateClaim(i, 'claim_amount', parseFloat(e.target.value) || 0)}
              />
              <select
                className="form-control"
                value={claim.status || 'Filed'}
                onChange={(e) => updateClaim(i, 'status', e.target.value)}
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Description"
                className="form-control"
                value={claim.description || ''}
                onChange={(e) => updateClaim(i, 'description', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                onClick={() => removeClaim(i)}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {claims.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Total Claimed: ₹{totalClaimed.toLocaleString('en-IN', { maximumFractionDigits: 2 })} across {claims.length} claim(s)
        </div>
      )}
    </div>
  );
};
