import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, TrendingDown, Plus, Trash2, Edit2,
  Sparkles, RefreshCw, Info, AlertTriangle, CheckCircle, Shield
} from 'lucide-react';
import { InitData, MonthlyCashFlow } from '../types';
import { API_BASE_URL } from '../config';

interface CashFlowPlanningProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const CashFlowPlanning: React.FC<CashFlowPlanningProps> = ({ data, onRefresh, showToast }) => {
  const { cash_flows = [], liabilities, assets, goals, accounts } = data;
  const loans = liabilities.filter((l: any) => l.category_name !== 'Credit Card');
  const properties = assets.filter((a: any) => a.category_name === 'Property');
  const insurance = assets.filter((a: any) => a.category_name === 'Insurance');
  
  // Tab State: 'dashboard' | 'history' | 'simulation'
  const [activeSubTab, setActiveSubTab] = useState<'dashboard' | 'history' | 'simulation'>('dashboard');

  // Form State for new/editing snapshot
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingCfId, setDeletingCfId] = useState<number | null>(null);
  
  const [month, setMonth] = useState('');
  const [netSalary, setNetSalary] = useState<number>(150000);
  const [otherIncome, setOtherIncome] = useState<number>(20000);
  const [householdExpenses, setHouseholdExpenses] = useState<number>(45000);
  const [emi, setEmi] = useState<number>(35000);
  const [insurancePremium, setInsurancePremium] = useState<number>(5000);
  const [investments, setInvestments] = useState<number>(30000);
  const [oneTimeExpenses, setOneTimeExpenses] = useState<number>(0);
  const [notes, setNotes] = useState('');

  // What-If Simulation State
  const [simSalaryChangePct, setSimSalaryChangePct] = useState<number>(0);
  const [simSalaryChangeAbs, setSimSalaryChangeAbs] = useState<number>(0);
  const [simOneTimeBonus, setSimOneTimeBonus] = useState<number>(0);
  const [simNewEmi, setSimNewEmi] = useState<number>(0);
  const [simEmiReduction, setSimEmiReduction] = useState<number>(0);
  const [simAdditionalInvestment, setSimAdditionalInvestment] = useState<number>(0);
  const [simExpenseReductionPct, setSimExpenseReductionPct] = useState<number>(0);
  const [simExpenseReductionAbs, setSimExpenseReductionAbs] = useState<number>(0);
  
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState<boolean>(false);

  // Dynamic target savings rate from database rules
  const savingsRateRule = data.rules?.find((r: any) => r.rule_key === 'target_savings_rate');
  const targetSavingsRate = savingsRateRule && savingsRateRule.is_enabled === 1 ? savingsRateRule.value : 35.0;

  // Auto fill date
  useEffect(() => {
    const today = new Date();
    const MM = String(today.getMonth() + 1).padStart(2, '0');
    setMonth(`${today.getFullYear()}-${MM}`);
  }, []);

  // Compute overall liquid assets from accounts
  const liquidAssets = accounts.reduce((sum, a) => sum + a.current_balance, 0);

  // Find current month cash flow snapshot for dashboard KPI cards
  const latestFlow = cash_flows.length > 0 ? cash_flows[0] : null;
  const previousFlow = cash_flows.length > 1 ? cash_flows[1] : null;

  // Auto-calculate current surplus
  const calculateSurplus = (cf: MonthlyCashFlow | any) => {
    if (!cf) return 0;
    const totalInc = cf.net_salary + cf.other_income;
    const totalExp = cf.household_expenses + cf.one_time_expenses;
    return totalInc - totalExp - cf.emi - cf.insurance_premium - cf.investments;
  };

  const currentSurplus = latestFlow ? calculateSurplus(latestFlow) : 0;
  const currentTotalIncome = latestFlow ? (latestFlow.net_salary + latestFlow.other_income) : 0;
  const currentTotalExpenses = latestFlow ? (latestFlow.household_expenses + latestFlow.one_time_expenses) : 0;
  const currentSavingsRate = currentTotalIncome > 0 ? (currentSurplus / currentTotalIncome * 100) : 0;
  
  // Format Currency
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Run auto-fill routine from database portfolio
  const handleAutoFill = () => {
    // 1. EMI Sum from active outstanding loans
    const emiSum = loans.reduce((sum: number, l: any) => sum + (l.outstanding > 0 ? l.emi : 0), 0);
    setEmi(emiSum);

    // 2. Rental Income sum from properties
    const rentSum = properties.reduce((sum: number, p: any) => sum + (p.rental_income || 0), 0);
    setOtherIncome(rentSum);

    // 3. Pro-rata monthly insurance premium equivalent
    const insSum = insurance.reduce((sum: number, ins: any) => {
      const prem = ins.premium || 0;
      if (ins.frequency === 'Yearly') return sum + Math.round(prem / 12);
      if (ins.frequency === 'Half-Yearly') return sum + Math.round(prem / 6);
      if (ins.frequency === 'Quarterly') return sum + Math.round(prem / 3);
      return sum + prem; // Monthly
    }, 0);
    setInsurancePremium(insSum);

    // 4. Goals contribution sum
    const investSum = goals.reduce((sum: number, g: any) => sum + (g.monthly_contribution || 0), 0);
    setInvestments(investSum);
  };

  // Handle save snapshot
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      id: editingId || undefined,
      month,
      net_salary: netSalary,
      other_income: otherIncome,
      household_expenses: householdExpenses,
      emi,
      insurance_premium: insurancePremium,
      investments,
      one_time_expenses: oneTimeExpenses,
      notes
    };

    try {
      const res = await fetch(`${API_BASE_URL}/api/cash-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setModalOpen(false);
        setEditingId(null);
        setMonth('');
        setOneTimeExpenses(0);
        setNotes('');
        onRefresh();
        if (showToast) showToast("Cash flow snapshot saved successfully!", "success");
      } else {
        if (showToast) showToast("Failed to save snapshot", "error");
        else alert("Failed to save snapshot");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open modal for editing
  const openEdit = (cf: MonthlyCashFlow) => {
    setEditingId(cf.id);
    setMonth(cf.month);
    setNetSalary(cf.net_salary);
    setOtherIncome(cf.other_income);
    setHouseholdExpenses(cf.household_expenses);
    setEmi(cf.emi);
    setInsurancePremium(cf.insurance_premium);
    setInvestments(cf.investments);
    setOneTimeExpenses(cf.one_time_expenses);
    setNotes(cf.notes || '');
    setModalOpen(true);
  };

  // Handle delete
  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/cash-flows/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onRefresh();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Execute What-If simulation request
  const calculateSimulation = async () => {
    if (!latestFlow) return;
    setSimLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculations/cash-flow/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_salary: latestFlow.net_salary,
          other_income: latestFlow.other_income,
          household_expenses: latestFlow.household_expenses,
          emi: latestFlow.emi,
          insurance_premium: latestFlow.insurance_premium,
          investments: latestFlow.investments,
          one_time_expenses: latestFlow.one_time_expenses,
          salary_change_pct: simSalaryChangePct,
          salary_change_abs: simSalaryChangeAbs,
          one_time_bonus: simOneTimeBonus,
          new_emi: simNewEmi,
          emi_reduction: simEmiReduction,
          additional_investment: simAdditionalInvestment,
          expense_reduction_pct: simExpenseReductionPct,
          expense_reduction_abs: simExpenseReductionAbs
        })
      });
      if (res.ok) {
        const d = await res.json();
        setSimResult(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimLoading(false);
    }
  };

  // Run simulation whenever sliders change
  useEffect(() => {
    if (activeSubTab === 'simulation' && latestFlow) {
      calculateSimulation();
    }
  }, [
    simSalaryChangePct, simSalaryChangeAbs, simOneTimeBonus,
    simNewEmi, simEmiReduction, simAdditionalInvestment,
    simExpenseReductionPct, simExpenseReductionAbs, latestFlow, activeSubTab
  ]);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Income &amp; Cash Flow Planning</h1>
          <p className="page-subtitle">Analyze monthly income streams, allocations, savings ratios, and sandbox projections.</p>
        </div>
        <button className="btn btn-primary" onClick={() => {
          setEditingId(null);
          setModalOpen(true);
        }}>
          <Plus size={16} /> Log Monthly Flow
        </button>
      </div>

      {/* Sub tabs navigation */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '8px' }}>
        <button 
          onClick={() => setActiveSubTab('dashboard')} 
          className={`sidebar-item ${activeSubTab === 'dashboard' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Dashboard &amp; Ratios
        </button>
        <button 
          onClick={() => setActiveSubTab('simulation')} 
          className={`sidebar-item ${activeSubTab === 'simulation' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          What-If Planning Sandbox
        </button>
        <button 
          onClick={() => setActiveSubTab('history')} 
          className={`sidebar-item ${activeSubTab === 'history' ? 'active' : ''}`}
          style={{ padding: '8px 16px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '13px' }}
        >
          Monthly Logs ({cash_flows.length})
        </button>
      </div>

      {/* Dashboard View */}
      {activeSubTab === 'dashboard' && (
        <div>
          {cash_flows.length === 0 ? (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Info size={40} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
              <h3>No Cash Flow Logs Found</h3>
              <p style={{ maxWidth: '400px', margin: '8px auto 20px auto', fontSize: '13px' }}>
                Create your first monthly cash flow log to unlock KPIs, safety metrics, ratios analysis, and projections.
              </p>
              <button className="btn btn-primary" onClick={() => setModalOpen(true)}>
                <Plus size={16} /> Log First Month
              </button>
            </div>
          ) : (
            <div>
              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Income</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 4px 0' }}>{formatCurrency(currentTotalIncome)}</h3>
                  {previousFlow && (
                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {currentTotalIncome >= (previousFlow.net_salary + previousFlow.other_income) ? (
                        <TrendingUp size={12} style={{ color: 'var(--success)' }} />
                      ) : (
                        <TrendingDown size={12} style={{ color: 'var(--danger)' }} />
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>Prev: {formatCurrency(previousFlow.net_salary + previousFlow.other_income)}</span>
                    </div>
                  )}
                </div>

                <div className="glass-panel" style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Expenses</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 4px 0', color: 'var(--text-primary)' }}>{formatCurrency(currentTotalExpenses)}</h3>
                  {previousFlow && (
                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {currentTotalExpenses <= (previousFlow.household_expenses + previousFlow.one_time_expenses) ? (
                        <TrendingDown size={12} style={{ color: 'var(--success)' }} />
                      ) : (
                        <TrendingUp size={12} style={{ color: 'var(--danger)' }} />
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>Prev: {formatCurrency(previousFlow.household_expenses + previousFlow.one_time_expenses)}</span>
                    </div>
                  )}
                </div>

                <div className="glass-panel" style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Investments</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 4px 0', color: 'var(--info)' }}>{formatCurrency(latestFlow ? latestFlow.investments : 0)}</h3>
                  {previousFlow && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Prev: {formatCurrency(previousFlow.investments)}
                    </div>
                  )}
                </div>

                <div className="glass-panel" style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Monthly Surplus</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 4px 0', color: currentSurplus >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {formatCurrency(currentSurplus)}
                  </h3>
                  {previousFlow && (
                    <div style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {currentSurplus >= calculateSurplus(previousFlow) ? (
                        <TrendingUp size={12} style={{ color: 'var(--success)' }} />
                      ) : (
                        <TrendingDown size={12} style={{ color: 'var(--danger)' }} />
                      )}
                      <span style={{ color: 'var(--text-muted)' }}>Prev: {formatCurrency(calculateSurplus(previousFlow))}</span>
                    </div>
                  )}
                </div>

                <div className="glass-panel" style={{ padding: '16px 20px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Savings Rate</span>
                  <h3 style={{ fontSize: '20px', fontWeight: 700, margin: '8px 0 4px 0', color: currentSavingsRate >= targetSavingsRate ? 'var(--success)' : 'var(--warning)' }}>
                    {currentSavingsRate.toFixed(1)}%
                  </h3>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Target: {targetSavingsRate}%
                  </div>
                </div>
              </div>

              {/* Ratios & Health Metrics */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px', marginBottom: '24px' }}>
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Cash Flow Ratios &amp; Health Matrix</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Savings Ratio */}
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                        <span>Savings Rate (Surplus ÷ Total Income)</span>
                        <strong>{currentSavingsRate.toFixed(1)}%</strong>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                        <div style={{ 
                          width: `${Math.min(currentSavingsRate, 100)}%`, 
                          height: '100%', 
                          background: currentSavingsRate >= targetSavingsRate ? 'var(--success)' : 'var(--warning)',
                          borderRadius: '50px'
                        }}></div>
                      </div>
                    </div>

                    {/* Investment Rate */}
                    {latestFlow && (() => {
                      const invRate = (latestFlow.investments / currentTotalIncome) * 100;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                            <span>Investment Rate (Investments ÷ Total Income)</span>
                            <strong>{invRate.toFixed(1)}%</strong>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min(invRate, 100)}%`, 
                              height: '100%', 
                              background: 'var(--info)',
                              borderRadius: '50px'
                            }}></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Expense Ratio */}
                    {latestFlow && (() => {
                      const expRate = (latestFlow.household_expenses / currentTotalIncome) * 100;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                            <span>Expense Ratio (Expenses ÷ Total Income)</span>
                            <strong>{expRate.toFixed(1)}%</strong>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min(expRate, 100)}%`, 
                              height: '100%', 
                              background: expRate <= 40 ? 'var(--success)' : 'var(--warning)',
                              borderRadius: '50px'
                            }}></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Debt Burden Ratio */}
                    {latestFlow && (() => {
                      const debtRate = (latestFlow.emi / currentTotalIncome) * 100;
                      return (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px' }}>
                            <span>Debt Burden Ratio (EMI ÷ Total Income)</span>
                            <strong style={{ color: debtRate > 40 ? 'var(--danger)' : 'inherit' }}>{debtRate.toFixed(1)}%</strong>
                          </div>
                          <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                            <div style={{ 
                              width: `${Math.min(debtRate, 100)}%`, 
                              height: '100%', 
                              background: debtRate <= 35 ? 'var(--success)' : (debtRate <= 50 ? 'var(--warning)' : 'var(--danger)'),
                              borderRadius: '50px'
                            }}></div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Liquidity Ratio */}
                    {latestFlow && (() => {
                      const monthlyExp = latestFlow.household_expenses + latestFlow.emi;
                      const liqRatio = monthlyExp > 0 ? (liquidAssets / monthlyExp) : 0;
                      return (
                        <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px', marginTop: '4px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                            <span>Liquidity Ratio (Emergency Buffer)</span>
                            <strong>{liqRatio.toFixed(1)} Months</strong>
                          </div>
                          <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            Your liquid assets ({formatCurrency(liquidAssets)}) can cover approximately <strong>{liqRatio.toFixed(1)} months</strong> of recurring monthly expenses. 
                            {liqRatio >= 6 ? (
                              <span style={{ color: 'var(--success)' }}> (Healthy reserve!)</span>
                            ) : (
                              <span style={{ color: 'var(--warning)' }}> (Target: 6 months minimum)</span>
                            )}
                          </p>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Annual Projections */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>12-Month Projections (Current Rate)</h3>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flexGrow: 1, justifyContent: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px dashed var(--border-glass)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Projected Annual Income</span>
                      <strong>{formatCurrency(currentTotalIncome * 12)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px dashed var(--border-glass)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Projected Annual Expenses</span>
                      <strong>{formatCurrency(currentTotalExpenses * 12)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px dashed var(--border-glass)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Projected Annual Investments</span>
                      <strong>{formatCurrency((latestFlow ? latestFlow.investments : 0) * 12)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px dashed var(--border-glass)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Projected Annual EMI Obligation</span>
                      <strong>{formatCurrency((latestFlow ? latestFlow.emi : 0) * 12)}</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', borderBottom: '1px dashed var(--border-glass)', paddingBottom: '8px' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>Projected Annual Insurance Costs</span>
                      <strong>{formatCurrency((latestFlow ? latestFlow.insurance_premium : 0) * 12)}</strong>
                    </div>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', background: 'rgba(16, 185, 129, 0.05)', padding: '10px 14px', borderRadius: '6px', border: '1px solid rgba(16, 185, 129, 0.1)', marginTop: '8px' }}>
                      <span style={{ fontWeight: 600, color: 'var(--success)' }}>Projected Annual Savings</span>
                      <strong style={{ fontSize: '16px', color: 'var(--success)' }}>{formatCurrency(currentSurplus * 12)}</strong>
                    </div>
                  </div>
                  
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '16px', margin: 0 }}>
                    Adding yearly savings to investments points to an estimated <strong>{formatCurrency((currentSurplus + (latestFlow ? latestFlow.investments : 0)) * 12)}</strong> annual net worth increase.
                  </p>
                </div>
              </div>

              {/* Recommendations Alerts */}
              {data.recommendations && data.recommendations.length > 0 && (
                <div className="glass-panel" style={{ padding: '24px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Decision Engine Recommendations</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Render Savings-specific alerts */}
                    {currentSavingsRate < targetSavingsRate && (
                      <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245,158,11,0.15)', borderRadius: '6px', color: 'var(--warning)', fontSize: '13px' }}>
                        <AlertTriangle size={18} style={{ flexShrink: 0 }} />
                        <div>
                          <strong>Savings Rate Alert:</strong> Your current savings rate is <strong>{currentSavingsRate.toFixed(1)}%</strong> which is below your target of {targetSavingsRate}%. Consider reviewing household discretionary expenses inside Money Manager Ex to increase surplus.
                        </div>
                      </div>
                    )}
                    {currentSurplus > 50000 && (
                      <div style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16,185,129,0.15)', borderRadius: '6px', color: 'var(--success)', fontSize: '13px' }}>
                        <CheckCircle size={18} style={{ flexShrink: 0 }} />
                        <div>
                          <strong>Prepayment/SIP Opportunity:</strong> A healthy monthly surplus of <strong>{formatCurrency(currentSurplus)}</strong> is detected. You can safely deploy ₹20,000 to ₹30,000 toward active loan prepayments or start a new Mutual Fund SIP.
                        </div>
                      </div>
                    )}
                    {/* General alerts mapped from Recommendations */}
                    {data.recommendations.slice(0, 3).map((r, i) => (
                      <div key={i} style={{ display: 'flex', gap: '12px', padding: '12px 16px', background: r.status === 'danger' ? 'rgba(239, 68, 68, 0.05)' : 'rgba(59, 130, 246, 0.05)', border: r.status === 'danger' ? '1px solid rgba(239,68,68,0.15)' : '1px solid rgba(59,130,246,0.15)', borderRadius: '6px', color: r.status === 'danger' ? 'var(--danger)' : 'var(--text-secondary)', fontSize: '13px' }}>
                        <Shield size={18} style={{ flexShrink: 0, color: r.status === 'danger' ? 'var(--danger)' : 'var(--accent-light)' }} />
                        <div>
                          <strong>{r.title}:</strong> {r.message}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* History Table View */}
      {activeSubTab === 'history' && (
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Monthly Cash Flow Snapshot History</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th style={{ textAlign: 'right' }}>Salary</th>
                  <th style={{ textAlign: 'right' }}>Other Income</th>
                  <th style={{ textAlign: 'right' }}>Expenses</th>
                  <th style={{ textAlign: 'right' }}>EMI</th>
                  <th style={{ textAlign: 'right' }}>Investments</th>
                  <th style={{ textAlign: 'right' }}>Surplus</th>
                  <th style={{ textAlign: 'right' }}>Savings Rate</th>
                  <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {cash_flows.map(cf => {
                  const cfSurplus = calculateSurplus(cf);
                  const cfIncome = cf.net_salary + cf.other_income;
                  const cfRate = cfIncome > 0 ? (cfSurplus / cfIncome) * 100 : 0;
                  return (
                    <tr key={cf.id}>
                      <td><strong>{cf.month}</strong></td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(cf.net_salary)}</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(cf.other_income)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatCurrency(cf.household_expenses + cf.one_time_expenses)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{formatCurrency(cf.emi)}</td>
                      <td style={{ textAlign: 'right', color: 'var(--info)' }}>{formatCurrency(cf.investments)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: cfSurplus >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {formatCurrency(cfSurplus)}
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{cfRate.toFixed(1)}%</td>
                      <td>
                        {deletingCfId === cf.id ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                              onClick={() => {
                                handleDelete(cf.id);
                                setDeletingCfId(null);
                              }}
                            >
                              Yes
                            </button>
                            <button 
                              className="btn btn-secondary" 
                              style={{ padding: '2px 6px', fontSize: '10px', minWidth: 'auto' }}
                              onClick={() => setDeletingCfId(null)}
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                            <button className="btn btn-secondary" style={{ padding: '4px' }} onClick={() => openEdit(cf)}>
                              <Edit2 size={12} />
                            </button>
                            <button className="btn btn-danger" style={{ padding: '4px' }} onClick={() => setDeletingCfId(cf.id)}>
                              <Trash2 size={12} />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {cash_flows.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '24px' }}>
                      No history recorded. Log a month above to start tracking.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Simulation Sandbox View */}
      {activeSubTab === 'simulation' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: '24px' }}>
          {/* Controls side */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} style={{ color: 'var(--accent-light)' }} />
              Adjustment Sandbox
            </h3>
            
            {!latestFlow ? (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Please log at least one monthly snapshot before running simulations. The simulator uses the latest month's snapshot as the baseline.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                {/* Salary Change Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span>Salary Increment:</span>
                    <strong style={{ color: 'var(--success)' }}>+{simSalaryChangePct}%</strong>
                  </div>
                  <input 
                    type="range" min={0} max={50} step={2}
                    value={simSalaryChangePct} 
                    onChange={e => setSimSalaryChangePct(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--success)' }}
                  />
                </div>

                {/* Direct Salary Change Amount */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Direct Salary Change Amount (₹)</label>
                  <input 
                    type="number" className="form-input" placeholder="e.g. 15000"
                    value={simSalaryChangeAbs}
                    onChange={e => setSimSalaryChangeAbs(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Windfall Bonus */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>One-time Windfall Bonus (₹)</label>
                  <input 
                    type="number" className="form-input" placeholder="e.g. 500000"
                    value={simOneTimeBonus}
                    onChange={e => setSimOneTimeBonus(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Expense Reduction Slider */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                    <span>Expense Reduction:</span>
                    <strong style={{ color: 'var(--success)' }}>-{simExpenseReductionPct}%</strong>
                  </div>
                  <input 
                    type="range" min={0} max={40} step={2}
                    value={simExpenseReductionPct} 
                    onChange={e => setSimExpenseReductionPct(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--success)' }}
                  />
                </div>

                {/* Extra Investments */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Increase Monthly SIPs (₹)</label>
                  <input 
                    type="number" className="form-input" placeholder="e.g. 10000"
                    value={simAdditionalInvestment}
                    onChange={e => setSimAdditionalInvestment(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* New Loan EMI */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>New EMI Commitment (₹)</label>
                  <input 
                    type="number" className="form-input" placeholder="e.g. 20000"
                    value={simNewEmi}
                    onChange={e => setSimNewEmi(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* EMI Reduction (Loan closure) */}
                <div>
                  <label className="form-label" style={{ fontSize: '12px' }}>Closed Loans EMI Reduction (₹)</label>
                  <input 
                    type="number" className="form-input" placeholder="e.g. 12000"
                    value={simEmiReduction}
                    onChange={e => setSimEmiReduction(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Reset button */}
                <button className="btn btn-secondary" style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }} onClick={() => {
                  setSimSalaryChangePct(0);
                  setSimSalaryChangeAbs(0);
                  setSimOneTimeBonus(0);
                  setSimNewEmi(0);
                  setSimEmiReduction(0);
                  setSimAdditionalInvestment(0);
                  setSimExpenseReductionPct(0);
                  setSimExpenseReductionAbs(0);
                }}>
                  <RefreshCw size={14} /> Reset Sandbox
                </button>
              </div>
            )}
          </div>

          {/* Results side */}
          <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '20px' }}>Simulated Plan Comparison</h3>

            {simLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
                <div className="spin-anim" style={{ width: '32px', height: '32px', border: '3px solid rgba(139,92,246,0.1)', borderTop: '3px solid #8b5cf6', borderRadius: '50%', marginBottom: '16px' }}></div>
                <p style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Recalculating cash flow matrix...</p>
              </div>
            ) : simResult ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flexGrow: 1 }}>
                {/* Side by side stats */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', background: 'rgba(255,255,255,0.01)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Baseline State (Latest)</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Income:</span>
                        <strong>{formatCurrency(simResult.current.income)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Expenses:</span>
                        <span>{formatCurrency(simResult.current.expenses)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>EMI Debt:</span>
                        <span>{formatCurrency(simResult.current.emi)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Investments:</span>
                        <span>{formatCurrency(simResult.current.investments)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border-glass)', paddingTop: '6px', marginTop: '4px' }}>
                        <span>Surplus:</span>
                        <strong>{formatCurrency(simResult.current.surplus)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Savings Rate:</span>
                        <strong>{simResult.current.savings_rate}%</strong>
                      </div>
                    </div>
                  </div>

                  <div style={{ borderLeft: '1px solid var(--border-glass)', paddingLeft: '20px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--accent-light)', textTransform: 'uppercase' }}>Simulated Sandbox State</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Income:</span>
                        <strong style={{ color: 'var(--accent-light)' }}>{formatCurrency(simResult.simulated.income)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Expenses:</span>
                        <span>{formatCurrency(simResult.simulated.expenses)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>EMI Debt:</span>
                        <span style={{ color: simResult.simulated.emi > simResult.current.emi ? 'var(--danger)' : 'inherit' }}>{formatCurrency(simResult.simulated.emi)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Investments:</span>
                        <span style={{ color: simResult.simulated.investments > simResult.current.investments ? 'var(--info)' : 'inherit' }}>{formatCurrency(simResult.simulated.investments)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', borderTop: '1px solid var(--border-glass)', paddingTop: '6px', marginTop: '4px' }}>
                        <span>Surplus:</span>
                        <strong style={{ color: simResult.simulated.surplus >= simResult.current.surplus ? 'var(--success)' : 'var(--danger)' }}>
                          {formatCurrency(simResult.simulated.surplus)}
                        </strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                        <span>Savings Rate:</span>
                        <strong style={{ color: simResult.simulated.savings_rate >= simResult.current.savings_rate ? 'var(--success)' : 'var(--warning)' }}>
                          {simResult.simulated.savings_rate}%
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Impact Statement */}
                <div style={{ background: 'var(--bg-glass)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px', color: 'var(--accent-light)' }}>Financial Impact Analysis</h4>
                  <p style={{ fontSize: '12px', lineHeight: '1.5', margin: 0, color: 'var(--text-secondary)' }}>
                    {simResult.impact_summary}
                  </p>
                </div>

                {/* Recommended Actions */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>Sandbox Recommended Actions</h4>
                  {simResult.recommendations.map((rec: string, index: number) => (
                    <div key={index} style={{ display: 'flex', gap: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                      <span>▪</span>
                      <span>{rec}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1, color: 'var(--text-muted)', fontSize: '12px' }}>
                Simulator is active once a baseline snapshot is loaded.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Snapshot Entry Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3>{editingId ? 'Edit Monthly Cash Flow' : 'Log Monthly Cash Flow Snapshot'}</h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => setModalOpen(false)}>
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Snapshot Month</label>
                <input type="month" className="form-input" required value={month} onChange={e => setMonth(e.target.value)} />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', paddingBottom: '2px' }}>
                <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }} onClick={handleAutoFill}>
                  <RefreshCw size={12} /> Auto-Fill from Portfolio
                </button>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px', marginTop: '8px' }}>
              <div className="form-group">
                <label className="form-label">Net Salary (Credited ₹)</label>
                <input type="number" className="form-input" required value={netSalary} onChange={e => setNetSalary(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Other Income (Rent, Interest ₹)</label>
                <input type="number" className="form-input" required value={otherIncome} onChange={e => setOtherIncome(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">Household Expenses (Living ₹)</label>
                <input type="number" className="form-input" required value={householdExpenses} onChange={e => setHouseholdExpenses(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">One-Time / Extra Expenses (₹)</label>
                <input type="number" className="form-input" required value={oneTimeExpenses} onChange={e => setOneTimeExpenses(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <div className="form-group">
                <label className="form-label">EMI Obligations (₹)</label>
                <input type="number" className="form-input" required value={emi} onChange={e => setEmi(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Insurance Premiums (₹)</label>
                <input type="number" className="form-input" required value={insurancePremium} onChange={e => setInsurancePremium(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Investments (SIPs, PPF ₹)</label>
                <input type="number" className="form-input" required value={investments} onChange={e => setInvestments(parseFloat(e.target.value) || 0)} />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Remarks / Notes</label>
              <textarea 
                className="form-input" 
                rows={2} 
                style={{ resize: 'vertical' }}
                placeholder="Discretionary remarks..." 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save Cash Flow</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
