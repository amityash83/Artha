import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { RentalLedgerEntry } from '../types';

interface PropertyRentalLedgerEditorProps {
  entries: RentalLedgerEntry[];
  onChange: (entries: RentalLedgerEntry[]) => void;
}

export const PropertyRentalLedgerEditor: React.FC<PropertyRentalLedgerEditorProps> = ({ entries, onChange }) => {
  const addEntry = () => {
    onChange([...entries, { month: new Date().toISOString().slice(0, 7), rent_amount: 0, expenses_amount: 0, notes: '' }]);
  };

  const updateEntry = (index: number, key: keyof RentalLedgerEntry, value: any) => {
    const next = entries.map((entry, i) => (i === index ? { ...entry, [key]: value } : entry));
    onChange(next);
  };

  const removeEntry = (index: number) => {
    onChange(entries.filter((_, i) => i !== index));
  };

  const totalRent = entries.reduce((sum, e) => sum + (Number(e.rent_amount) || 0), 0);
  const totalExpenses = entries.reduce((sum, e) => sum + (Number(e.expenses_amount) || 0), 0);
  const avgRent = entries.length > 0 ? totalRent / entries.length : 0;

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Rental Ledger</label>
        <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }} onClick={addEntry}>
          <Plus size={12} /> Add Month
        </button>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No rental history recorded yet. Add a month to track rent and expenses.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {entries.map((entry, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
              <input
                type="month"
                className="form-control"
                value={entry.month}
                onChange={(e) => updateEntry(i, 'month', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Rent"
                className="form-control"
                value={entry.rent_amount}
                onChange={(e) => updateEntry(i, 'rent_amount', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number"
                step="any"
                placeholder="Expenses"
                className="form-control"
                value={entry.expenses_amount}
                onChange={(e) => updateEntry(i, 'expenses_amount', parseFloat(e.target.value) || 0)}
              />
              <input
                type="text"
                placeholder="Notes"
                className="form-control"
                value={entry.notes || ''}
                onChange={(e) => updateEntry(i, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                onClick={() => removeEntry(i)}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {entries.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Avg Monthly Rent: ₹{avgRent.toLocaleString('en-IN', { maximumFractionDigits: 2 })} &middot; Net Cash Flow: ₹{(totalRent - totalExpenses).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
        </div>
      )}
    </div>
  );
};
