import React, { useState } from 'react';
import { Plus, Edit2, Trash2, PieChart, X, TrendingUp } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import { Investment, Goal } from '../types';

interface InvestmentsProps {
  investments: Investment[];
  goals: Goal[];
  onRefresh: () => void;
}

export const Investments: React.FC<InvestmentsProps> = ({ investments, goals, onRefresh }) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);

  // Future Wealth Projection States
  const defaultSip = goals.reduce((sum, g) => sum + g.monthly_contribution, 0) || 10000;
  const [projectRoi, setProjectRoi] = useState<number>(12);
  const [projectSip, setProjectSip] = useState<number>(defaultSip);
  const [projectYears, setProjectYears] = useState<number>(15);

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

  // Corpus Growth Projection calculations
  const calculateProjection = () => {
    const schedule = [];
    const monthlyRate = projectRoi / 12 / 100;
    const totalMonths = projectYears * 12;
    let currentCorpus = totalCurrent;
    let totalInvestedCapital = totalCurrent;

    // Push initial year 0
    schedule.push({
      year: 0,
      corpus: Math.round(currentCorpus),
      invested: Math.round(totalInvestedCapital)
    });

    for (let m = 1; m <= totalMonths; m++) {
      currentCorpus = currentCorpus * (1 + monthlyRate) + projectSip;
      totalInvestedCapital += projectSip;

      if (m % 12 === 0 || m === totalMonths) {
        schedule.push({
          year: Math.round(m / 12),
          corpus: Math.round(currentCorpus),
          invested: Math.round(totalInvestedCapital)
        });
      }
    }
    return schedule;
  };

  const projectionData = calculateProjection();
  const finalCorpus = projectionData[projectionData.length - 1].corpus;
  const finalInvested = projectionData[projectionData.length - 1].invested;
  const wealthGained = Math.max(finalCorpus - finalInvested, 0);

  // Prepare chart datasets
  const chartLabels = projectionData.map(d => `Yr ${d.year}`);
  const chartCorpusData = projectionData.map(d => d.corpus);
  const chartInvestedData = projectionData.map(d => d.invested);

  const chartData = {
    labels: chartLabels,
    datasets: [
      {
        label: 'Total Invested Capital',
        data: chartInvestedData,
        borderColor: '#94a3b8',
        borderDash: [5, 5],
        borderWidth: 1.5,
        tension: 0.1,
        pointRadius: 2
      },
      {
        label: 'Projected Corpus Value',
        data: chartCorpusData,
        borderColor: '#10b981',
        borderWidth: 2.5,
        tension: 0.1,
        pointRadius: 2
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11 }
        }
      },
      tooltip: {
        backgroundColor: '#0d111d',
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Inter' },
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => ` Value: ${formatCurrency(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 10 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { 
          color: '#64748b', 
          font: { family: 'Inter', size: 10 },
          callback: (value: any) => {
            if (value >= 10000000) return `₹${(value/10000000).toFixed(1)}Cr`;
            if (value >= 100000) return `₹${(value/100000).toFixed(0)}L`;
            return `₹${value}`;
          }
        }
      }
    }
  };

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

      {/* Future Wealth & Corpus Projector Panel */}
      <div className="glass-panel" style={{ padding: '24px', marginTop: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={18} style={{ color: 'var(--success)' }} />
          Future Wealth &amp; Corpus Projection Sandbox
        </h2>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Simulate how your current holdings of <strong>{formatCurrency(totalCurrent)}</strong> grow over time with compound returns and monthly SIP contributions.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '32px' }}>
          {/* Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderRight: '1px solid var(--border-glass)', paddingRight: '32px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span>Expected Annual Return (ROI)</span>
                <strong style={{ color: 'var(--success)' }}>{projectRoi}%</strong>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="range" min={5} max={25} step={0.5}
                  value={projectRoi} 
                  onChange={e => setProjectRoi(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <input 
                  type="number" className="form-input" 
                  value={projectRoi} 
                  onChange={e => setProjectRoi(Math.max(Number(e.target.value), 0))}
                  style={{ width: '60px', padding: '4px 6px', textAlign: 'center', fontSize: '12px' }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span>Monthly SIP Contribution</span>
                <strong style={{ color: 'var(--info)' }}>{formatCurrency(projectSip)}</strong>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="range" min={0} max={200000} step={5000}
                  value={projectSip} 
                  onChange={e => setProjectSip(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <input 
                  type="number" className="form-input" 
                  value={projectSip} 
                  onChange={e => setProjectSip(Math.max(Number(e.target.value), 0))}
                  style={{ width: '90px', padding: '4px 6px', textAlign: 'right', fontSize: '12px' }}
                />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                <span>Time Horizon (Years)</span>
                <strong style={{ color: '#fff' }}>{projectYears} Years</strong>
              </div>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <input 
                  type="range" min={5} max={35} step={1}
                  value={projectYears} 
                  onChange={e => setProjectYears(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
                <input 
                  type="number" className="form-input" 
                  value={projectYears} 
                  onChange={e => setProjectYears(Math.max(Number(e.target.value), 1))}
                  style={{ width: '60px', padding: '4px 6px', textAlign: 'center', fontSize: '12px' }}
                />
              </div>
            </div>
          </div>

          {/* Outputs & Graph */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Projected Total Corpus</span>
                <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--success)' }}>{formatCurrency(finalCorpus)}</h4>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total Capital Invested</span>
                <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{formatCurrency(finalInvested)}</h4>
              </div>
              <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(255,255,255,0.01)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Estimated Returns Earned</span>
                <h4 style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--info)' }}>{formatCurrency(wealthGained)}</h4>
              </div>
            </div>

            {/* Line chart container */}
            <div style={{ height: '240px', position: 'relative', marginTop: '10px' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>
        </div>
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
