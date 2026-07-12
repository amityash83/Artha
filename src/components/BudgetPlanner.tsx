import React, { useState, useEffect } from 'react';
import { 
  Sliders, Check, Edit2, X
} from 'lucide-react';
import { InitData, Category } from '../types';
import { API_BASE_URL } from '../config';

interface BudgetPlannerProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface MonthSpent {
  [categoryName: string]: number;
}

export const BudgetPlanner: React.FC<BudgetPlannerProps> = ({ data, onRefresh, showToast }) => {
  const categories = data.categories.filter(c => c.entity_type === 'Expense');
  
  // Selected Month (YYYY-MM)
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [tempBudget, setTempBudget] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);
  const [spentData, setSpentData] = useState<MonthSpent>({});
  const [loadingSpent, setLoadingSpent] = useState<boolean>(false);

  useEffect(() => {
    const today = new Date();
    const yearStr = today.getFullYear();
    const monthStr = String(today.getMonth() + 1).padStart(2, '0');
    setSelectedMonth(`${yearStr}-${monthStr}`);
  }, []);

  const fetchMonthSpent = async () => {
    if (!selectedMonth) return;
    setLoadingSpent(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions`);
      if (res.ok) {
        const txs = await res.json();
        const monthlySpent: MonthSpent = {};
        
        txs.forEach((tx: any) => {
          if (tx.type === 'Debit' && tx.transaction_date && tx.category_id) {
            if (tx.transaction_date.startsWith(selectedMonth)) {
              const cat = data.categories.find(c => c.id === tx.category_id);
              if (cat && cat.entity_type === 'Expense') {
                monthlySpent[cat.name] = (monthlySpent[cat.name] || 0) + tx.amount;
              }
            }
          }
        });

        setSpentData(monthlySpent);
      }
    } catch (err) {
      console.error("Failed to fetch spent data:", err);
    } finally {
      setLoadingSpent(false);
    }
  };

  useEffect(() => {
    fetchMonthSpent();
  }, [selectedMonth, data.categories]);

  const handleEditClick = (cat: Category) => {
    setEditingCategoryId(cat.id);
    setTempBudget(String(cat.monthly_budget || 0));
  };

  const handleSaveBudget = async (cat: Category) => {
    setSaving(true);
    try {
      const budgetVal = parseFloat(tempBudget) || 0;
      
      const payload = {
        name: cat.name,
        entity_type: cat.entity_type,
        fields_definition: cat.fields_definition,
        monthly_budget: budgetVal
      };

      const res = await fetch(`${API_BASE_URL}/api/metadata/categories/${cat.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setEditingCategoryId(null);
        onRefresh();
        if (showToast) showToast("Budget updated successfully!", "success");
      } else {
        if (showToast) showToast("Failed to update budget.", "error");
        else alert("Failed to update budget.");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  const totalBudget = categories.reduce((sum, c) => sum + (c.monthly_budget || 0), 0);
  const totalSpent = Object.values(spentData).reduce((sum, v) => sum + v, 0);
  const budgetRemaining = totalBudget - totalSpent;
  const isOverBudget = budgetRemaining < 0;

  const getMonthOptions = () => {
    const options = [];
    const today = new Date();
    for (let i = 0; i < 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const yearStr = d.getFullYear();
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const val = `${yearStr}-${monthStr}`;
      const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      options.push({ val, label });
    }
    return options;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Interactive Budget Planner</h1>
          <p className="page-subtitle">Configure spending guidelines and monitor actual debit postings in real-time</p>
        </div>
        <div>
          <select 
            className="form-input" 
            style={{ width: '200px', background: 'rgba(15,23,42,0.8)', color: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px' }}
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
          >
            {getMonthOptions().map(opt => (
              <option key={opt.val} value={opt.val}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '24px' }}>
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Allocated Budget</span>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', margin: '4px 0' }}>{formatCurrency(totalBudget)}</h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Target monthly ceiling limits</span>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Actual Spend</span>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: totalSpent > totalBudget ? 'var(--danger-light)' : 'var(--success-light)', margin: '4px 0' }}>{formatCurrency(totalSpent)}</h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Accumulated debits for chosen month</span>
        </div>

        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{isOverBudget ? 'Budget Overrun' : 'Budget Remaining'}</span>
          <h2 style={{ fontSize: '24px', fontWeight: 700, color: isOverBudget ? 'var(--danger)' : '#10b981', margin: '4px 0' }}>
            {isOverBudget ? `-${formatCurrency(Math.abs(budgetRemaining))}` : formatCurrency(budgetRemaining)}
          </h2>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {isOverBudget ? 'Spent over limit!' : 'Under budget allowance'}
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '20px' }}>Expense Budgets &amp; Comparison</h3>
        
        {loadingSpent ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Calculating real-time category spends...</div>
        ) : categories.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Sliders size={32} style={{ marginBottom: '12px', opacity: 0.5 }} />
            <div>No Expense categories registered. Please create categories first in Settings.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {categories.map((cat) => {
              const spent = spentData[cat.name] || 0;
              const budget = cat.monthly_budget || 0;
              const ratio = budget > 0 ? (spent / budget) * 100 : 0;
              const isOver = spent > budget && budget > 0;
              const progressColor = isOver ? 'var(--danger)' : ratio >= 75 ? 'var(--warning)' : '#10b981';

              const isEditing = editingCategoryId === cat.id;

              return (
                <div key={cat.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr auto', gap: '24px', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '16px' }} className="grid-split">
                  <div>
                    <h4 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', margin: 0 }}>{cat.name}</h4>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Spent: <strong>{formatCurrency(spent)}</strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                      <span>Usage: {ratio.toFixed(0)}%</span>
                      {budget === 0 && <span style={{ color: 'var(--text-muted)' }}>No Budget Set</span>}
                    </div>
                    {budget > 0 && (
                      <div style={{ height: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(ratio, 100)}%`,
                          height: '100%',
                          background: progressColor,
                          boxShadow: `0 0 8px ${progressColor}33`
                        }}></div>
                      </div>
                    )}
                  </div>

                  <div>
                    {isEditing ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>₹</span>
                        <input 
                          type="number" 
                          className="form-input" 
                          style={{ width: '90px', padding: '4px 8px', fontSize: '13px' }}
                          value={tempBudget}
                          onChange={(e) => setTempBudget(e.target.value)}
                          disabled={saving}
                        />
                      </div>
                    ) : (
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#f1f5f9' }}>
                        {budget > 0 ? formatCurrency(budget) : '₹0'}
                      </div>
                    )}
                  </div>

                  <div>
                    {isEditing ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', color: '#10b981' }}
                          onClick={() => handleSaveBudget(cat)}
                          disabled={saving}
                        >
                          <Check size={14} />
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '6px' }}
                          onClick={() => setEditingCategoryId(null)}
                          disabled={saving}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: '6px 12px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onClick={() => handleEditClick(cat)}
                      >
                        <Edit2 size={11} /> Edit Limit
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
