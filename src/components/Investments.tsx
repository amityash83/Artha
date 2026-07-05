import React, { useState } from 'react';
import { Plus, Edit2, Trash2, PieChart, X } from 'lucide-react';
import { Investment, Goal } from '../types';

interface InvestmentsProps {
  investments: Investment[];
  goals: Goal[];
  onRefresh: () => void;
}

export const Investments: React.FC<InvestmentsProps> = ({ investments, goals, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);

  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Investment>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Investment) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Form State
  const [name, setName] = useState('');
  const [type, setType] = useState('Mutual Fund');
  const [investedAmount, setInvestedAmount] = useState<number>(0);
  const [currentValue, setCurrentValue] = useState<number>(0);
  const [goalMapping, setGoalMapping] = useState('');

  const openAddModal = () => {
    setEditingInv(null);
    setName('');
    setType('Mutual Fund');
    setInvestedAmount(0);
    setCurrentValue(0);
    setGoalMapping('');
    setModalOpen(true);
  };

  const openEditModal = (inv: Investment) => {
    setEditingInv(inv);
    setName(inv.name);
    setType(inv.type);
    setInvestedAmount(inv.invested_amount);
    setCurrentValue(inv.current_value);
    setGoalMapping(inv.goal_mapping || '');
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, type, invested_amount: investedAmount, current_value: currentValue,
      goal_mapping: goalMapping
    };
    const url = editingInv 
      ? `http://127.0.0.1:8000/api/investments/${editingInv.id}` 
      : 'http://127.0.0.1:8000/api/investments';
    const method = editingInv ? 'PUT' : 'POST';

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
    if (!confirm("Are you sure you want to delete this investment entry?")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/investments/${id}`, { method: 'DELETE' });
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

  const totalInvested = investments.reduce((sum, i) => sum + i.invested_amount, 0);
  const totalCurrent = investments.reduce((sum, i) => sum + i.current_value, 0);
  const gainLoss = totalCurrent - totalInvested;
  const gainPercent = totalInvested > 0 ? (gainLoss / totalInvested) * 100 : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Investments</h1>
          <p className="page-subtitle">Manage mutual funds, stocks, and retirement corpora</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Investment
        </button>
      </div>

      {/* Aggregate stats */}
      <div className="dashboard-grid" style={{ marginBottom: '24px' }}>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Invested</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px' }}>{formatCurrency(totalInvested)}</h3>
        </div>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Current Value</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px', color: 'var(--success)' }}>{formatCurrency(totalCurrent)}</h3>
        </div>
        <div className="glass-card">
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Returns</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, marginTop: '8px', color: gainLoss >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {formatCurrency(gainLoss)}
            <span style={{ fontSize: '12px', fontWeight: 600 }}>({gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(1)}%)</span>
          </h3>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <table className="custom-table">
          <thead>
            <tr>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>
                Investment Name {sortColumn === 'name' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('type')}>
                Asset Type {sortColumn === 'type' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('invested_amount')}>
                Invested Capital {sortColumn === 'invested_amount' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('current_value')}>
                Current Value {sortColumn === 'current_value' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('goal_mapping')}>
                Goal Mapping {sortColumn === 'goal_mapping' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ cursor: 'pointer' }} onClick={() => handleSort('last_updated')}>
                Last Updated {sortColumn === 'last_updated' ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''}
              </th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const sorted = [...investments].sort((a, b) => {
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
                sorted.map(inv => {
                  const profit = inv.current_value - inv.invested_amount;
                  const profitPct = inv.invested_amount > 0 ? (profit / inv.invested_amount) * 100 : 0;
                  
                  return (
                    <tr key={inv.id}>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <PieChart size={16} style={{ color: 'var(--accent-light)' }} />
                        {inv.name}
                      </td>
                      <td>{inv.type}</td>
                      <td>{formatCurrency(inv.invested_amount)}</td>
                      <td style={{ fontWeight: 600, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {formatCurrency(inv.current_value)}
                        <span style={{ fontSize: '11px', marginLeft: '6px', fontWeight: 500 }}>
                          ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(0)}%)
                        </span>
                      </td>
                      <td style={{ fontWeight: 500, color: 'var(--accent-light)' }}>
                        {inv.goal_mapping || <span style={{ color: 'var(--text-muted)' }}>None</span>}
                      </td>
                      <td>{inv.last_updated}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', gap: '8px' }}>
                          <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => openEditModal(inv)}>
                            <Edit2 size={13} />
                          </button>
                          <button className="btn btn-danger" style={{ padding: '6px' }} onClick={() => handleDelete(inv.id)}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    No investments recorded yet. Click "Add Investment" to seed assets.
                  </td>
                </tr>
              );
            })()}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingInv ? 'Edit Investment' : 'Add New Investment'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Investment Name</label>
              <input type="text" className="form-input" required placeholder="e.g. Nippon India Small Cap Fund" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Asset Type</label>
                <select className="form-input" value={type} onChange={e => setType(e.target.value)}>
                  <option value="Mutual Fund">Mutual Fund</option>
                  <option value="Stock">Stock Portfolio</option>
                  <option value="PPF">Public Provident Fund (PPF)</option>
                  <option value="EPF">Employee Provident Fund (EPF)</option>
                  <option value="NPS">National Pension System (NPS)</option>
                  <option value="Gold">Gold Asset</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Goal Mapping</label>
                <select className="form-input" value={goalMapping} onChange={e => setGoalMapping(e.target.value)}>
                  <option value="">None (General Asset)</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Invested Amount (₹)</label>
                <input type="number" className="form-input" required value={investedAmount} onChange={e => setInvestedAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Current Value (₹)</label>
                <input type="number" className="form-input" required value={currentValue} onChange={e => setCurrentValue(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Investment</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
