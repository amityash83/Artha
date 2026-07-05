import React, { useState, useEffect } from 'react';
import { Play, Sparkles } from 'lucide-react';
import { InitData } from '../types';

interface SimulationsProps {
  data: InitData;
  initialParams?: {
    scenario_type: string;
    loan_id?: number;
  };
}

export const Simulations: React.FC<SimulationsProps> = ({ data, initialParams }) => {
  const [scenarioType, setScenarioType] = useState('close_loan');
  
  // Dynamic parameters depending on selection
  const [loanId, setLoanId] = useState<number>(0);
  const [goalId, setGoalId] = useState<number>(0);
  const [delayMonths, setDelayMonths] = useState<number>(12);
  const [sipIncrement, setSipIncrement] = useState<number>(10000);
  const [salaryChange, setSalaryChange] = useState<number>(20000);
  const [bonusAmount, setBonusAmount] = useState<number>(200000);
  const [bonusAllocation, setBonusAllocation] = useState('prepay');
  const [newRoi, setNewRoi] = useState<number>(7.5);
  const [propertyCost, setPropertyCost] = useState<number>(1500000);
  const [propertyFunding, setPropertyFunding] = useState('loan');

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Pre-load parameters from dashboard redirects
  useEffect(() => {
    if (initialParams) {
      setScenarioType(initialParams.scenario_type);
      if (initialParams.loan_id) {
        setLoanId(initialParams.loan_id);
      }
    } else {
      if (data.loans.length > 0) {
        setLoanId(data.loans[0].id);
      }
      if (data.goals.length > 0) {
        setGoalId(data.goals[0].id);
      }
    }
  }, [initialParams, data]);

  const handleRun = async () => {
    setLoading(true);
    let params: any = {};
    
    if (scenarioType === 'close_loan') {
      params = { loan_id: Number(loanId) };
    } else if (scenarioType === 'delay_goal') {
      params = { goal_id: Number(goalId), delay_months: Number(delayMonths) };
    } else if (scenarioType === 'increase_sip') {
      params = { increment_amount: Number(sipIncrement) };
    } else if (scenarioType === 'salary_change') {
      params = { change_amount: Number(salaryChange) };
    } else if (scenarioType === 'receive_bonus') {
      params = { bonus_amount: Number(bonusAmount), allocation_target: bonusAllocation };
    } else if (scenarioType === 'roi_reduction') {
      params = { loan_id: Number(loanId), new_roi: Number(newRoi) };
    } else if (scenarioType === 'brother_property') {
      params = { property_cost: Number(propertyCost), funding_source: propertyFunding };
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/simulations/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_type: scenarioType, params })
      });
      if (res.ok) {
        const d = await res.json();
        setResult(d);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Simulations Sandbox</h1>
        <p className="page-subtitle">Model strategic "what-if" decisions and review recommendations</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr', gap: '32px' }}>
        {/* Scenario Config Panel */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px' }}>Simulation Setup</h3>

          <div className="form-group">
            <label className="form-label">Simulation Scenario</label>
            <select className="form-input" value={scenarioType} onChange={e => setScenarioType(e.target.value)}>
              <option value="close_loan">What if I close/prepay a Loan?</option>
              <option value="delay_goal">What if a Villa/Goal is delayed?</option>
              <option value="increase_sip">What if I increase monthly SIP?</option>
              <option value="salary_change">What if my Salary changes?</option>
              <option value="receive_bonus">What if I receive a lump sum Bonus?</option>
              <option value="roi_reduction">What if loan ROI reduces (Refinance)?</option>
              <option value="brother_property">What if I fund a family Property purchase?</option>
            </select>
          </div>

          {/* Dynamic input controls based on chosen type */}
          {scenarioType === 'close_loan' && (
            <div className="form-group">
              <label className="form-label">Select Loan to Close</label>
              <select className="form-input" value={loanId} onChange={e => setLoanId(Number(e.target.value))}>
                {data.loans.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({formatCurrency(l.outstanding)})</option>
                ))}
              </select>
            </div>
          )}

          {scenarioType === 'delay_goal' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Goal</label>
                <select className="form-input" value={goalId} onChange={e => setGoalId(Number(e.target.value))}>
                  {data.goals.map(g => (
                    <option key={g.id} value={g.id}>{g.name} (Target: {formatCurrency(g.target_amount)})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Delay Duration (months)</label>
                <input type="number" className="form-input" value={delayMonths} onChange={e => setDelayMonths(parseInt(e.target.value) || 0)} />
              </div>
            </>
          )}

          {scenarioType === 'increase_sip' && (
            <div className="form-group">
              <label className="form-label">Monthly SIP Increase Amount (₹)</label>
              <input type="number" className="form-input" value={sipIncrement} onChange={e => setSipIncrement(parseFloat(e.target.value) || 0)} />
            </div>
          )}

          {scenarioType === 'salary_change' && (
            <div className="form-group">
              <label className="form-label">Monthly Change Value (₹ - Negative for decrease)</label>
              <input type="number" className="form-input" value={salaryChange} onChange={e => setSalaryChange(parseFloat(e.target.value) || 0)} />
            </div>
          )}

          {scenarioType === 'receive_bonus' && (
            <>
              <div className="form-group">
                <label className="form-label">Bonus Amount (₹)</label>
                <input type="number" className="form-input" value={bonusAmount} onChange={e => setBonusAmount(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Allocation Strategy</label>
                <select className="form-input" value={bonusAllocation} onChange={e => setBonusAllocation(e.target.value)}>
                  <option value="liquid">Keep in Liquid Cash</option>
                  <option value="prepay">Prepay Highest ROI Loan</option>
                  <option value="invest">Invest entirely in Equity Mutual Funds</option>
                </select>
              </div>
            </>
          )}

          {scenarioType === 'roi_reduction' && (
            <>
              <div className="form-group">
                <label className="form-label">Select Loan</label>
                <select className="form-input" value={loanId} onChange={e => setLoanId(Number(e.target.value))}>
                  {data.loans.map(l => (
                    <option key={l.id} value={l.id}>{l.name} (Current ROI: {l.roi}%)</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">New ROI (%)</label>
                <input type="number" step="0.01" className="form-input" value={newRoi} onChange={e => setNewRoi(parseFloat(e.target.value) || 0)} />
              </div>
            </>
          )}

          {scenarioType === 'brother_property' && (
            <>
              <div className="form-group">
                <label className="form-label">Property Valuation (₹)</label>
                <input type="number" className="form-input" value={propertyCost} onChange={e => setPropertyCost(parseFloat(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Funding Type</label>
                <select className="form-input" value={propertyFunding} onChange={e => setPropertyFunding(e.target.value)}>
                  <option value="liquid">Fund from Liquid Cash</option>
                  <option value="loan">Take a Home Loan at 8.5% ROI</option>
                </select>
              </div>
            </>
          )}

          <button 
            type="button" 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '12px' }}
            onClick={handleRun}
            disabled={loading}
          >
            <Play size={16} /> {loading ? 'Running simulation...' : 'Run Simulation'}
          </button>
        </div>

        {/* Results view */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {result ? (
            <>
              {/* Recommendation card */}
              <div style={{ padding: '20px', background: 'var(--success-bg)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <Sparkles size={20} style={{ color: 'var(--success)', marginTop: '2px', flexShrink: 0 }} />
                <div>
                  <h4 style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: '15px', marginBottom: '6px' }}>Simulation Recommendation</h4>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: '1.4' }}>{result.recommendation}</p>
                </div>
              </div>

              {/* Side by side comparison metrics */}
              <div className="glass-panel" style={{ padding: '24px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Scenario Comparison Metrics</h3>
                
                <table className="custom-table" style={{ marginTop: 0 }}>
                  <thead>
                    <tr>
                      <th>Financial Metric</th>
                      <th>Current</th>
                      <th>Simulated</th>
                      <th>Difference</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Net Worth</td>
                      <td>{formatCurrency(result.current.net_worth)}</td>
                      <td style={{ color: 'var(--success)', fontWeight: 600 }}>{formatCurrency(result.simulated.net_worth)}</td>
                      <td style={{ fontWeight: 600, color: result.difference.net_worth >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.difference.net_worth >= 0 ? '+' : ''}{formatCurrency(result.difference.net_worth)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Liquidity (Cash)</td>
                      <td>{formatCurrency(result.current.liquid_funds)}</td>
                      <td>{formatCurrency(result.simulated.liquid_funds)}</td>
                      <td style={{ fontWeight: 600, color: result.difference.liquid_funds >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.difference.liquid_funds >= 0 ? '+' : ''}{formatCurrency(result.difference.liquid_funds)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Total Active Debt</td>
                      <td>{formatCurrency(result.current.total_debt)}</td>
                      <td style={{ color: 'var(--danger)' }}>{formatCurrency(result.simulated.total_debt)}</td>
                      <td style={{ fontWeight: 600, color: result.difference.total_debt <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.difference.total_debt >= 0 ? '+' : ''}{formatCurrency(result.difference.total_debt)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Monthly EMI Outflow</td>
                      <td>{formatCurrency(result.current.monthly_emi)}</td>
                      <td>{formatCurrency(result.simulated.monthly_emi)}</td>
                      <td style={{ fontWeight: 600, color: result.difference.monthly_emi <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.difference.monthly_emi >= 0 ? '+' : ''}{formatCurrency(result.difference.monthly_emi)}
                      </td>
                    </tr>
                    <tr>
                      <td style={{ fontWeight: 600 }}>Max Debt Tenure</td>
                      <td>{result.current.remaining_tenure_months} mo</td>
                      <td>{result.simulated.remaining_tenure_months} mo</td>
                      <td style={{ fontWeight: 600, color: result.difference.tenure_months <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {result.difference.tenure_months >= 0 ? '+' : ''}{result.difference.tenure_months} mo
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
              <Sparkles size={36} style={{ color: 'var(--accent-light)', marginBottom: '16px', opacity: 0.5 }} />
              <span style={{ fontSize: '14px', fontWeight: 500 }}>Select a financial change scenario and click "Run Simulation".</span>
              <span style={{ fontSize: '12px', marginTop: '6px' }}>See the dynamic impacts on your net worth, liquidity, and debt calendars.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
