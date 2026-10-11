import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip, Filler, ChartData
} from 'chart.js';
import { InitData, Snapshot } from '../types';
import { API_BASE_URL } from '../config';
import { AppCommand } from '../navigation';
import { formatDate, formatINR } from '../format';
import { monthlyEquivalent } from '../frequency';
import { InfoTooltip } from './InfoTooltip';
import { AIExplainButton } from './AIExplainButton';
import type { NavigateOptions } from './TopBar';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Filler);

interface DashboardProps {
  data: InitData;
  onNavigate: (tab: string, simulationParams?: any) => void;
  onGo: (page: string, opts?: NavigateOptions) => void;
  onCommand: (command: AppCommand) => void;
}

// Matches decision_engine.py's fallback when the rule is missing.
const DEFAULT_EMERGENCY_TARGET = 1500000;
const FREQ_PER_YEAR: Record<string, number> = { Monthly: 12, Quarterly: 4, 'Half-Yearly': 2, Yearly: 1 };

const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);
const months = (n: number) => (n < 1 ? 'under a month' : `${n < 10 ? n.toFixed(1).replace(/\.0$/, '') : Math.round(n)} month${n === 1 ? '' : 's'}`);
const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
const shortINR = (v: number) => (Math.abs(v) >= 1e7 ? `₹${trim(v / 1e7)}Cr` : Math.abs(v) >= 1e5 ? `₹${trim(v / 1e5)}L` : `₹${Math.round(v)}`);

/** Where a recommendation's button goes, worded for what the person will do there. */
const recAction = (rec: any): { label: string; page: string } | null => {
  if (rec.action_type === 'info') return null;
  if (rec.action_type === 'prepay') return { label: 'Plan a prepayment', page: 'simulations' };
  if (/insurance/i.test(rec.category)) return { label: 'Review policies', page: 'assets' };
  if (/emergency|liquidity/i.test(rec.category)) return { label: 'Plan your savings', page: 'cash-flow' };
  return { label: 'Try it in Simulations', page: 'simulations' };
};

export const Dashboard: React.FC<DashboardProps> = ({ data, onNavigate, onGo, onCommand }) => {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [personFilter, setPersonFilter] = useState<number | 'all'>('all');
  const [showPassed, setShowPassed] = useState(false);
  const { goals, recommendations, rules, people } = data;

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/snapshots`)
      .then(res => res.json())
      .then(d => setSnapshots(Array.isArray(d) ? d : []))
      .catch(err => console.error("Failed to fetch snapshots:", err));
  }, []);

  // Per-person filtering is client-side: /api/init's `summary` is a household-wide
  // aggregate, so filtered totals are re-derived here from the same raw entities.
  const mine = <T extends { owner_id?: number | null }>(rows: T[]) => (personFilter === 'all' ? rows : rows.filter((r) => r.owner_id === personFilter));
  const accounts = mine(data.accounts);
  const assets = mine(data.assets);
  const liabilities = mine(data.liabilities);
  const expenses = mine(data.expenses as any[]);
  const income = mine(data.income as any[]);

  const cash = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
  const owned = cash + assets.reduce((s, a) => s + (a.current_value || 0), 0);
  const owed = liabilities.reduce((s, l) => s + (l.outstanding || 0), 0);
  const netWorth = owned - owed;
  const debtShare = pct(owed, owned);

  // The recurring plan from Income & Expenses: monthly spend, and what's left over.
  const active = (e: any) => (e.status ?? 'Active') === 'Active';
  const monthlySpend = expenses.filter(active).reduce((s, e) => s + monthlyEquivalent(e.amount, e.frequency), 0);
  const monthlyIn = income.filter(active).reduce((s, e) => s + monthlyEquivalent(e.category_name === 'Salary' && e.net_amount > 0 ? e.net_amount : e.amount, e.frequency), 0);
  const monthlyEmi = liabilities.filter((l) => l.category_name !== 'Credit Card' && (l.outstanding || 0) > 0).reduce((s, l) => s + (l.emi || 0), 0);
  const leftOver = monthlyIn - monthlySpend - monthlyEmi;

  // Emergency fund: the same reading as the recommendation engine. An "emergency" goal's
  // saved amount when there is one, else cash in accounts; the target is the planning
  // rule (or the goal's own target if that's higher).
  const rule = rules.find((r) => r.rule_key === 'min_emergency_fund');
  const ruleTarget = rule && rule.is_enabled !== 0 ? rule.value : DEFAULT_EMERGENCY_TARGET;
  const emergencyGoal = goals.find((g) => /emergency/i.test(g.name));
  const reserve = emergencyGoal ? emergencyGoal.current_amount : cash;
  const reserveTarget = Math.max(ruleTarget, emergencyGoal?.target_amount || 0);
  const reservePct = pct(reserve, reserveTarget);
  const shortBy = Math.max(reserveTarget - reserve, 0);
  const reserveState = shortBy <= 0 ? { label: 'Fully funded', tone: 'success' } : reservePct >= 70 ? { label: 'Nearly there', tone: 'warning' } : { label: 'Well short', tone: 'danger' };

  // Where the money is: cash plus each asset class, biggest first.
  const byClass: Record<string, number> = { 'Cash in accounts': cash };
  assets.forEach((a) => { const c = a.category_name || 'Other'; byClass[c] = (byClass[c] || 0) + (a.current_value || 0); });
  const allocation = Object.entries(byClass).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const policies = assets.filter((a: any) => a.category_name === 'Insurance').map((a: any) => ({
    id: a.id, name: a.name, type: a.policy_type || 'Life', cover: a.cover || 0, renewal: a.renewal_date || '',
    yearly: (a.premium || 0) * (FREQ_PER_YEAR[a.frequency] || 1),
  }));
  const daysUntil = (iso: string) => Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86400000);
  const nextRenewal = policies.filter((p) => p.renewal && daysUntil(p.renewal) >= 0).sort((a, b) => a.renewal.localeCompare(b.renewal))[0];

  const todo = recommendations.filter((r) => r.status !== 'success');
  const passed = recommendations.filter((r) => r.status === 'success');
  const toneOrder: Record<string, number> = { danger: 0, warning: 1, info: 2 };
  todo.sort((a, b) => (toneOrder[a.status] ?? 3) - (toneOrder[b.status] ?? 3));

  const priority: Record<string, number> = { High: 0, Medium: 1, Low: 2 };
  const topGoals = [...goals].sort((a, b) => (priority[a.priority ?? ''] ?? 3) - (priority[b.priority ?? ''] ?? 3)).slice(0, 4);

  const runRec = (rec: any) => {
    const action = recAction(rec);
    if (!action) return;
    if (rec.action_type === 'prepay') {
      const loan = data.liabilities.find((l) => rec.message.includes(l.name) || rec.title.includes(l.name));
      onNavigate('simulations', { scenario_type: 'close_loan', loan_id: loan?.id || null });
    } else {
      onNavigate(action.page);
    }
  };

  const chartData: ChartData<'line'> = {
    labels: snapshots.map((s) => s.month),
    datasets: [{
      fill: true, data: snapshots.map((s) => s.net_worth), borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.08)',
      tension: 0.3, pointRadius: 3, pointBackgroundColor: '#8b5cf6', borderWidth: 2,
    }],
  };
  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: '#0d111d', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, callbacks: { label: (c: any) => ` Net worth ${formatINR(c.parsed.y)}` } },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } },
      y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 5, callback: (v: any) => shortINR(Number(v)) } },
    },
  };
  const lastSnap = snapshots[snapshots.length - 1];

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Where you stand, how safe you are, and what to do next.</p>
        </div>
        {people.length > 1 && (
          <label className="db-view">
            <span>Showing</span>
            <select className="form-control" value={personFilter}
              onChange={(e) => setPersonFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
              <option value="all">Whole household</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
      </div>

      <div className="glass-panel cc-summary db-summary">
        <div className="cc-summary-main">
          <div className="cc-label">Net worth</div>
          <strong className="eg-figure db-networth">{formatINR(netWorth)}</strong>
          <span className="cc-note">
            {formatINR(owned)} owned − {formatINR(owed)} owed
            {personFilter === 'all' && lastSnap && lastSnap.net_worth !== netWorth && (
              <> · <span style={{ color: netWorth >= lastSnap.net_worth ? 'var(--success)' : '#fca5a5' }}>
                {netWorth >= lastSnap.net_worth ? '+' : '−'}{formatINR(Math.abs(netWorth - lastSnap.net_worth))}</span> since {lastSnap.month}</>
            )}
          </span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Cash in accounts</div>
          <strong>{formatINR(cash)}</strong>
          <span className="cc-note">{accounts.length} account{accounts.length === 1 ? '' : 's'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Debt</div>
          <strong>{formatINR(owed)}</strong>
          <span className="cc-note" title="Debt as a share of everything you own. Under 30% is comfortable; over 50% is heavy.">
            {owed > 0 ? `${debtShare.toFixed(0)}% of what you own · ${debtShare > 50 ? 'heavy' : debtShare > 30 ? 'moderate' : 'comfortable'}` : 'Nothing owed'}
          </span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Left over each month</div>
          <strong style={monthlyIn > 0 && leftOver < 0 ? { color: '#fca5a5' } : undefined}>{monthlyIn > 0 ? formatINR(leftOver) : '—'}</strong>
          <span className="cc-note">{monthlyIn > 0 ? 'take-home, less expenses and EMIs' : 'add income to see this'}</span>
        </div>
      </div>

      <div className="db-grid">
        <div className="db-col">
          {/* Emergency fund */}
          <section className="glass-panel db-card">
            <div className="db-card-head">
              <h3>Emergency fund</h3>
              <span className={`db-pill db-pill--${reserveState.tone}`}>{reserveState.label}</span>
            </div>
            <div className="db-reserve">
              <strong className="eg-figure">{formatINR(reserve)} <span>of {formatINR(reserveTarget)}</span></strong>
              <div className="cc-meter"><div style={{ width: `${Math.min(reservePct, 100)}%`, background: `var(--${reserveState.tone})` }} /></div>
            </div>
            <ul className="db-facts">
              <li>{emergencyGoal ? <>Counting what's saved in your <strong>{emergencyGoal.name}</strong> goal.</> : <>Counting the cash in your accounts. Add a goal named "Emergency fund" to track a dedicated reserve.</>}</li>
              {monthlySpend > 0
                ? <li>That covers about <strong>{months(reserve / monthlySpend)}</strong> of your regular expenses ({formatINR(monthlySpend)} a month).</li>
                : <li>Add your regular expenses on <button type="button" className="db-link" onClick={() => onGo('income-expenses')}>Income &amp; Expenses</button> to see how many months this covers.</li>}
              {shortBy > 0 && (
                <li>
                  {formatINR(shortBy)} to go
                  {leftOver > 0 && monthlyIn > 0 ? <>: about <strong>{months(shortBy / leftOver)}</strong> if you set aside everything left over each month.</> : '.'}
                </li>
              )}
            </ul>
            <div className="db-card-foot">
              <span className="cc-note">Target {formatINR(ruleTarget)} from your planning rules{emergencyGoal && emergencyGoal.target_amount > ruleTarget ? `, raised to the goal's ${formatINR(emergencyGoal.target_amount)}` : ''}.</span>
              <button type="button" className="settings-link" onClick={() => onGo('settings', { settingsSection: 'rules' })}>Change target</button>
            </div>
          </section>

          {/* Net worth over time */}
          <section className="glass-panel db-card">
            <div className="db-card-head">
              <h3>Net worth over time</h3>
              {personFilter !== 'all' && snapshots.length > 1 && <span className="cc-note">Whole household</span>}
            </div>
            {snapshots.length > 1 ? (
              <div style={{ height: '220px', position: 'relative' }}><Line data={chartData} options={chartOptions} /></div>
            ) : (
              <div className="db-empty">
                <p>{snapshots.length === 1
                  ? `One month recorded (${snapshots[0].month}, ${formatINR(snapshots[0].net_worth)}). Record next month too and the trend will appear here.`
                  : 'Record a monthly snapshot of your balances and this will chart how your net worth changes month to month.'}</p>
                <button type="button" className="settings-btn" onClick={() => onGo('snapshot')}>Open Monthly Snapshot <ArrowRight size={12} /></button>
              </div>
            )}
          </section>

          {/* Where it is / what's owed */}
          <div className="db-pair">
            <section className="glass-panel db-card">
              <div className="db-card-head"><h3>Where your money is</h3></div>
              {allocation.length === 0 ? (
                <div className="db-empty"><p>Nothing recorded yet.</p>
                  <button type="button" className="settings-btn" onClick={() => onCommand('new-asset')}><Plus size={12} /> Add an asset</button></div>
              ) : (
                <ul className="db-bars">
                  {allocation.map(([label, value]) => (
                    <li key={label}>
                      <span className="db-bar-label">{label}<span>{formatINR(value)}</span></span>
                      <span className="db-bar"><span style={{ width: `${pct(value, owned)}%` }} /></span>
                      <span className="db-bar-pct">{pct(value, owned).toFixed(0)}%</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="glass-panel db-card">
              <div className="db-card-head"><h3>What you owe</h3></div>
              {liabilities.filter((l) => (l.outstanding || 0) > 0).length === 0 ? (
                <div className="db-empty"><p>No debt. Nothing to pay down.</p></div>
              ) : (
                <ul className="db-list">
                  {[...liabilities].filter((l) => (l.outstanding || 0) > 0).sort((a, b) => b.outstanding - a.outstanding).map((l) => (
                    <li key={l.id}>
                      <span><strong>{l.name}</strong><span>{l.category_name === 'Credit Card' ? 'Card balance' : [l.interest_rate ? `${l.interest_rate}%` : null, l.emi ? `EMI ${formatINR(l.emi)}` : null].filter(Boolean).join(' · ')}</span></span>
                      <strong>{formatINR(l.outstanding)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {policies.length > 0 && (
            <section className="glass-panel db-card">
              <div className="db-card-head">
                <h3>Insurance</h3>
                <button type="button" className="settings-link" onClick={() => onGo('assets', { search: 'Insurance' })}>See policies</button>
              </div>
              <div className="db-mini-stats">
                <div><span className="cc-label">Total cover</span><strong>{formatINR(policies.reduce((s, p) => s + p.cover, 0))}</strong></div>
                <div><span className="cc-label">Premiums a year</span><strong>{formatINR(policies.reduce((s, p) => s + p.yearly, 0))}</strong></div>
                <div><span className="cc-label">Next renewal</span>
                  <strong>{nextRenewal ? formatDate(nextRenewal.renewal) : '—'}</strong>
                  {nextRenewal && <span className="cc-note">{nextRenewal.name}, in {daysUntil(nextRenewal.renewal)} days</span>}</div>
              </div>
            </section>
          )}
        </div>

        <div className="db-col">
          {/* What to do next */}
          <section className="glass-panel db-card">
            <div className="db-card-head">
              <h3>What to do next</h3>
              {personFilter !== 'all' && <span className="cc-note">For the whole household</span>}
            </div>
            {todo.length === 0 ? (
              <div className="db-allgood"><ShieldCheck size={18} /> Nothing needs your attention right now.</div>
            ) : (
              <ol className="db-recs">
                {todo.map((rec) => {
                  const i = recommendations.indexOf(rec);
                  const action = recAction(rec);
                  return (
                    <li key={i} className={`db-rec db-rec--${rec.status}`}>
                      <div className="db-rec-title">
                        <strong>{rec.title}</strong>
                        {rec.rule_key && <InfoTooltip articles={data.knowledge_articles} ruleKey={rec.rule_key} />}
                        <AIExplainButton aiConfigured={data.ai_provider !== 'none'} ruleKey={rec.rule_key || undefined}
                          recommendationIndex={i} contextNote={`Dashboard recommendation: ${rec.category}`} />
                      </div>
                      <p>{rec.message}</p>
                      {action && <button type="button" className="settings-link db-rec-action" onClick={() => runRec(rec)}>{action.label} <ArrowRight size={12} /></button>}
                    </li>
                  );
                })}
              </ol>
            )}
            {passed.length > 0 && (
              <div className="db-passed">
                <button type="button" className="settings-link" onClick={() => setShowPassed((v) => !v)} aria-expanded={showPassed}>
                  {showPassed ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {passed.length} check{passed.length === 1 ? '' : 's'} look{passed.length === 1 ? 's' : ''} good
                </button>
                {showPassed && <ul>{passed.map((r, k) => <li key={k}><strong>{r.title}.</strong> {r.message}</li>)}</ul>}
              </div>
            )}
          </section>

          {/* Goals */}
          <section className="glass-panel db-card">
            <div className="db-card-head">
              <h3>Goals</h3>
              {goals.length > 0 && <button type="button" className="settings-link" onClick={() => onGo('goals')}>All goals</button>}
            </div>
            {goals.length === 0 ? (
              <div className="db-empty">
                <p>Set a goal, such as an emergency fund, a child's education or retirement, to see how far along you are and when you'll get there.</p>
                <button type="button" className="settings-btn" onClick={() => onCommand('new-goal')}><Plus size={12} /> Add a goal</button>
              </div>
            ) : (
              <ul className="db-goals">
                {topGoals.map((g) => {
                  const p = Math.min(pct(g.current_amount, g.target_amount), 100);
                  const never = !g.expected_date || g.expected_date === 'Never';
                  return (
                    <li key={g.id}>
                      <div className="db-goal-line"><strong>{g.name}</strong><span>{formatINR(g.current_amount)} of {formatINR(g.target_amount)}</span></div>
                      <div className="cc-meter"><div style={{ width: `${p}%`, background: p >= 100 ? 'var(--success)' : 'var(--accent)' }} /></div>
                      <span className="cc-note" style={never && p < 100 ? { color: 'var(--warning)' } : undefined}>
                        {p >= 100 ? 'Reached' : never ? 'Nothing going in each month yet' : `${p.toFixed(0)}% · on course for ${new Date(`${g.expected_date}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
