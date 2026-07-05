import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Percent, X } from 'lucide-react';
import { Loan } from '../types';

interface LoansProps {
  loans: Loan[];
  onRefresh: () => void;
}

export const Loans: React.FC<LoansProps> = ({ loans, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  
  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Loan>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Loan) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  // Interactive Simulation states for prepayments
  const [simPrepaymentAmounts, setSimPrepaymentAmounts] = useState<{[key: number]: number}>({});

  // Form State
  const [name, setName] = useState('');
  const [lender, setLender] = useState('');
  const [outstanding, setOutstanding] = useState<number>(0);
  const [roi, setRoi] = useState<number>(0);
  const [emi, setEmi] = useState<number>(0);
  const [tenure, setTenure] = useState<number>(0);
  const [startDate, setStartDate] = useState('');
  const [prepaymentAllowed, setPrepaymentAllowed] = useState(true);
  const [processingFee, setProcessingFee] = useState<number>(0);
  const [loanType, setLoanType] = useState('Home');

  const openAddModal = () => {
    setEditingLoan(null);
    setName('');
    setLender('');
    setOutstanding(0);
    setRoi(8.5);
    setEmi(0);
    setTenure(240);
    setStartDate(new Date().toISOString().split('T')[0]);
    setPrepaymentAllowed(true);
    setProcessingFee(0);
    setLoanType('Home');
    setModalOpen(true);
  };

  const openEditModal = (loan: Loan) => {
    setEditingLoan(loan);
    setName(loan.name);
    setLender(loan.lender);
    setOutstanding(loan.outstanding);
    setRoi(loan.roi);
    setEmi(loan.emi);
    setTenure(loan.tenure);
    setStartDate(loan.start_date);
    setPrepaymentAllowed(Boolean(loan.prepayment_allowed));
    setProcessingFee(loan.processing_fee);
    setLoanType(loan.loan_type);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, lender, outstanding, roi, emi, tenure,
      start_date: startDate, prepayment_allowed: prepaymentAllowed,
      processing_fee: processingFee, loan_type: loanType
    };

    const url = editingLoan 
      ? `http://127.0.0.1:8000/api/loans/${editingLoan.id}` 
      : 'http://127.0.0.1:8000/api/loans';
    const method = editingLoan ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setModalOpen(false);
        onRefresh();
      } else {
        const err = await res.json();
        alert(err.detail || "Operation failed");
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this loan record?")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/loans/${id}`, { method: 'DELETE' });
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

  // Quick Interest Savings Calculator locally for instant feedback
  const calculateLocalSavings = (loan: Loan, prepayAmt: number) => {
    if (prepayAmt <= 0 || loan.outstanding <= 0) return 0;
    const r = (loan.roi / 100) / 12;
    if (r === 0 || loan.emi <= 0) return 0;
    
    // Formula for N: -ln(1 - (P * r) / E) / ln(1 + r)
    const computeN = (P: number) => {
      if (P * r >= loan.emi) return Infinity;
      return -Math.log(1 - (P * r) / loan.emi) / Math.log(1 + r);
    };

    const nBefore = computeN(loan.outstanding);
    const nAfter = computeN(loan.outstanding - Math.min(prepayAmt, loan.outstanding));
    
    if (nBefore === Infinity || nAfter === Infinity) return 0;

    const interestBefore = (nBefore * loan.emi) - loan.outstanding;
    const interestAfter = (nAfter * loan.emi) - (loan.outstanding - Math.min(prepayAmt, loan.outstanding));
    
    return Math.max(interestBefore - interestAfter, 0);
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Active Loans</h1>
          <p className="page-subtitle">Track outstanding loans and optimization prepayments</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Loan
        </button>
      </div>

      {/* Sort toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort Loans By:</span>
        <select 
          className="form-input" 
          style={{ padding: '4px 10px', fontSize: '12px', width: '180px' }}
          value={sortColumn}
          onChange={e => handleSort(e.target.value as keyof Loan)}
        >
          <option value="name">Loan Name</option>
          <option value="lender">Lender Name</option>
          <option value="outstanding">Outstanding Principal</option>
          <option value="roi">Interest Rate (ROI)</option>
          <option value="emi">Monthly EMI</option>
        </select>
        <button 
          className="btn btn-secondary" 
          style={{ padding: '6px 12px', fontSize: '12px' }}
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          {sortDirection === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {(() => {
          const sortedLoans = [...loans].sort((a, b) => {
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

          return sortedLoans.length > 0 ? (
            sortedLoans.map(loan => {
              const prepaySimAmt = simPrepaymentAmounts[loan.id] || 100000;
              const savedInterest = calculateLocalSavings(loan, prepaySimAmt);
              
              return (
                <div key={loan.id} className="glass-panel" style={{ padding: '24px', display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '32px' }}>
                  {/* Details side */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span className="status-badge red" style={{ textTransform: 'uppercase', fontSize: '10px' }}>
                          {loan.loan_type}
                        </span>
                        <h3 style={{ fontSize: '18px', fontWeight: 600 }}>{loan.name}</h3>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => openEditModal(loan)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDelete(loan.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>Lender: {loan.lender}</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Outstanding Principal</span>
                        <p style={{ fontSize: '20px', fontWeight: 700, color: 'var(--danger)', marginTop: '4px' }}>{formatCurrency(loan.outstanding)}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monthly EMI</span>
                        <p style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px' }}>{formatCurrency(loan.emi)}</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Interest Rate (ROI)</span>
                        <p style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>{loan.roi}%</p>
                      </div>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Remaining Interest</span>
                        <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--warning)', marginTop: '4px' }}>
                          {loan.remaining_tenure === -1 ? 'Infinite' : formatCurrency(loan.remaining_interest)}
                        </p>
                      </div>
                    </div>

                    {/* Amortization Progress Bar */}
                    <div style={{ marginTop: '16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px' }}>
                        <span>Remaining Tenure: {loan.remaining_tenure === -1 ? 'Infinite' : `${loan.remaining_tenure} months`}</span>
                        <span>Progress: {loan.progress}%</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${loan.progress}%`, 
                          height: '100%', 
                          background: 'var(--accent-gradient)',
                          borderRadius: '50px'
                        }}></div>
                      </div>
                    </div>
                  </div>

                  {/* Prepayment Calculator side */}
                  <div style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '32px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Percent size={14} style={{ color: 'var(--success)' }} />
                      Interactive Prepayment Simulator
                    </h4>

                    <div className="form-group" style={{ marginBottom: '16px' }}>
                      <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Prepayment Amount</span>
                        <span style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(prepaySimAmt)}</span>
                      </label>
                      <input 
                        type="range" 
                        min="10000" 
                        max={Math.min(loan.outstanding, 2000000)} 
                        step="10000"
                        value={prepaySimAmt}
                        onChange={e => {
                          const val = parseInt(e.target.value) || 0;
                          setSimPrepaymentAmounts({...simPrepaymentAmounts, [loan.id]: val});
                        }}
                        style={{ width: '100%', accentColor: 'var(--success)' }}
                      />
                    </div>

                    <div style={{ background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Interest Saved After Prepayment</span>
                      <h2 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--success)', margin: '8px 0 4px 0' }}>
                        {formatCurrency(savedInterest)}
                      </h2>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Reduces remaining tenure by approximately {((savedInterest) / loan.emi).toFixed(0)} months!
                      </p>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active loans found. Click "Add Loan" to record outstanding liabilities.
            </div>
          );
        })()}
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingLoan ? 'Edit Loan' : 'Add New Loan'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Loan Name</label>
                <input type="text" className="form-input" required placeholder="e.g. Home Loan" value={name} onChange={e => setName(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Lender</label>
                <input type="text" className="form-input" required placeholder="e.g. HDFC Bank" value={lender} onChange={e => setLender(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Outstanding Principal (₹)</label>
                <input type="number" className="form-input" required value={outstanding} onChange={e => setOutstanding(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Interest Rate (ROI %)</label>
                <input type="number" step="0.01" className="form-input" required value={roi} onChange={e => setRoi(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Monthly EMI (₹)</label>
                <input type="number" className="form-input" required value={emi} onChange={e => setEmi(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Original Tenure (months)</label>
                <input type="number" className="form-input" required value={tenure} onChange={e => setTenure(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Start Date</label>
                <input type="date" className="form-input" required value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Loan Type</label>
                <select className="form-input" value={loanType} onChange={e => setLoanType(e.target.value)}>
                  <option value="Home">Home Loan</option>
                  <option value="Car">Car Loan</option>
                  <option value="Personal">Personal Loan</option>
                  <option value="Education">Education Loan</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', alignItems: 'center', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" checked={prepaymentAllowed} onChange={e => setPrepaymentAllowed(e.target.checked)} id="prepay_check" style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
                <label htmlFor="prepay_check" style={{ fontSize: '13px', cursor: 'pointer' }}>Prepayment Allowed</label>
              </div>
              <div className="form-group">
                <label className="form-label">Processing Fee (₹)</label>
                <input type="number" className="form-input" value={processingFee} onChange={e => setProcessingFee(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Loan</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
