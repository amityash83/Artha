import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { 
  TrendingDown, ShieldCheck, Zap
} from 'lucide-react';
import { InitData } from '../types';

interface LoanOptimizerProps {
  data: InitData;
}

export const LoanOptimizer: React.FC<LoanOptimizerProps> = ({ data }) => {
  const { loans } = data;
  const [budget, setBudget] = useState<number>(50000); // 50k default extra monthly
  const [loading, setLoading] = useState<boolean>(false);
  const [results, setResults] = useState<any>(null);

  const calculateOptimalPayoffs = async () => {
    if (loans.length === 0) return;
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8000/api/calculations/loan-optimizer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loans: loans,
          extra_monthly_budget: budget
        })
      });
      if (res.ok) {
        const d = await res.json();
        setResults(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    calculateOptimalPayoffs();
  }, [budget, loans]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatMonths = (months: number) => {
    const yrs = Math.floor(months / 12);
    const mths = Math.round(months % 12);
    let str = '';
    if (yrs > 0) str += `${yrs} Yr${yrs > 1 ? 's' : ''}`;
    if (mths > 0) str += `${str ? ' ' : ''}${mths} Mo${mths > 1 ? 's' : ''}`;
    return str || '0 Months';
  };

  const activeLoans = loans.filter(l => l.outstanding > 0);

  const buildChartData = () => {
    if (!results) return null;
    const { baseline, avalanche, snowball } = results;
    
    const maxLen = Math.max(baseline.schedule.length, avalanche.schedule.length, snowball.schedule.length);
    const labels = Array.from({ length: maxLen }, (_, i) => `Mo ${i + 1}`);

    const padSchedule = (schedule: any[]) => {
      const data = schedule.map(s => s.outstanding);
      while (data.length < maxLen) {
        data.push(0);
      }
      return data;
    };

    return {
      labels: labels.filter((_, idx) => idx % 6 === 0),
      datasets: [
        {
          label: 'Baseline (No Prepays)',
          data: padSchedule(baseline.schedule).filter((_, idx) => idx % 6 === 0),
          borderColor: '#ef4444',
          borderDash: [5, 5],
          borderWidth: 1.5,
          tension: 0.1,
          pointRadius: 0
        },
        {
          label: 'Snowball (Low Balance First)',
          data: padSchedule(snowball.schedule).filter((_, idx) => idx % 6 === 0),
          borderColor: '#3b82f6',
          borderWidth: 2,
          tension: 0.1,
          pointRadius: 0
        },
        {
          label: 'Avalanche (High ROI First)',
          data: padSchedule(avalanche.schedule).filter((_, idx) => idx % 6 === 0),
          borderColor: '#10b981',
          borderWidth: 2.5,
          tension: 0.1,
          pointRadius: 0
        }
      ]
    };
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
          label: (context: any) => ` Outstanding: ${formatCurrency(context.parsed.y)}`
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
          callback: (value: any) => `₹${(value/100000).toFixed(0)}L`
        }
      }
    }
  };

  const chartData = buildChartData();

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <h1 className="page-title">Multi-Loan Payoff Optimizer</h1>
        <p className="page-subtitle">Simulate and compare the Snowball vs. Avalanche strategies to close all active loans optimally.</p>
      </div>

      {activeLoans.length === 0 ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <ShieldCheck size={48} style={{ color: 'var(--success)', margin: '0 auto 16px auto', opacity: 0.5 }} />
          <h3>No Outstanding Loans</h3>
          <p>Your portfolio is currently debt-free! The optimizer is active when you have active loans.</p>
        </div>
      ) : (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '24px', marginBottom: '24px' }}>
            <div className="glass-panel" style={{ padding: '24px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} style={{ color: 'var(--accent-light)' }} />
                Set Monthly Prepayment Surplus
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Define the extra cash you can allocate towards debt principal reductions every month in addition to normal EMIs.
              </p>
              
              <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                <div style={{ flexGrow: 1 }}>
                  <input 
                    type="range" 
                    min={5000} 
                    max={200000} 
                    step={5000}
                    value={budget} 
                    onChange={e => setBudget(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    <span>₹5,000 / month</span>
                    <span>₹1,00,000 / month</span>
                    <span>₹2,00,000 / month</span>
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: '10px', top: '8px', color: 'var(--text-muted)', fontSize: '14px' }}>₹</span>
                  <input 
                    type="number" 
                    className="form-input" 
                    style={{ width: '140px', padding: '6px 12px 6px 24px', textAlign: 'right', fontSize: '15px', fontWeight: 600 }}
                    value={budget} 
                    onChange={e => setBudget(Math.max(Number(e.target.value), 0))}
                  />
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Debts to Clear</span>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginTop: '4px', color: '#fff' }}>
                  {activeLoans.length} Loans Active
                </h3>
              </div>
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '4px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Outstanding Balance</span>
                  <strong style={{ color: 'var(--danger)' }}>
                    {formatCurrency(activeLoans.reduce((sum, l) => sum + l.outstanding, 0))}
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Base EMI commitments</span>
                  <strong style={{ color: '#fff' }}>
                    {formatCurrency(activeLoans.reduce((sum, l) => sum + l.emi, 0))}
                  </strong>
                </div>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', marginBottom: '24px' }}>
              <div className="spin-anim" style={{ width: '36px', height: '36px', border: '3px solid rgba(139, 92, 246, 0.1)', borderTop: '3px solid #8b5cf6', borderRadius: '50%', margin: '0 auto 16px auto' }}></div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Simulating Avalanche &amp; Snowball payoff paths...</p>
              <style>{`
                .spin-anim {
                  animation: spin 1s linear infinite;
                }
                @keyframes spin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(360deg); }
                }
              `}</style>
            </div>
          ) : (
            <>
              {results && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px', marginBottom: '24px' }}>
                  <div className="glass-panel" style={{ padding: '20px', border: '1px solid var(--border-glass)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Strategy 1</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 600, margin: '4px 0 12px 0', color: 'var(--text-secondary)' }}>Baseline (EMIs only)</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Interest Paid:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(results.baseline.total_interest)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Months to close:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatMonths(results.baseline.months)}</strong>
                      </div>
                      <div style={{ borderTop: '1px dashed var(--border-glass)', marginTop: '8px', paddingTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>
                        No extra savings. Paying regular EMIs.
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '20px', border: '1px solid rgba(59, 130, 246, 0.2)', background: 'rgba(59, 130, 246, 0.02)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--info)', textTransform: 'uppercase', fontWeight: 600 }}>Strategy 2</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 600, margin: '4px 0 12px 0', color: 'var(--info)' }}>Snowball (Low Balance)</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Interest Paid:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(results.snowball.total_interest)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Months to close:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatMonths(results.snowball.months)}</strong>
                      </div>
                      <div style={{ borderTop: '1px dashed rgba(59, 130, 246, 0.2)', marginTop: '8px', paddingTop: '8px', fontSize: '12px', color: 'var(--info)' }}>
                        Saved <strong>{formatCurrency(Math.max(results.baseline.total_interest - results.snowball.total_interest, 0))}</strong> in interest &amp; closed <strong>{formatMonths(Math.max(results.baseline.months - results.snowball.months, 0))}</strong> early!
                      </div>
                    </div>
                  </div>

                  <div className="glass-panel" style={{ padding: '20px', border: '1px solid rgba(16, 185, 129, 0.2)', background: 'rgba(16, 185, 129, 0.02)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--success)', textTransform: 'uppercase', fontWeight: 600 }}>Strategy 3</span>
                    <h4 style={{ fontSize: '16px', fontWeight: 600, margin: '4px 0 12px 0', color: 'var(--success)' }}>Avalanche (High ROI)</h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Interest Paid:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(results.avalanche.total_interest)}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                        <span style={{ color: 'var(--text-muted)' }}>Months to close:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatMonths(results.avalanche.months)}</strong>
                      </div>
                      <div style={{ borderTop: '1px dashed rgba(16, 185, 129, 0.2)', marginTop: '8px', paddingTop: '8px', fontSize: '12px', color: 'var(--success)' }}>
                        Saved <strong>{formatCurrency(Math.max(results.baseline.total_interest - results.avalanche.total_interest, 0))}</strong> in interest &amp; closed <strong>{formatMonths(Math.max(results.baseline.months - results.avalanche.months, 0))}</strong> early!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {chartData && (
                <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingDown size={18} style={{ color: 'var(--accent-light)' }} />
                    Comparative Payoff Curves
                  </h3>
                  <div style={{ height: '320px', position: 'relative' }}>
                    <Line data={chartData} options={chartOptions} />
                  </div>
                </div>
              )}
            </>
          )}

          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Active Debts Portfolio</h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="custom-table">
                <thead>
                  <tr>
                    <th>Loan Name</th>
                    <th>Lender</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th style={{ textAlign: 'right' }}>ROI</th>
                    <th style={{ textAlign: 'right' }}>EMI</th>
                    <th style={{ textAlign: 'right' }}>Remaining Months</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLoans.map(l => (
                    <tr key={l.id}>
                      <td><strong>{l.name}</strong></td>
                      <td>{l.lender}</td>
                      <td style={{ textAlign: 'right', color: 'var(--danger)', fontWeight: 500 }}>{formatCurrency(l.outstanding)}</td>
                      <td style={{ textAlign: 'right' }}>{l.roi}%</td>
                      <td style={{ textAlign: 'right' }}>{formatCurrency(l.emi)}</td>
                      <td style={{ textAlign: 'right' }}>{l.remaining_tenure} Mos</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      )}
    </div>
  );
};
