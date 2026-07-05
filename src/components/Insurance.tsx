import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Shield, Calendar, X } from 'lucide-react';
import { InsurancePolicy } from '../types';

interface InsuranceProps {
  insurance: InsurancePolicy[];
  onRefresh: () => void;
}

export const Insurance: React.FC<InsuranceProps> = ({ insurance, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<InsurancePolicy | null>(null);
  
  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof InsurancePolicy | 'insurance_type'>('company');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Form State
  const [company, setCompany] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [premium, setPremium] = useState<number>(0);
  const [frequency, setFrequency] = useState('Yearly');
  const [coverage, setCoverage] = useState<number>(0);
  const [nominee, setNominee] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [lastPremiumDate, setLastPremiumDate] = useState('');
  const [renewalDate, setRenewalDate] = useState('');
  const [waitingPeriod, setWaitingPeriod] = useState('');
  const [claimHistory, setClaimHistory] = useState('');
  const [insuranceType, setInsuranceType] = useState('Traditional Life');
  const [surrenderValue, setSurrenderValue] = useState<number>(0);

  const openAddModal = () => {
    setEditingPolicy(null);
    setCompany('');
    setPolicyNumber('');
    setPremium(0);
    setFrequency('Yearly');
    setCoverage(0);
    setNominee('');
    setMaturityDate('');
    setLastPremiumDate('');
    setRenewalDate('');
    setWaitingPeriod('');
    setClaimHistory('');
    setInsuranceType('Traditional Life');
    setSurrenderValue(0);
    setModalOpen(true);
  };

  const openEditModal = (policy: InsurancePolicy) => {
    setEditingPolicy(policy);
    setCompany(policy.company);
    setPolicyNumber(policy.policy_number);
    setPremium(policy.premium);
    setFrequency(policy.frequency);
    setCoverage(policy.coverage);
    setNominee(policy.nominee);
    setMaturityDate(policy.maturity_date || '');
    setLastPremiumDate(policy.last_premium_date || '');
    setRenewalDate(policy.renewal_date || '');
    setWaitingPeriod(policy.waiting_period || '');
    setClaimHistory(policy.claim_history || '');
    setInsuranceType(policy.insurance_type || 'Traditional Life');
    setSurrenderValue(policy.surrender_value || 0);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      company, 
      policy_number: policyNumber, 
      premium, 
      frequency, 
      coverage, 
      nominee,
      maturity_date: maturityDate, 
      last_premium_date: lastPremiumDate,
      renewal_date: renewalDate, 
      waiting_period: waitingPeriod, 
      claim_history: claimHistory,
      insurance_type: insuranceType,
      surrender_value: insuranceType === 'Traditional Life' ? surrenderValue : 0
    };

    const url = editingPolicy 
      ? `http://127.0.0.1:8000/api/insurance/${editingPolicy.id}` 
      : 'http://127.0.0.1:8000/api/insurance';
    const method = editingPolicy ? 'PUT' : 'POST';

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
        alert("Operation failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this insurance policy record?")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/insurance/${id}`, { method: 'DELETE' });
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

  const handleSort = (column: keyof InsurancePolicy | 'insurance_type') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const sortedInsurance = [...insurance].sort((a, b) => {
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

  const totalCoverage = insurance.reduce((sum, p) => sum + p.coverage, 0);
  const totalCashValue = insurance.reduce((sum, p) => sum + (p.surrender_value || 0), 0);
  const annualPremiumEquivalent = insurance.reduce((sum, p) => {
    if (p.frequency === 'Monthly') return sum + (p.premium * 12);
    if (p.frequency === 'Quarterly') return sum + (p.premium * 4);
    if (p.frequency === 'Half-Yearly') return sum + (p.premium * 2);
    return sum + p.premium;
  }, 0);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Insurance Policies</h1>
          <p className="page-subtitle">Track life, health, vehicle, and property risk protection insurances.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Policy
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Sum Assured (Coverage)</span>
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: 'var(--success)' }}>{formatCurrency(totalCoverage)}</h3>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Insurance Cash Value (Asset)</span>
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: 'var(--accent-light)' }}>{formatCurrency(totalCashValue)}</h3>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Annual Premium Outflow</span>
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(annualPremiumEquivalent)}</h3>
        </div>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Active Policies</span>
          <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '8px', color: 'var(--text-muted)' }}>
            {insurance.length} policies
          </h3>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '32px' }}>
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Active Policy Registry</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('company')}>
                    Company {sortColumn === 'company' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('insurance_type')}>
                    Type {sortColumn === 'insurance_type' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('coverage')}>
                    Coverage {sortColumn === 'coverage' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('premium')}>
                    Premium {sortColumn === 'premium' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th style={{ cursor: 'pointer' }} onClick={() => handleSort('renewal_date')}>
                    Next Due {sortColumn === 'renewal_date' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
                  </th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedInsurance.length > 0 ? (
                  sortedInsurance.map(policy => (
                    <tr key={policy.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Shield size={15} style={{ color: 'var(--accent)' }} />
                        <div>
                          <div>{policy.company}</div>
                          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>No: {policy.policy_number}</div>
                        </div>
                      </td>
                      <td>
                        <span style={{ 
                          fontSize: '11px', 
                          padding: '2px 6px', 
                          borderRadius: '4px',
                          background: policy.insurance_type === 'Traditional Life' ? 'rgba(167,139,250,0.15)' : 'rgba(59,130,246,0.15)',
                          color: policy.insurance_type === 'Traditional Life' ? '#c084fc' : '#60a5fa',
                          fontWeight: 500
                        }}>
                          {policy.insurance_type || 'Traditional Life'}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(policy.coverage)}</td>
                      <td>
                        {formatCurrency(policy.premium)} <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({policy.frequency})</span>
                      </td>
                      <td style={{ color: 'var(--warning)', fontWeight: 500 }}>{policy.renewal_date || 'N/A'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => openEditModal(policy)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDelete(policy.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                      No insurance policies recorded yet. Click "Add Policy" to safeguard your assets.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Premium Calendar</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {insurance.length > 0 ? (
              [...insurance]
                .filter(p => p.renewal_date)
                .sort((a,b) => a.renewal_date.localeCompare(b.renewal_date))
                .map(policy => (
                  <div key={policy.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                    <Calendar size={18} style={{ color: 'var(--warning)' }} />
                    <div style={{ flexGrow: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: 600 }}>{policy.company}</p>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Renewal: {policy.renewal_date} ({policy.insurance_type})</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(policy.premium)}</p>
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{policy.frequency}</p>
                    </div>
                  </div>
                ))
            ) : (
              <p style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                No renewal dates available.
              </p>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingPolicy ? 'Edit Insurance Policy' : 'Add New Policy'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Insurance Company</label>
                <input type="text" className="form-input" required placeholder="e.g. LIC / HDFC Ergo" value={company} onChange={e => setCompany(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Policy Number</label>
                <input type="text" className="form-input" required placeholder="e.g. POL-99238-12" value={policyNumber} onChange={e => setPolicyNumber(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Insurance Type</label>
                <select className="form-input" value={insuranceType} onChange={e => setInsuranceType(e.target.value)}>
                  <option value="Traditional Life">Traditional Life (Cash Payouts)</option>
                  <option value="Term Life">Term Life (Pure Protection)</option>
                  <option value="Health / Medical">Health / Medical</option>
                  <option value="Motor / Car">Motor / Car</option>
                  <option value="Other Protection">Other Protection</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Payment Frequency</label>
                <select className="form-input" value={frequency} onChange={e => setFrequency(e.target.value)}>
                  <option value="Monthly">Monthly</option>
                  <option value="Quarterly">Quarterly</option>
                  <option value="Half-Yearly">Half-Yearly</option>
                  <option value="Yearly">Yearly</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Sum Assured (Coverage ₹)</label>
                <input type="number" className="form-input" required value={coverage} onChange={e => setCoverage(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Premium Amount (₹)</label>
                <input type="number" className="form-input" required value={premium} onChange={e => setPremium(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Nominee</label>
                <input type="text" className="form-input" required placeholder="e.g. Spouse / Brother" value={nominee} onChange={e => setNominee(e.target.value)} />
              </div>
            </div>

            {insuranceType === 'Traditional Life' && (
              <div className="form-group">
                <label className="form-label">Current Surrender / Cash Value (₹) (Asset Value)</label>
                <input type="number" className="form-input" value={surrenderValue} onChange={e => setSurrenderValue(parseFloat(e.target.value) || 0)} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Renewal Due Date</label>
                <input type="date" className="form-input" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Maturity Date</label>
                <input type="date" className="form-input" value={maturityDate} onChange={e => setMaturityDate(e.target.value)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Last Premium Paid Date</label>
                <input type="date" className="form-input" value={lastPremiumDate} onChange={e => setLastPremiumDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Waiting Period Remarks</label>
                <input type="text" className="form-input" placeholder="e.g. 3 years pre-existing" value={waitingPeriod} onChange={e => setWaitingPeriod(e.target.value)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Claim History / Remarks</label>
              <input type="text" className="form-input" placeholder="Claim logs, maturity details" value={claimHistory} onChange={e => setClaimHistory(e.target.value)} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Policy</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
