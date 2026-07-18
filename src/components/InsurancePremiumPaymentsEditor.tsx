import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { InsurancePremiumPayment } from '../types';

interface InsurancePremiumPaymentsEditorProps {
  payments: InsurancePremiumPayment[];
  onChange: (payments: InsurancePremiumPayment[]) => void;
}

export const InsurancePremiumPaymentsEditor: React.FC<InsurancePremiumPaymentsEditorProps> = ({ payments, onChange }) => {
  const addPayment = () => {
    onChange([...payments, { payment_date: new Date().toISOString().slice(0, 10), amount: 0, notes: '' }]);
  };

  const updatePayment = (index: number, key: keyof InsurancePremiumPayment, value: any) => {
    const next = payments.map((payment, i) => (i === index ? { ...payment, [key]: value } : payment));
    onChange(next);
  };

  const removePayment = (index: number) => {
    onChange(payments.filter((_, i) => i !== index));
  };

  const totalPaid = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Premium Payment History</label>
        <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }} onClick={addPayment}>
          <Plus size={12} /> Add Payment
        </button>
      </div>

      {payments.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No premium payments recorded yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {payments.map((payment, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                className="form-control"
                value={payment.payment_date}
                onChange={(e) => updatePayment(i, 'payment_date', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Amount"
                className="form-control"
                value={payment.amount}
                onChange={(e) => updatePayment(i, 'amount', parseFloat(e.target.value) || 0)}
              />
              <input
                type="text"
                placeholder="Notes"
                className="form-control"
                value={payment.notes || ''}
                onChange={(e) => updatePayment(i, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                onClick={() => removePayment(i)}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {payments.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Total Paid: ₹{totalPaid.toLocaleString('en-IN', { maximumFractionDigits: 2 })} across {payments.length} payment(s)
        </div>
      )}
    </div>
  );
};
