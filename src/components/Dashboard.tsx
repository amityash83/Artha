import React, { useEffect, useState } from 'react';
import { 
  TrendingUp, TrendingDown, ShieldCheck, 
  AlertTriangle, CheckCircle, ArrowRight 
} from 'lucide-react';
import { Line, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, Title, Tooltip, Legend, Filler, ChartData, ArcElement
} from 'chart.js';
import { InitData, Snapshot } from '../types';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  ArcElement, Title, Tooltip, Legend, Filler
);

interface DashboardProps {
  data: InitData;
  onNavigate: (tab: string, simulationParams?: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ data, onNavigate }) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const { summary, goals, recommendations, rules } = data;

  useEffect(() => {
    fetch('http://127.0.0.1:8000/api/snapshots')
      .then(res => res.json())
      .then(d => setSnapshots(d))
      .catch(err => console.error("Failed to fetch snapshots:", err));
  }, []);

  // Format currency in Indian Rupees style (Lakhs / Crores)
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Liquidity Health indicator
  const minEmergencyRule = rules.find(r => r.rule_key === 'min_emergency_fund');
  const targetLiquidity = minEmergencyRule ? minEmergencyRule.value : 1500000;
  const liquidFunds = summary.total_liquid;
  const liquidityRatio = targetLiquidity > 0 ? (liquidFunds / targetLiquidity) : 1;
  
  let liquidityHealth = 'green';
  let liquidityHealthLabel = 'Healthy';
  if (liquidityRatio < 0.7) {
    liquidityHealth = 'red';
    liquidityHealthLabel = 'Critical Deficit';
  } else if (liquidityRatio < 1.0) {
    liquidityHealth = 'yellow';
    liquidityHealthLabel = 'Warning - Near Limit';
  }

  // Find critical target funds for progress bars
  const emergencyFund = goals.find(g => g.goal_type === 'Emergency Fund');
  const backupFund = goals.find(g => g.goal_type === 'Backup Fund');
  const villaFund = goals.find(g => g.name.toLowerCase().includes('villa'));
  const retirementFund = goals.find(g => g.goal_type === 'Retirement');

  // Chart Configuration
  const chartData: ChartData<'line'> = {
    labels: snapshots.length > 0 ? snapshots.map(s => s.month) : ['Current'],
    datasets: [
      {
        fill: true,
        label: 'Net Worth Growth',
        data: snapshots.length > 0 ? snapshots.map(s => s.net_worth) : [summary.net_worth],
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        tension: 0.4,
        pointBackgroundColor: '#8b5cf6',
        pointHoverRadius: 6,
        borderWidth: 2,
      }
    ]
  };

  const doughnutData = {
    labels: ['Liquid Cash', 'Investments', 'Property Values'],
    datasets: [
      {
        data: [summary.total_liquid, summary.total_investments, summary.total_properties],
        backgroundColor: [
          '#10b981', // green
          '#8b5cf6', // purple
          '#3b82f6'  // blue
        ],
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        hoverOffset: 6
      }
    ]
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          color: '#94a3b8',
          font: { family: 'Inter', size: 11 },
          padding: 8
        }
      },
      tooltip: {
        backgroundColor: '#0d111d',
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Inter' },
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => ` Value: ${formatCurrency(context.parsed)}`
        }
      }
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#0d111d',
        titleFont: { family: 'Outfit' },
        bodyFont: { family: 'Inter' },
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        callbacks: {
          label: (context: any) => ` Net Worth: ${formatCurrency(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#64748b', font: { family: 'Inter', size: 11 } }
      },
      y: {
        grid: { color: 'rgba(255,255,255,0.04)' },
        ticks: { 
          color: '#64748b', 
          font: { family: 'Inter', size: 11 },
          callback: (value: any) => {
            if (value >= 10000000) return `₹${(value/10000000).toFixed(1)}Cr`;
            if (value >= 100000) return `₹${(value/100000).toFixed(0)}L`;
            return `₹${value}`;
          }
        }
      }
    }
  };

  const handleRecommendationAction = (rec: any) => {
    if (rec.action_type === 'prepay') {
      const activeLoan = data.loans.find(l => rec.message.includes(l.name));
      onNavigate('simulations', {
        scenario_type: 'close_loan',
        loan_id: activeLoan?.id || null
      });
    } else {
      onNavigate('simulations');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Artha</h1>
        <p className="page-subtitle">Dashboard &amp; Actionable Decision Support</p>
      </div>

      {/* Top Summaries Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', marginBottom: '32px' }}>
        {/* Net Worth Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Net Worth</span>
              {summary.monthly_change >= 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--success)', fontWeight: 600 }}>
                  <TrendingUp size={14} /> +{formatCurrency(summary.monthly_change)}
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: 'var(--danger)', fontWeight: 600 }}>
                  <TrendingDown size={14} /> {formatCurrency(summary.monthly_change)}
                </div>
              )}
            </div>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '12px 0 6px 0', background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {formatCurrency(summary.net_worth)}
            </h2>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Yearly Growth:</span>
            <span style={{ fontWeight: 600, color: summary.yearly_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {summary.yearly_change >= 0 ? '+' : ''}{formatCurrency(summary.yearly_change)}
            </span>
          </div>
        </div>

        {/* Liquidity Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Liquidity (Cash)</span>
            <span className={`status-badge ${liquidityHealth}`}>
              {liquidityHealthLabel}
            </span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '12px 0 6px 0' }}>
            {formatCurrency(summary.total_liquid)}
          </h2>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Target Liquidity limit:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{formatCurrency(targetLiquidity)}</span>
          </div>
        </div>

        {/* Active Loans Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Outstanding Loans</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
              EMI Commitments
            </span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '12px 0 6px 0', color: data.loans.reduce((sum, l) => sum + l.outstanding, 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
            {formatCurrency(data.loans.reduce((sum, l) => sum + l.outstanding, 0))}
          </h2>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Monthly EMI:</span>
            <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>
              {formatCurrency(data.loans.reduce((sum, l) => sum + l.emi, 0))}
            </span>
          </div>
        </div>

        {/* Credit Cards Card */}
        <div className="glass-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Credit Cards</span>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
              Limit Utilization
            </span>
          </div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '28px', fontWeight: 700, margin: '12px 0 6px 0', color: (data.credit_cards || []).reduce((sum, c) => sum + c.outstanding, 0) > 0 ? 'var(--warning)' : 'var(--success)' }}>
            {formatCurrency((data.credit_cards || []).reduce((sum, c) => sum + c.outstanding, 0))}
          </h2>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '12px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Available Limit:</span>
            <span style={{ fontWeight: 600, color: 'var(--success)' }}>
              {formatCurrency((data.credit_cards || []).reduce((sum, c) => sum + (c.credit_limit - c.outstanding), 0))}
            </span>
          </div>
        </div>
      </div>

      {/* System Action Items / Recommendations Row */}
      {recommendations.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>System Action Items</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
            {recommendations.map((rec, idx) => (
              <div 
                key={idx} 
                className="glass-card"
                style={{ 
                  padding: '16px', 
                  borderRadius: 'var(--radius-sm)', 
                  border: '1px solid rgba(255,255,255,0.04)',
                  background: rec.status === 'danger' ? 'var(--danger-bg)' : rec.status === 'warning' ? 'var(--warning-bg)' : rec.status === 'success' ? 'var(--success-bg)' : 'var(--info-bg)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between'
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    {rec.status === 'danger' && <AlertTriangle size={16} style={{ color: 'var(--danger)' }} />}
                    {rec.status === 'warning' && <AlertTriangle size={16} style={{ color: 'var(--warning)' }} />}
                    {rec.status === 'success' && <CheckCircle size={16} style={{ color: 'var(--success)' }} />}
                    {rec.status === 'info' && <ShieldCheck size={16} style={{ color: 'var(--info)' }} />}
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>{rec.title}</span>
                  </div>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: rec.action_type !== 'info' ? '12px' : '0' }}>
                    {rec.message}
                  </p>
                </div>
                {rec.action_type !== 'info' && (
                  <button 
                    onClick={() => handleRecommendationAction(rec)}
                    className="btn" 
                    style={{ padding: '6px 12px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start' }}
                  >
                    Simulate Action <ArrowRight size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Grid: Charts Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '24px', marginBottom: '32px' }}>
        {/* Net Worth Line Chart */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Net Worth Growth Trend</h3>
          <div className="chart-container" style={{ flexGrow: 1, minHeight: '260px' }}>
            <Line data={chartData} options={chartOptions} />
          </div>
        </div>

        {/* Asset Allocation Doughnut Chart */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Asset Allocation</h3>
          <div className="chart-container" style={{ flexGrow: 1, minHeight: '260px' }}>
            <Doughnut data={doughnutData} options={doughnutOptions} />
          </div>
        </div>
      </div>

      {/* Target Goals Summary Widgets */}
      <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '18px', fontFamily: 'var(--font-display)' }}>Critical Reserve &amp; Goal Trackers</h3>
      <div className="dashboard-grid">
        {/* Emergency Fund Progress */}
        <div className="glass-card">
          <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Emergency Fund</h4>
          {emergencyFund ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 8px 0' }}>
                <span style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(emergencyFund.current_amount)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of {formatCurrency(emergencyFund.target_amount)}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min((emergencyFund.current_amount / emergencyFund.target_amount) * 100, 100)}%`, 
                  height: '100%', 
                  background: 'var(--success)',
                  borderRadius: '50px'
                }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Progress: {((emergencyFund.current_amount / emergencyFund.target_amount) * 100).toFixed(0)}%</span>
                <span>Est: {emergencyFund.expected_completion}</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>Emergency Fund goal not defined.</p>
          )}
        </div>

        {/* Backup Fund Progress */}
        <div className="glass-card">
          <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Backup Fund</h4>
          {backupFund ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 8px 0' }}>
                <span style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(backupFund.current_amount)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of {formatCurrency(backupFund.target_amount)}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min((backupFund.current_amount / backupFund.target_amount) * 100, 100)}%`, 
                  height: '100%', 
                  background: 'var(--accent)',
                  borderRadius: '50px'
                }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Progress: {((backupFund.current_amount / backupFund.target_amount) * 100).toFixed(0)}%</span>
                <span>Est: {backupFund.expected_completion}</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>Backup Fund goal not defined.</p>
          )}
        </div>

        {/* Villa Fund Progress */}
        <div className="glass-card">
          <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Villa Fund</h4>
          {villaFund ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 8px 0' }}>
                <span style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(villaFund.current_amount)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of {formatCurrency(villaFund.target_amount)}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min((villaFund.current_amount / villaFund.target_amount) * 100, 100)}%`, 
                  height: '100%', 
                  background: 'var(--warning)',
                  borderRadius: '50px'
                }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Gap: {formatCurrency(villaFund.gap)}</span>
                <span>Est: {villaFund.expected_completion}</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>Villa Fund goal not defined.</p>
          )}
        </div>

        {/* Retirement Corpus Progress */}
        <div className="glass-card">
          <h4 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-secondary)' }}>Retirement Fund</h4>
          {retirementFund ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '12px 0 8px 0' }}>
                <span style={{ fontSize: '20px', fontWeight: 700 }}>{formatCurrency(retirementFund.current_amount)}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>of {formatCurrency(retirementFund.target_amount)}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '50px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min((retirementFund.current_amount / retirementFund.target_amount) * 100, 100)}%`, 
                  height: '100%', 
                  background: 'var(--info)',
                  borderRadius: '50px'
                }}></div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginTop: '6px' }}>
                <span>Progress: {((retirementFund.current_amount / retirementFund.target_amount) * 100).toFixed(0)}%</span>
                <span>Months: {retirementFund.months_remaining === -1 ? 'Never' : retirementFund.months_remaining}</span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '12px' }}>Retirement goal not defined.</p>
          )}
        </div>
      </div>
    </div>
  );
};
