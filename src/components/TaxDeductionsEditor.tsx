import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TaxDeduction } from '../types';

interface TaxDeductionsEditorProps {
  deductions: TaxDeduction[];
  onChange: (deductions: TaxDeduction[]) => void;
}

const SECTIONS: TaxDeduction['section'][] = ['80C', '80D', '80CCD1B', '80E', '80G', '80TTA', '24B', 'Other'];

export const TaxDeductionsEditor: React.FC<TaxDeductionsEditorProps> = ({ deductions, onChange }) => {
  const addDeduction = () => {
    onChange([...deductions, { section: '80C', label: '', amount: 0, notes: '' }]);
  };

  const updateDeduction = (index: number, key: keyof TaxDeduction, value: any) => {
    const next = deductions.map((d, i) => (i === index ? { ...d, [key]: value } : d));
    onChange(next);
  };

  const removeDeduction = (index: number) => {
    onChange(deductions.filter((_, i) => i !== index));
  };

  const totalsBySection = deductions.reduce((acc, d) => {
    acc[d.section] = (acc[d.section] || 0) + (Number(d.amount) || 0);
    return acc;
  }, {} as Record<string, number>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Itemized Deductions</label>
        <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }} onClick={addDeduction}>
          <Plus size={12} /> Add Deduction
        </button>
      </div>

      {deductions.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No deductions recorded yet. Add entries for 80C (PPF/ELSS/life insurance), 80D (health insurance), etc.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {deductions.map((d, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '0.9fr 1.4fr 1fr 1.2fr auto', gap: '8px', alignItems: 'center' }}>
              <select
                className="form-control"
                aria-label={`Section, deduction ${i + 1}`}
                value={d.section}
                onChange={(e) => updateDeduction(i, 'section', e.target.value)}
              >
                {SECTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Label (e.g. PPF, LIC Premium)"
                className="form-control"
                aria-label={`Label, deduction ${i + 1}`}
                value={d.label}
                onChange={(e) => updateDeduction(i, 'label', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Amount"
                className="form-control"
                aria-label={`Amount, deduction ${i + 1}`}
                value={d.amount}
                onChange={(e) => updateDeduction(i, 'amount', parseFloat(e.target.value) || 0)}
              />
              <input
                type="text"
                placeholder="Notes"
                className="form-control"
                aria-label={`Notes, deduction ${i + 1}`}
                value={d.notes || ''}
                onChange={(e) => updateDeduction(i, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                onClick={() => removeDeduction(i)}
                aria-label={`Remove deduction ${i + 1}`}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {deductions.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {Object.entries(totalsBySection).map(([section, total]) => (
            <span key={section} style={{ marginRight: '14px' }}>
              {section}: <strong style={{ color: '#e2e8f0' }}>₹{total.toLocaleString('en-IN')}</strong>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
