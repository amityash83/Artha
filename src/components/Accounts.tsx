import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Landmark, X } from 'lucide-react';
import { Account } from '../types';

interface AccountsProps {
  accounts: Account[];
  onRefresh: () => void;
}

export const Accounts: React.FC<AccountsProps> = ({ accounts, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const standardPurposes = [
    "Salary Account",
    "Savings Account",
    "Joint Account",
    "Liquid Funds",
    "Emergency Fund",
    "Backup Fund",
    "Insurance Reserve",
    "Villa Fund",
    "Retirement Fund",
    "Credit Card"
  ];

  // Shortlist state
  const [selectedBank, setSelectedBank] = useState<string>('All');

  // Form State
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [balance, setBalance] = useState<number>(0);
  const [remarks, setRemarks] = useState('');

  const openAddModal = () => {
    setEditingAccount(null);
    setName('');
    setInstitution('');
    setBalance(0);
    setRemarks('');
    setModalOpen(true);
  };

  const openEditModal = (acc: Account) => {
    setEditingAccount(acc);
    setName(acc.name);
    setInstitution(acc.institution);
    setBalance(acc.current_balance);
    setRemarks(acc.remarks);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { name, institution, current_balance: balance, remarks };
    
    const url = editingAccount 
      ? `http://127.0.0.1:8000/api/accounts/${editingAccount.id}` 
      : 'http://127.0.0.1:8000/api/accounts';
      
    const method = editingAccount ? 'PUT' : 'POST';

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
    if (!confirm("Are you sure you want to delete this account? This cannot be undone.")) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/accounts/${id}`, { method: 'DELETE' });
      if (res.ok) {
        onRefresh();
      } else {
        alert("Delete failed");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Account>('institution');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Account) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Derive filter list and sorted accounts
  const uniqueBanks = ['All', ...Array.from(new Set(accounts.map(a => a.institution)))];
  
  const sortedAccounts = [...accounts]
    .filter(acc => selectedBank === 'All' || acc.institution === selectedBank)
    .sort((a, b) => {
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Accounts</h1>
          <p className="page-subtitle">Track liquid and savings deposits balances</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Account
        </button>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        {/* Shortlist Filter toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600 }}>Accounts Registry</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Shortlist by Bank:</span>
            <select 
              className="form-input" 
              style={{ padding: '4px 12px', fontSize: '13px', minWidth: '180px' }}
              value={selectedBank}
              onChange={e => setSelectedBank(e.target.value)}
            >
              {uniqueBanks.map(bank => (
                <option key={bank} value={bank}>{bank}</option>
              ))}
            </select>
          </div>
        </div>

        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('institution')}>
                Bank Name {sortColumn === 'institution' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                Purpose {sortColumn === 'name' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('current_balance')}>
                Current Balance {sortColumn === 'current_balance' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_updated')}>
                Last Updated {sortColumn === 'last_updated' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('remarks')}>
                Remarks {sortColumn === 'remarks' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedAccounts.length > 0 ? (
              sortedAccounts.map(acc => (
                <tr key={acc.id}>
                  <td style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Landmark size={16} style={{ color: 'var(--accent)' }} />
                    {acc.institution}
                  </td>
                  <td>{acc.name}</td>
                  <td style={{ fontWeight: 600, color: 'var(--success)' }}>
                    {formatCurrency(acc.current_balance)}
                  </td>
                  <td>{acc.last_updated}</td>
                  <td style={{ fontSize: '13px', color: 'var(--text-muted)' }}>{acc.remarks || '-'}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => openEditModal(acc)}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDelete(acc.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                  No accounts found. Click "Add Account" to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingAccount ? 'Edit Account' : 'Add New Account'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div className="form-group">
              <label className="form-label">Bank Name</label>
              <input 
                type="text" 
                className="form-input" 
                required 
                placeholder="e.g. HDFC Bank" 
                value={institution} 
                onChange={e => setInstitution(e.target.value)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Purpose</label>
              <select 
                className="form-input" 
                required 
                value={standardPurposes.includes(name) ? name : (name ? "Custom" : "")} 
                onChange={e => {
                  const val = e.target.value;
                  if (val === "Custom") {
                    setName("");
                  } else {
                    setName(val);
                  }
                }} 
              >
                <option value="" disabled>Select Purpose</option>
                {standardPurposes.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
                <option value="Custom">Custom (Type below)</option>
              </select>
            </div>

            {(!standardPurposes.includes(name) || name === "") && (
              <div className="form-group">
                <label className="form-label">Custom Purpose Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  placeholder="e.g. Travel Savings" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                />
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Current Balance (₹)</label>
              <input 
                type="number" 
                className="form-input" 
                required 
                value={balance} 
                onChange={e => setBalance(parseFloat(e.target.value) || 0)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Remarks</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Optional notes" 
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Account</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
