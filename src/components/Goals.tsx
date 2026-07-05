import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Target, X } from 'lucide-react';
import { Goal } from '../types';

interface GoalsProps {
  goals: Goal[];
  onRefresh: () => void;
}

export const Goals: React.FC<GoalsProps> = ({ goals, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Sorting State
  const [sortColumn, setSortColumn] = useState<keyof Goal>('name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: keyof Goal) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Form State
  const [name, setName] = useState('');
  const [targetAmount, setTargetAmount] = useState<number>(0);
  const [currentAmount, setCurrentAmount] = useState<number>(0);
  const [monthlyContribution, setMonthlyContribution] = useState<number>(0);
  const [goalType, setGoalType] = useState('General');

  const openAddModal = () => {
    setEditingGoal(null);
    setName('');
    setTargetAmount(0);
    setCurrentAmount(0);
    setMonthlyContribution(0);
    setGoalType('General');
    setModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setTargetAmount(goal.target_amount);
    setCurrentAmount(goal.current_amount);
    setMonthlyContribution(goal.monthly_contribution);
    setGoalType(goal.goal_type);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name, target_amount: targetAmount, current_amount: currentAmount,
      monthly_contribution: monthlyContribution, goal_type: goalType
    };

    const url = editingGoal 
      ? `http://127.0.0.1:8000/api/goals/${editingGoal.id}` 
      : 'http://127.0.0.1:8000/api/goals';
    const method = editingGoal ? 'PUT' : 'POST';

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
    if (!confirm("Are you sure you want to delete this goal?")) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/goals/${id}`, { method: 'DELETE' });
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

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 className="page-title">Goals Tracker</h1>
          <p className="page-subtitle">Define, track, and forecast long-term financial milestones</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Goal
        </button>
      </div>

      {/* Sort toolbar */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px', marginBottom: '16px', background: 'rgba(255,255,255,0.02)', padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Sort Goals By:</span>
        <select 
          className="form-input" 
          style={{ padding: '4px 10px', fontSize: '12px', width: '180px' }}
          value={sortColumn}
          onChange={e => handleSort(e.target.value as keyof Goal)}
        >
          <option value="name">Goal Name</option>
          <option value="target_amount">Target Amount</option>
          <option value="current_amount">Current Funded</option>
          <option value="monthly_contribution">Monthly Saving</option>
        </select>
        <button 
          className="btn btn-secondary" 
          style={{ padding: '6px 12px', fontSize: '12px' }}
          onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
        >
          {sortDirection === 'asc' ? 'Ascending ▲' : 'Descending ▼'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '24px' }}>
        {(() => {
          const sorted = [...goals].sort((a, b) => {
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
            sorted.map(goal => {
              const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
              const statusClass = progress >= 100 ? 'green' : goal.monthly_contribution > 0 ? 'yellow' : 'red';
              const statusLabel = progress >= 100 ? 'Completed' : goal.monthly_contribution > 0 ? 'Active' : 'Unfunded';

              return (
                <div key={goal.id} className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Target size={18} style={{ color: 'var(--accent-light)' }} />
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{goal.name}</h3>
                      <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{goal.goal_type}</span>
                    </div>
                  </div>
                  <span className={`status-badge ${statusClass}`} style={{ fontSize: '10px' }}>
                    {statusLabel}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Currently Saved</span>
                    <p style={{ fontSize: '15px', fontWeight: 600, marginTop: '2px' }}>{formatCurrency(goal.current_amount)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target Value</span>
                    <p style={{ fontSize: '15px', fontWeight: 600, marginTop: '2px' }}>{formatCurrency(goal.target_amount)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Gap Shortfall</span>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--danger)', marginTop: '2px' }}>{formatCurrency(goal.gap)}</p>
                  </div>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Monthly Saving</span>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--success)', marginTop: '2px' }}>{formatCurrency(goal.monthly_contribution)}/mo</p>
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                    <div style={{ 
                      width: `${Math.min(progress, 100)}%`, 
                      height: '100%', 
                      background: 'var(--accent-gradient)',
                      borderRadius: '50px'
                    }}></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    <span>Progress: {progress.toFixed(0)}%</span>
                    <span>Est. Closure: {goal.expected_completion}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
                  <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', gap: '4px' }} onClick={() => openEditModal(goal)}>
                    <Edit2 size={12} /> Edit
                  </button>
                  <button className="btn btn-danger" style={{ padding: '6px 12px', fontSize: '12px', gap: '4px' }} onClick={() => handleDelete(goal.id)}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
                </div>
              );
            })
          ) : (
            <div className="glass-panel" style={{ padding: '48px', gridColumn: '1 / -1', textAlign: 'center', color: 'var(--text-muted)' }}>
              No financial goals specified. Click "Add Goal" to set milestones.
            </div>
          )
        })()}
      </div>

      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave}>
            <div className="modal-header">
              <h3>{editingGoal ? 'Edit Goal' : 'Create Financial Goal'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="form-group">
              <label className="form-label">Goal Name</label>
              <input type="text" className="form-input" required placeholder="e.g. Retirement Corpus / Villa Downpayment" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Goal Category</label>
                <select className="form-input" value={goalType} onChange={e => setGoalType(e.target.value)}>
                  <option value="Emergency Fund">Emergency Fund</option>
                  <option value="Backup Fund">Backup Fund</option>
                  <option value="Insurance Reserve">Insurance Reserve</option>
                  <option value="Retirement">Retirement</option>
                  <option value="Villa Fund">Villa Fund</option>
                  <option value="Property">Property Fund</option>
                  <option value="General">General Goal</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Target Amount (₹)</label>
                <input type="number" className="form-input" required value={targetAmount} onChange={e => setTargetAmount(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Current Saved Balance (₹)</label>
                <input type="number" className="form-input" required value={currentAmount} onChange={e => setCurrentAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Monthly Savings Contribution (₹)</label>
                <input type="number" className="form-input" required value={monthlyContribution} onChange={e => setMonthlyContribution(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Goal</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
