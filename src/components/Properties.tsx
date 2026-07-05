import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Home, Landmark, Percent, X } from 'lucide-react';
import { Property, Loan } from '../types';

interface PropertiesProps {
  properties: Property[];
  loans: Loan[];
  onRefresh: () => void;
}

export const Properties: React.FC<PropertiesProps> = ({ properties, loans, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProp, setEditingProp] = useState<Property | null>(null);

  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Property>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Property) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Form State
  const [name, setName] = useState('');
  const [purchasePrice, setPurchasePrice] = useState<number>(0);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [associatedLoanId, setAssociatedLoanId] = useState<number | null>(null);
  const [rentalIncome, setRentalIncome] = useState<number>(0);
  const [expenses, setExpenses] = useState<number>(0);
  const [remarks, setRemarks] = useState('');

  const openAddModal = () => {
    setEditingProp(null);
    setName('');
    setPurchasePrice(0);
    setCurrentValue(0);
    setAssociatedLoanId(null);
    setRentalIncome(0);
    setExpenses(0);
    setRemarks('');
    setModalOpen(true);
  };

  const openEditModal = (prop: Property) => {
    setEditingProp(prop);
    setName(prop.name);
    setPurchasePrice(prop.purchase_price);
    setCurrentValue(prop.current_value);
    setAssociatedLoanId(prop.associated_loan_id);
    setRentalIncome(prop.rental_income);
    setExpenses(prop.expenses);
    setRemarks(prop.remarks);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, purchase_price: purchasePrice, current_value: currentValue,
      associated_loan_id: associatedLoanId ? Number(associatedLoanId) : null,
      rental_income: rentalIncome, expenses, remarks
    };

    const url = editingProp 
      ? `http://127.0.0.1:8000/api/properties/${editingProp.id}` 
      : 'http://127.0.0.1:8000/api/properties';
    const method = editingProp ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setModalOpen(false);
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this property?")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/properties/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const totalValue = properties.reduce((sum, p) => sum + p.current_value, 0);
  const totalRental = properties.reduce((sum, p) => sum + p.rental_income, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Properties</h1>
          <p className="page-subtitle">Track real estate holdings and yields</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Property
        </button>
      </div>

      {/* Aggregate Yield Card */}
      <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Properties Valuation</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(totalValue)}</h3>
        </div>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Monthly Rental Cashflow</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px', color: 'var(--success)' }}>
            +{formatCurrency(totalRental)}
          </h3>
        </div>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Average Rental Yield</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px', color: 'var(--accent-light)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Percent size={18} />
            {totalValue > 0 ? ((totalRental * 12 / totalValue) * 100).toFixed(2) : '0.00'}%
          </h3>
        </div>
      </div>

      {/* Sort toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort Properties By:</span>
        <select 
          className="form-input" 
          style={{ padding: '4px 10px', fontSize: '12px', width: '180px' }}
          value={sortColumn}
          onChange={e => handleSort(e.target.value as keyof Property)}
        >
          <option value="name">Property Name</option>
          <option value="purchase_price">Purchase Price</option>
          <option value="current_value">Current Valuation</option>
          <option value="rental_income">Rental Income</option>
        </select>
        <button 
          className="btn btn-secondary" 
          style={{ padding: '6px 12px', fontSize: '12px' }}
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          {sortDirection === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {(() => {
          const sorted = [...properties].sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];
            if (valA === undefined || valA === null) valA = '';
            if (valB === undefined || valB === null) valB = '';
            if (typeof valA === 'string' && typeof valB === 'string') {
              const comparison = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
              return sortDirection === 'asc' ? comparison : -comparison;
            } else {
              const numA = Number(valA);
              const numB = Number(valB);
              if (numA < numB) return sortDirection === 'asc' ? -1 : 1;
              if (numA > numB) return sortDirection === 'asc' ? 1 : -1;
              return 0;
            }
          });

          return sorted.length > 0 ? (
            sorted.map(prop => {
              const mappedLoan = loans.find(l => l.id === prop.associated_loan_id);
              const netEquity = prop.current_value - (mappedLoan ? mappedLoan.outstanding : 0);
              const yieldPct = prop.current_value > 0 ? (prop.rental_income * 12 / prop.current_value) * 100 : 0;

              return (
                <div key={prop.id} className="glass-panel" style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Home size={18} style={{ color: 'var(--accent)' }} />
                    <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{prop.name}</h3>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => openEditModal(prop)}>
                      <Edit2 size={13} />
                    </button>
                    <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDelete(prop.id)}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Purchase Price</span>
                    <p style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>{formatCurrency(prop.purchase_price)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Current Valuation</span>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--success)', marginTop: '4px' }}>{formatCurrency(prop.current_value)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Net Equity (Valuation - Loan)</span>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--accent-light)', marginTop: '4px' }}>{formatCurrency(netEquity)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Rental Cashflow</span>
                    <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--success)', marginTop: '4px' }}>
                      +{formatCurrency(prop.rental_income)}/mo <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({yieldPct.toFixed(1)}% yield)</span>
                    </p>
                  </div>
                </div>

                {mappedLoan && (
                  <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.1)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
                    <Landmark size={14} style={{ color: 'var(--danger)' }} />
                    <span>Associated liability: <strong>{mappedLoan.name}</strong> with outstanding debt of {formatCurrency(mappedLoan.outstanding)} (ROI: {mappedLoan.roi}%)</span>
                  </div>
                )}

                {prop.remarks && (
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                    Remarks: {prop.remarks}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No real estate properties listed. Click "Add Property" to track physical asset holdings.
          </div>
        )
        })()}
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingProp ? 'Edit Property' : 'Add New Property'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Property Name</label>
              <input type="text" className="form-input" required placeholder="e.g. Pune Luxury Villa" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Purchase Price (₹)</label>
                <input type="number" className="form-input" required value={purchasePrice} onChange={e => setPurchasePrice(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Current Market Value (₹)</label>
                <input type="number" className="form-input" required value={currentValue} onChange={e => setCurrentValue(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Associated Loan</label>
                <select className="form-input" value={associatedLoanId || ''} onChange={e => setAssociatedLoanId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">No Active Loan (Fully Debt-Free)</option>
                  {loans.map(l => (
                    <option key={l.id} value={l.id}>{l.name} ({formatCurrency(l.outstanding)})</option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Monthly Rental Income (₹)</label>
                <input type="number" className="form-input" value={rentalIncome} onChange={e => setRentalIncome(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Associated Expenses (₹/mo)</label>
              <input type="number" className="form-input" value={expenses} onChange={e => setExpenses(parseFloat(e.target.value) || 0)} />
            </div>

            <div className="form-group">
              <label className="form-label">Remarks</label>
              <input type="text" className="form-input" placeholder="Notes on location, registrations, etc." value={remarks} onChange={e => setRemarks(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Property</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
