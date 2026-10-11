import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, Title, Tooltip, Legend, Filler
} from 'chart.js';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';
import { AmountInput, Group, Row } from './settings/ui';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  Title, Tooltip, Legend, Filler
);

interface SimulationsProps {
  data: InitData;
  initialParams?: {
    scenario_type: string;
    loan_id?: number;
  };
  onGo?: (page: string) => void;
}

// The questions this page answers. 'debt_payoff' (prepaying several loans) lives in the
// Loan planner's "Which loan to pay first"; the API still accepts it.
const SCENARIOS: { id: string; label: string }[] = [
  { id: 'close_loan', label: 'Close or prepay a loan' },
  { id: 'roi_reduction', label: 'Get a lower interest rate (refinance)' },
  { id: 'brother_property', label: 'Make a large purchase' },
  { id: 'receive_bonus', label: 'Receive a bonus or lump sum' },
  { id: 'salary_change', label: 'My salary changes' },
  { id: 'increase_sip', label: 'Increase my SIPs' },
  { id: 'delay_goal', label: 'Delay a goal' },
  { id: 'net_worth_forecast', label: 'Where will my net worth be in a few years?' },
];

const shortINR = (v: number) => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr` : Math.abs(v) >= 1e5 ? `₹${(v / 1e5).toFixed(0)}L` : `₹${Math.round(v)}`);
// The API sends -1 for a debt its EMI never clears, and 0 when nothing with an EMI is left.
const months = (raw: number) => {
  if (raw < 0) return 'never, at this EMI';
  const n = Math.round(raw);
  if (n === 0) return 'now';
  return n >= 12 ? `${Math.floor(n / 12)} yr${n >= 24 ? 's' : ''}${n % 12 ? ` ${n % 12} mo` : ''}` : `${n} mo`;
};

export const Simulations: React.FC<SimulationsProps> = ({ data, initialParams, onGo }) => {
  const loans = React.useMemo(() => data.liabilities
    .filter((l: any) => l.category_name !== 'Credit Card')
    .map((l: any) => ({ ...l, roi: l.interest_rate })), [data.liabilities]);

  // The forecast's monthly saving starts from what the latest Cash Flow month kept
  // (left over + invested), not an invented figure.
  const latest = data.cash_flows?.[0];
  const kept = latest
    ? latest.net_salary + latest.other_income - latest.household_expenses - latest.one_time_expenses - latest.emi - latest.insurance_premium
    : 0;

  const [scenarioType, setScenarioType] = useState('close_loan');
  const [horizonYears, setHorizonYears] = useState(10);
  const [expectedReturn, setExpectedReturn] = useState(10);
  const [monthlySavings, setMonthlySavings] = useState(kept > 0 ? Math.round(kept / 1000) * 1000 : 0);
  const [inflationRate, setInflationRate] = useState(6);
  const [loanId, setLoanId] = useState(0);
  const [goalId, setGoalId] = useState(0);
  const [delayMonths, setDelayMonths] = useState(12);
  const [sipIncrement, setSipIncrement] = useState(10000);
  const [salaryChange, setSalaryChange] = useState(20000);
  const [bonusAmount, setBonusAmount] = useState(200000);
  const [bonusAllocation, setBonusAllocation] = useState('prepay');
  const [newRoi, setNewRoi] = useState(7.5);
  const [propertyCost, setPropertyCost] = useState(1500000);
  const [propertyFunding, setPropertyFunding] = useState('loan');
  const [purchaseName, setPurchaseName] = useState('');
  const [loanRoi, setLoanRoi] = useState(8.5);
  const [loanTenureMonths, setLoanTenureMonths] = useState(120);
  const [loading, setLoading] = useState(false);
  // A result is only shown for the scenario it was run for (switching used to render one
  // scenario's result with another's layout, which crashed the forecast chart).
  const [result, setResult] = useState<{ type: string; data: any } | null>(null);

  useEffect(() => {
    if (initialParams) {
      setScenarioType(initialParams.scenario_type === 'debt_payoff' ? 'close_loan' : initialParams.scenario_type);
      if (initialParams.loan_id) setLoanId(initialParams.loan_id);
    } else {
      if (loans.length > 0) setLoanId((id) => id || loans[0].id);
      if (data.goals.length > 0) setGoalId((id) => id || data.goals[0].id);
    }
  }, [initialParams, data, loans]);

  const handleRun = async () => {
    setLoading(true);
    const type = scenarioType;
    const post = (path: string, body: any) => fetch(`${API_BASE_URL}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    try {
      let res: Response;
      if (type === 'net_worth_forecast') {
        res = await post('/api/simulations/net_worth_forecast', { horizon_years: horizonYears, expected_return: expectedReturn, monthly_savings: monthlySavings, inflation_rate: inflationRate });
      } else {
        const params = ({
          close_loan: { loan_id: loanId },
          delay_goal: { goal_id: goalId, delay_months: delayMonths },
          increase_sip: { increment_amount: sipIncrement },
          salary_change: { change_amount: salaryChange },
          receive_bonus: { bonus_amount: bonusAmount, allocation_target: bonusAllocation },
          roi_reduction: { loan_id: loanId, new_roi: newRoi },
          brother_property: { purchase_name: purchaseName || 'the purchase', cost: propertyCost, funding_source: propertyFunding, roi: loanRoi, tenure_months: loanTenureMonths },
        } as Record<string, Record<string, unknown>>)[type];
        res = await post('/api/simulations/run', { scenario_type: type, params });
      }
      if (res.ok) setResult({ type, data: await res.json() });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loanSelect = (label: string) => (
    <Row label={label} htmlFor="sim-loan">
      <select id="sim-loan" className="form-control" value={loanId} onChange={(e) => setLoanId(Number(e.target.value))}>
        {loans.map((l: any) => <option key={l.id} value={l.id}>{l.name} ({formatINR(l.outstanding)}, {l.roi}%)</option>)}
      </select>
    </Row>
  );
  const money = (label: string, value: number, set: (v: number) => void, description?: string, allowNegative = false) => (
    <Row label={label} description={description} htmlFor={`sim-${label}`}>
      <AmountInput id={`sim-${label}`} label={label} prefix="₹" width={120} value={value} onChange={set} allowNegative={allowNegative} />
    </Row>
  );
  const number = (label: string, value: number, set: (v: number) => void, suffix: string) => (
    <Row label={label} htmlFor={`sim-${label}`}>
      <AmountInput id={`sim-${label}`} label={label} suffix={suffix} width={70} value={value} onChange={set} />
    </Row>
  );
  const needsLoan = scenarioType === 'close_loan' || scenarioType === 'roi_reduction';
  const needsGoal = scenarioType === 'delay_goal';
  const blocked = (needsLoan && loans.length === 0) || (needsGoal && data.goals.length === 0);
  const r = result && result.type === scenarioType ? result.data : null;

  const signed = (v: number, goodWhenUp: boolean) => (
    <span style={{ color: v === 0 ? 'var(--text-muted)' : (v > 0) === goodWhenUp ? 'var(--success)' : '#fca5a5' }}>{v === 0 ? '—' : `${v > 0 ? '+' : '−'}${formatINR(Math.abs(v))}`}</span>
  );

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Simulations</h1>
          <p className="page-subtitle">Try a big decision, like closing a loan or a large purchase, and see its effect before you make it.</p>
        </div>
      </div>

      <div className="cf-whatif">
        <div className="db-col">
          <Group title="What if I…">
            <Row label="Scenario" htmlFor="sim-type">
              <select id="sim-type" className="form-control" value={scenarioType} onChange={(e) => setScenarioType(e.target.value)}>
                {SCENARIOS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Row>
            {scenarioType === 'close_loan' && loanSelect('Loan')}
            {scenarioType === 'roi_reduction' && <>{loanSelect('Loan')}{number('New interest rate', newRoi, setNewRoi, '%')}</>}
            {scenarioType === 'delay_goal' && (
              <>
                <Row label="Goal" htmlFor="sim-goal">
                  <select id="sim-goal" className="form-control" value={goalId} onChange={(e) => setGoalId(Number(e.target.value))}>
                    {data.goals.map((g: any) => <option key={g.id} value={g.id}>{g.name} ({formatINR(g.target_amount)})</option>)}
                  </select>
                </Row>
                {number('Delay by', delayMonths, (v) => setDelayMonths(Math.round(v)), 'months')}
              </>
            )}
            {scenarioType === 'increase_sip' && money('Extra each month', sipIncrement, setSipIncrement)}
            {scenarioType === 'salary_change' && money('Change each month', salaryChange, setSalaryChange, 'Negative for a cut.', true)}
            {scenarioType === 'receive_bonus' && (
              <>
                {money('Amount', bonusAmount, setBonusAmount)}
                <Row label="Use it to" htmlFor="sim-bonus">
                  <select id="sim-bonus" className="form-control" value={bonusAllocation} onChange={(e) => setBonusAllocation(e.target.value)}>
                    <option value="prepay">Prepay the costliest loan</option>
                    <option value="invest">Invest in equity funds</option>
                    <option value="liquid">Keep as cash</option>
                  </select>
                </Row>
              </>
            )}
            {scenarioType === 'brother_property' && (
              <>
                <Row label="What" htmlFor="sim-name">
                  <input id="sim-name" className="form-control" placeholder="e.g. a car" value={purchaseName} onChange={(e) => setPurchaseName(e.target.value)} />
                </Row>
                {money('Cost', propertyCost, setPropertyCost)}
                <Row label="Paid with" htmlFor="sim-funding">
                  <select id="sim-funding" className="form-control" value={propertyFunding} onChange={(e) => setPropertyFunding(e.target.value)}>
                    <option value="loan">A new loan</option>
                    <option value="liquid">Cash I have</option>
                  </select>
                </Row>
                {propertyFunding === 'loan' && <>{number('Loan interest rate', loanRoi, setLoanRoi, '%')}{number('Loan tenure', loanTenureMonths, (v) => setLoanTenureMonths(Math.round(v)), 'months')}</>}
              </>
            )}
            {scenarioType === 'net_worth_forecast' && (
              <>
                <Row label="Years ahead" htmlFor="sim-years">
                  <select id="sim-years" className="form-control" value={horizonYears} onChange={(e) => setHorizonYears(Number(e.target.value))}>
                    {[5, 10, 20, 30].map((y) => <option key={y} value={y}>{y} years</option>)}
                  </select>
                </Row>
                {money('Saved each month', monthlySavings, setMonthlySavings, kept > 0 ? 'Starts from what your latest Cash Flow month kept.' : 'What you can put away each month.')}
                {number('Yearly return', expectedReturn, setExpectedReturn, '%')}
                {number('Inflation', inflationRate, setInflationRate, '%')}
              </>
            )}
          </Group>
          {blocked
            ? <p className="cc-note">{needsLoan ? 'Add a loan under Liabilities first.' : 'Add a goal first.'}</p>
            : <div className="tx-actions"><button className="btn btn-primary" onClick={handleRun} disabled={loading}>{loading ? 'Working it out…' : 'Show me'}</button></div>}
          <p className="cc-note" style={{ margin: 0 }}>Prepaying several loans? <button type="button" className="db-link" onClick={() => onGo?.('loans')}>Loan planner</button> compares which to clear first.</p>
        </div>

        <div className="db-col">
          {!r ? (
            <div className="settings-group"><div className="ie-empty"><p>Pick a scenario and press "Show me" to see its effect on your net worth, cash and debt.</p></div></div>
          ) : result!.type === 'net_worth_forecast' ? (() => {
            const start = r.initial_net_worth;
            const growth = start > 0 ? r.final_net_worth_nominal / start : null;
            return (
              <>
                <div className="glass-panel cc-summary db-summary" style={{ gridTemplateColumns: 'minmax(200px, 1.4fr) repeat(2, minmax(140px, 1fr))' }}>
                  <div className="cc-summary-main">
                    <div className="cc-label">Net worth in {horizonYears} years</div>
                    <strong className="eg-figure db-networth">{formatINR(r.final_net_worth_nominal)}</strong>
                    <span className="cc-note">from {formatINR(start)} today{growth ? `, ${growth.toFixed(1)}×` : ''}</span>
                  </div>
                  <div className="cc-summary-stat"><div className="cc-label">In today's money</div><strong>{formatINR(r.final_net_worth_real)}</strong><span className="cc-note">after {inflationRate}% inflation</span></div>
                  <div className="cc-summary-stat"><div className="cc-label">Debt left then</div><strong>{formatINR(r.schedule[r.schedule.length - 1]?.debt ?? 0)}</strong><span className="cc-note">on today's EMIs</span></div>
                </div>
                <section className="glass-panel db-card">
                  <div style={{ height: '260px', position: 'relative' }}>
                    <Line data={{
                      labels: r.schedule.map((s: any) => `Year ${s.year}`),
                      datasets: [
                        { label: 'Net worth', data: r.schedule.map((s: any) => s.net_worth_nominal), borderColor: '#8b5cf6', borderWidth: 2, tension: 0.3, pointRadius: 2 },
                        { label: "In today's money", data: r.schedule.map((s: any) => s.net_worth_real), borderColor: '#10b981', borderWidth: 2, tension: 0.3, pointRadius: 2 },
                        { label: 'Debt', data: r.schedule.map((s: any) => s.debt), borderColor: '#ef4444', borderDash: [4, 4], borderWidth: 1.5, tension: 0.3, pointRadius: 0 },
                      ],
                    }} options={{
                      responsive: true, maintainAspectRatio: false,
                      plugins: {
                        legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 14 } },
                        tooltip: { backgroundColor: '#0d111d', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, callbacks: { label: (c: any) => ` ${c.dataset.label}: ${formatINR(c.parsed.y)}` } },
                      },
                      scales: {
                        x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 10 } },
                        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 6, callback: (v: any) => shortINR(Number(v)) } },
                      },
                    }} />
                  </div>
                  <p className="cc-note" style={{ margin: 0 }}>Assumes a steady {expectedReturn}% a year on everything you own and {formatINR(monthlySavings)} added each month. Real returns vary year to year.</p>
                </section>
              </>
            );
          })() : (
            <>
              <section className="glass-panel db-card">
                <div className="db-card-head"><h3>What it means</h3></div>
                <p className="db-rec-plain">{r.recommendation}</p>
              </section>
              <section className="glass-panel db-card">
                <table className="cf-compare">
                  <thead><tr><th /><th>Now</th><th>After</th><th>Difference</th></tr></thead>
                  <tbody>
                    <tr className="cf-compare-total"><th scope="row">Net worth</th><td>{formatINR(r.current.net_worth)}</td><td>{formatINR(r.simulated.net_worth)}</td><td>{signed(r.difference.net_worth, true)}</td></tr>
                    <tr><th scope="row">Cash</th><td>{formatINR(r.current.liquid_funds)}</td><td>{formatINR(r.simulated.liquid_funds)}</td><td>{signed(r.difference.liquid_funds, true)}</td></tr>
                    <tr><th scope="row">Debt</th><td>{formatINR(r.current.total_debt)}</td><td>{formatINR(r.simulated.total_debt)}</td><td>{signed(r.difference.total_debt, false)}</td></tr>
                    <tr><th scope="row">EMIs each month</th><td>{formatINR(r.current.monthly_emi)}</td><td>{formatINR(r.simulated.monthly_emi)}</td><td>{signed(r.difference.monthly_emi, false)}</td></tr>
                    <tr><th scope="row">Debt-free in</th><td>{months(r.current.remaining_tenure_months)}</td><td>{months(r.simulated.remaining_tenure_months)}</td>
                      {(() => {
                        const unknown = r.current.remaining_tenure_months < 0 || r.simulated.remaining_tenure_months < 0;
                        const d = r.simulated.remaining_tenure_months - r.current.remaining_tenure_months;
                        return <td style={{ color: unknown || Math.round(d) === 0 ? 'var(--text-muted)' : d < 0 ? 'var(--success)' : '#fca5a5' }}>
                          {unknown || Math.round(d) === 0 ? '—' : `${d < 0 ? '−' : '+'}${months(Math.abs(d))}`}</td>;
                      })()}</tr>
                  </tbody>
                </table>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
