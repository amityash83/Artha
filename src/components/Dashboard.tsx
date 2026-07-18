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
import { API_BASE_URL } from '../config';

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
  const [personFilter, setPersonFilter] = useState<number | 'all'>('all');
  const { goals, recommendations, rules, people } = data;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/snapshots`)
      .then(res => res.json())
      .then(d => setSnapshots(d))
      .catch(err => console.error("Failed to fetch snapshots:", err));
  }, []);

  // Per-person filtering is client-side: /api/init's `summary` is a household-wide
  // aggregate, so filtered totals are re-derived here from the same raw entities
  // rather than adding a new backend aggregation endpoint.
  const accounts = personFilter === 'all' ? data.accounts : data.accounts.filter(a => a.owner_id === personFilter);
  const assets = personFilter === 'all' ? data.assets : data.assets.filter(a => a.owner_id === personFilter);
  const liabilities = personFilter === 'all' ? data.liabilities : data.liabilities.filter(l => l.owner_id === personFilter);

  const summary = personFilter === 'all' ? data.summary : (() => {
    const liquid = accounts.reduce((sum, a) => sum + (a.current_balance || 0), 0);
    const assetsVal = assets.reduce((sum, a) => sum + (a.current_value || 0), 0);
    const debt = liabilities.reduce((sum, l) => sum + (l.outstanding || 0), 0);
    const totalAssets = liquid + assetsVal;
    return {
      net_worth: totalAssets - debt,
      total_assets: totalAssets,
      total_debt: debt,
      total_liquid: liquid,
      total_investments: data.summary.total_investments,
      total_properties: data.summary.total_properties,
      monthly_change: 0,
      yearly_change: 0,
    };
  })();

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

  const totalAssets = summary.total_assets;
  const liquidPct = totalAssets > 0 ? (liquidFunds / totalAssets) * 100 : 0;
  const lockedPct = Math.max(0, 100 - liquidPct);

  const debtToAssetRatio = totalAssets > 0 ? (summary.total_debt / totalAssets) * 100 : 0;
  let leverageHealth = 'green';
  let leverageLabel = 'Safe Leverage';
  if (debtToAssetRatio > 50) {
    leverageHealth = 'red';
    leverageLabel = 'High Debt Load';
  } else if (debtToAssetRatio > 30) {
    leverageHealth = 'yellow';
    leverageLabel = 'Moderate Leverage';
  }

  // Dynamic Asset Allocation for Doughnut Chart
  const assetAllocation: Record<string, number> = {
    'Liquid Cash': liquidFunds
  };

  assets.forEach((asset) => {
    const cat = asset.category_name || 'General Assets';
    assetAllocation[cat] = (assetAllocation[cat] || 0) + asset.current_value;
  });

  const doughnutLabels = Object.keys(assetAllocation);
  const doughnutValues = Object.values(assetAllocation);

  const colors = [
    '#10b981', // green
    '#8b5cf6', // purple
    '#3b82f6', // blue
    '#f59e0b', // orange
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#e11d48'  // rose
  ];

  const doughnutColors = doughnutLabels.map((_, i) => colors[i % colors.length]);

  const doughnutData = {
    labels: doughnutLabels,
    datasets: [
      {
        data: doughnutValues,
        backgroundColor: doughnutColors,
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        hoverOffset: 6
      }
    ]
  };

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
      const activeLiability = liabilities.find(l => rec.message.includes(l.name));
      onNavigate('simulations', {
        scenario_type: 'close_loan',
        loan_id: activeLiability?.id || null
      });
    } else {
      onNavigate('simulations');
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Artha</h1>
          <p className="page-subtitle">Dashboard &amp; Actionable Decision Support</p>
        </div>
        {people.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>View</span>
            <select
              className="form-control"
              style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
              value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            >
              <option value="all">Household (All)</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Top Summaries Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' }}>
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
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', marginTop: '10px' }}>
            <span>Assets: <strong style={{ color: '#f8fafc' }}>{formatCurrency(summary.total_assets)}</strong></span>
            <span>Debt: <strong style={{ color: '#f8fafc' }}>{formatCurrency(summary.total_debt)}</strong></span>
          </div>
        </div>

        {/* Liquid Reserve Health Indicator */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Emergency Reserve Status</span>
              <span className={`badge badge-${liquidityHealth}`} style={{ fontSize: '10px' }}>
                {liquidityHealthLabel}
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, color: '#f8fafc', margin: '4px 0 8px 0' }}>
              {formatCurrency(liquidFunds)}
            </h2>
          </div>
          
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px' }}>
              <span>Liquid: <strong style={{ color: '#10b981' }}>{liquidPct.toFixed(0)}%</strong></span>
              <span>Locked: <strong style={{ color: '#3b82f6' }}>{lockedPct.toFixed(0)}%</strong></span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', display: 'flex', marginBottom: '8px' }}>
              <div style={{ width: `${liquidPct}%`, height: '100%', background: '#10b981' }} title="Liquid Capital"></div>
              <div style={{ width: `${lockedPct}%`, height: '100%', background: '#3b82f6' }} title="Locked Capital"></div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Reserve Target: {formatCurrency(targetLiquidity)}
            </span>
          </div>
        </div>

        {/* Leverage Risk Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Leverage Risk (Debt/Assets)</span>
              <span className={`badge badge-${leverageHealth}`} style={{ fontSize: '10px' }}>
                {leverageLabel}
              </span>
            </div>
            <h2 style={{ fontSize: '22px', fontWeight: 600, color: '#f8fafc', margin: '4px 0 8px 0' }}>
              {debtToAssetRatio.toFixed(1)}%
            </h2>
          </div>
          <div>
            <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
              <div style={{ 
                width: `${Math.min(debtToAssetRatio, 100)}%`, 
                height: '100%', 
                background: leverageHealth === 'green' ? 'var(--success)' : leverageHealth === 'yellow' ? 'var(--warning)' : 'var(--danger)'
              }}></div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Risk Threshold Limit: Under 30%
            </span>
          </div>
        </div>

        {/* Target Progress Card */}
        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '130px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>Goal Allocations</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, justifyContent: 'center' }}>
            {goals.slice(0, 2).map((goal) => {
              const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
              return (
                <div key={goal.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '3px' }}>
                    <span style={{ color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>{goal.name}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{progress.toFixed(0)}%</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(progress, 100)}%`, height: '100%', background: '#8b5cf6' }}></div>
                  </div>
                </div>
              );
            })}
            {goals.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No active planning goals.</span>
            )}
          </div>
        </div>
      </div>

      {/* Charts & Recommendations Split */}
      <div style={{ display: 'grid', gridTemplateColumns: '3.1fr 2fr', gap: '24px', flexWrap: 'wrap' }} className="grid-split">
        {/* Left Side Charts Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="glass-panel" style={{ height: '320px', display: 'flex', flexDirection: 'column' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '16px' }}>
              Historic Asset Progression {personFilter !== 'all' && <span style={{ fontSize: '11px', fontWeight: 400, color: 'var(--text-muted)' }}>(Household total — per-person trend not yet tracked)</span>}
            </h3>
            <div style={{ flex: 1, position: 'relative' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }} className="sub-charts">
            {/* Doughnut + Allocation Table */}
            <div className="glass-panel" style={{ height: '240px', display: 'flex', flexDirection: 'column' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>Asset Distribution &amp; Allocation</h3>
              <div style={{ display: 'flex', gap: '16px', flex: 1, alignItems: 'center' }}>
                <div style={{ flex: 1.1, height: '160px', position: 'relative' }}>
                  <Doughnut data={doughnutData} options={doughnutOptions} />
                </div>
                <div style={{ flex: 1.4, maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {doughnutLabels.map((label, idx) => {
                    const value = doughnutValues[idx];
                    const percent = summary.total_assets > 0 ? (value / summary.total_assets) * 100 : 0;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderBottom: '1px solid rgba(255,255,255,0.02)', paddingBottom: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden' }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: doughnutColors[idx], flexShrink: 0 }}></span>
                          <span style={{ color: '#e2e8f0', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80px' }} title={label}>{label}</span>
                        </div>
                        <div style={{ color: '#f1f5f9', textAlign: 'right', flexShrink: 0 }}>
                          <div>{formatCurrency(value)}</div>
                          <div style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{percent.toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="glass-panel" style={{ height: '240px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>Liabilities Distribution</h3>
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {liabilities.length === 0 ? (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '20px' }}>
                    No liabilities recorded.
                  </span>
                ) : (
                  liabilities.map((l) => (
                    <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', background: 'rgba(255,255,255,0.02)', padding: '8px 12px', borderRadius: '8px' }}>
                      <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{l.name}</span>
                      <span style={{ color: '#f1f5f9' }}>{formatCurrency(l.outstanding)}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Actionable Recommendations Rules Panel */}
        <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', marginBottom: '16px' }}>Decision Engine Recommendations</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, overflowY: 'auto' }}>
            {recommendations.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', padding: '32px' }}>
                <ShieldCheck size={36} style={{ color: 'var(--success)', marginBottom: '12px' }} />
                <span style={{ fontSize: '13px', fontWeight: 500, color: '#f8fafc' }}>All Systems Healthy</span>
                <span style={{ fontSize: '11px', textAlign: 'center', marginTop: '4px' }}>
                  No warnings or emergency fund breaches detected.
                </span>
              </div>
            ) : (
              recommendations.map((rec, i) => (
                <div key={i} className={`rec-card border-${rec.status}`} style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: 'rgba(255, 255, 255, 0.02)',
                  borderLeft: `3px solid var(--${rec.status})`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: `var(--${rec.status}-light)` }}>
                      {rec.category.toUpperCase()}
                    </span>
                    {rec.status === 'danger' && <AlertTriangle size={14} style={{ color: 'var(--danger)' }} />}
                    {rec.status === 'success' && <CheckCircle size={14} style={{ color: 'var(--success)' }} />}
                  </div>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>{rec.title}</h4>
                  <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{rec.message}</p>
                  
                  {rec.action_type !== 'info' && (
                    <button 
                      className={`btn btn-secondary`} 
                      style={{ 
                        alignSelf: 'flex-start', 
                        display: 'flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        fontSize: '11px', 
                        padding: '4px 12px',
                        marginTop: '4px',
                        borderRadius: '6px',
                        background: 'rgba(139, 92, 246, 0.1)',
                        border: '1px solid rgba(139, 92, 246, 0.2)',
                        color: '#a78bfa'
                      }}
                      onClick={() => handleRecommendationAction(rec)}
                    >
                      Optimize Now <ArrowRight size={12} />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
