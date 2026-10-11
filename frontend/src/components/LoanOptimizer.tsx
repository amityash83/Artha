import React, { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';
import { AmountInput, Group, Row } from './settings/ui';

interface LoanOptimizerProps {
  data: InitData;
  /** Shown inside the Loan planner, which supplies the page title. */
  embedded?: boolean;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// calculations.simulate_multi_loan_payoff stops here; a run that reaches it never finished.
const SIMULATION_CAP_MONTHS = 360;

const duration = (months: number) => {
  if (months >= SIMULATION_CAP_MONTHS) return 'over 30 years';
  const y = Math.floor(months / 12);
  const m = Math.round(months % 12);
  return [y ? `${y} yr${y > 1 ? 's' : ''}` : '', m ? `${m} mo` : ''].filter(Boolean).join(' ') || 'now';
};
const shortINR = (v: number) => (v >= 1e7 ? `₹${(v / 1e7).toFixed(1).replace(/\.0$/, '')}Cr` : `₹${(v / 1e5).toFixed(v < 1e6 ? 1 : 0).replace(/\.0$/, '')}L`);

/** "Which loan to pay first": snowball (smallest balance first) vs avalanche (highest rate first). */
export const LoanOptimizer: React.FC<LoanOptimizerProps> = ({ data, embedded }) => {
  const loans = React.useMemo(() => data.liabilities
    .filter((l: any) => l.category_name !== 'Credit Card' && (l.outstanding || 0) > 0)
    .map((l: any) => ({ ...l, roi: l.interest_rate || 0, emi: l.emi || 0 })), [data.liabilities]);

  // Start from what the latest Cash Flow month left over, not a made-up figure.
  const latest = data.cash_flows?.[0];
  const leftOver = latest
    ? latest.net_salary + latest.other_income - latest.household_expenses - latest.one_time_expenses - latest.emi - latest.insurance_premium - latest.investments
    : 0;
  const suggested = leftOver > 0 ? Math.round(leftOver / 1000) * 1000 : 10000;

  const [mode, setMode] = useState<'monthly' | 'annually'>('monthly');
  const [monthly, setMonthly] = useState(suggested);
  const [yearly, setYearly] = useState(suggested * 6);
  const [prepayMonth, setPrepayMonth] = useState(3);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    if (!loans.length) return;
    const timer = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/calculations/loan-optimizer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loans, extra_monthly_budget: mode === 'monthly' ? monthly : 0, prepayment_frequency: mode,
          prepayment_amount: mode === 'annually' ? yearly : 0, prepayment_month: prepayMonth, prepayment_day: 1,
        }),
      }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setResults(d)).catch(() => null);
    }, 150);
    return () => clearTimeout(timer);
  }, [loans, mode, monthly, yearly, prepayMonth]);

  if (!loans.length) {
    const cardDebt = data.liabilities.filter((l: any) => l.category_name === 'Credit Card').reduce((t: number, l: any) => t + (l.outstanding || 0), 0);
    return (
      <div className="settings-group">
        <div className="ie-empty">
          <p>{cardDebt > 0
            ? `You have no EMI loans. Credit card balances (${formatINR(cardDebt)}) aren't planned here: paying them in full each month avoids interest altogether.`
            : 'You have no loans to pay off. Add one under Liabilities to compare ways of clearing it.'}</p>
        </div>
      </div>
    );
  }

  const byRate = [...loans].sort((a, b) => b.roi - a.roi || b.outstanding - a.outstanding);
  const byBalance = [...loans].sort((a, b) => a.outstanding - b.outstanding || b.roi - a.roi);
  const sameOrder = loans.length === 1 || byRate.every((l, i) => l.id === byBalance[i].id);
  const extra = mode === 'monthly' ? monthly : yearly;

  let verdict: React.ReactNode = null;
  if (results && extra > 0) {
    const { baseline, avalanche, snowball } = results;
    const best = avalanche.total_interest <= snowball.total_interest ? 'avalanche' : 'snowball';
    const win = results[best];
    const saved = Math.max(baseline.total_interest - win.total_interest, 0);
    const sooner = Math.max(baseline.months - win.months, 0);
    const gap = Math.abs(avalanche.total_interest - snowball.total_interest);
    const first = best === 'avalanche' ? byRate[0] : byBalance[0];
    verdict = (
      <section className="glass-panel db-card">
        <div className="db-card-head"><h3>{sameOrder ? 'What the extra does' : `Pay ${first.name} first`}</h3></div>
        <strong className="eg-figure">{formatINR(saved)} <span>less interest</span></strong>
        <ul className="db-facts">
          <li>Debt-free in <strong>{duration(win.months)}</strong> instead of {duration(baseline.months)}{sooner > 0 ? <>, <strong>{duration(sooner)}</strong> sooner</> : ''}.</li>
          {sameOrder
            ? <li>{loans.length === 1 ? 'With one loan, every extra rupee goes to it.' : 'Your highest-rate loan is also your smallest, so both approaches pick the same order.'}</li>
            : gap < 1000
              ? <li>The two orders cost almost the same here (within {formatINR(gap)}), so clearing the smallest first for the quicker win is a fine choice.</li>
              : <li>Clearing the {best === 'avalanche' ? 'highest-rate' : 'smallest'} loan first saves {formatINR(gap)} more than the other order.</li>}
          {baseline.months >= SIMULATION_CAP_MONTHS && <li>On EMIs alone, at least one loan isn't paid off within 30 years: its EMI barely covers the interest.</li>}
        </ul>
      </section>
    );
  }

  const chart = results && (() => {
    const len = Math.max(results.baseline.schedule.length, results.avalanche.schedule.length, results.snowball.schedule.length);
    const every = len > 48 ? 12 : len > 18 ? 3 : 1;
    const pick = (s: any[]) => Array.from({ length: len }, (_, i) => s[i]?.outstanding ?? 0).filter((_, i) => i % every === 0);
    const labels = Array.from({ length: len }, (_, i) => i).filter((i) => i % every === 0).map((i) => (every === 12 ? `Year ${i / 12 + 1}` : `Month ${i + 1}`));
    const line = (label: string, s: any[], color: string, dash?: number[]) => ({ label, data: pick(s), borderColor: color, borderDash: dash, borderWidth: 2, tension: 0.2, pointRadius: 0 });
    return {
      labels,
      datasets: [
        line('EMIs only', results.baseline.schedule, '#64748b', [5, 5]),
        ...(sameOrder ? [line('With the extra', results.avalanche.schedule, '#8b5cf6')] : [
          line('Highest rate first', results.avalanche.schedule, '#8b5cf6'),
          line('Smallest first', results.snowball.schedule, '#10b981'),
        ]),
      ],
    };
  })();

  return (
    <div className="lp-page" style={embedded ? undefined : { paddingBottom: '40px' }}>
      <div className="lp-grid">
        <Group title="Extra you can put towards loans" description={latest && leftOver > 0
          ? `Starts from what ${new Date(`${latest.month}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long' })} left over on Cash Flow Planning.`
          : 'On top of your regular EMIs.'}>
          <Row label="How often">
            <span className="lp-toggle" role="group" aria-label="How often">
              <button type="button" aria-pressed={mode === 'monthly'} onClick={() => setMode('monthly')}>Every month</button>
              <button type="button" aria-pressed={mode === 'annually'} onClick={() => setMode('annually')}>Once a year</button>
            </span>
          </Row>
          {mode === 'monthly' ? (
            <Row label="Each month" htmlFor="lp-monthly">
              <AmountInput id="lp-monthly" label="Extra each month" prefix="₹" width={120} value={monthly} onChange={setMonthly} />
            </Row>
          ) : (
            <>
              <Row label="Each year" description="A bonus or similar lump sum." htmlFor="lp-yearly">
                <AmountInput id="lp-yearly" label="Extra each year" prefix="₹" width={120} value={yearly} onChange={setYearly} />
              </Row>
              <Row label="Paid in" htmlFor="lp-month">
                <select id="lp-month" className="form-control" value={prepayMonth} onChange={(e) => setPrepayMonth(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </Row>
            </>
          )}
        </Group>

        <Group title="Your loans" description={sameOrder ? undefined : 'Order each approach would clear them in.'}>
          {byRate.map((l) => (
            <Row key={l.id} label={l.name}
              description={[`${l.roi}%`, l.emi ? `EMI ${formatINR(l.emi)}` : null, l.remaining_tenure > 0 ? `${duration(l.remaining_tenure)} left` : null,
                sameOrder ? null : `#${byRate.indexOf(l) + 1} by rate, #${byBalance.indexOf(l) + 1} by size`].filter(Boolean).join(' · ')}>
              <span className="snap-readonly">{formatINR(l.outstanding)}</span>
            </Row>
          ))}
        </Group>
      </div>

      {extra <= 0 ? <p className="cc-note">Enter an amount above to see what it saves.</p> : verdict}

      {results && extra > 0 && (
        <section className="glass-panel db-card">
          <div className="db-card-head"><h3>Side by side</h3></div>
          <table className="cf-compare">
            <thead><tr><th /><th>Interest paid</th><th>Debt-free in</th><th>Saves</th></tr></thead>
            <tbody>
              {([['EMIs only', results.baseline], ...(sameOrder ? [['With the extra', results.avalanche]] : [['Highest rate first (avalanche)', results.avalanche], ['Smallest first (snowball)', results.snowball]])] as [string, any][]).map(([label, r]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td>{formatINR(r.total_interest)}</td>
                  <td>{duration(r.months)}</td>
                  <td style={{ color: r === results.baseline ? 'var(--text-muted)' : 'var(--success)' }}>{r === results.baseline ? '—' : formatINR(Math.max(results.baseline.total_interest - r.total_interest, 0))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {chart && (
            <div style={{ height: '260px', position: 'relative' }}>
              <Line data={chart} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: {
                  legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 14 } },
                  tooltip: { backgroundColor: '#0d111d', borderColor: 'rgba(255,255,255,0.08)', borderWidth: 1, callbacks: { label: (c: any) => ` ${c.dataset.label}: ${formatINR(c.parsed.y)} owed` } },
                },
                scales: {
                  x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 10 } },
                  y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { size: 11 }, maxTicksLimit: 5, callback: (v: any) => shortINR(Number(v)) } },
                },
              }} />
            </div>
          )}
        </section>
      )}
    </div>
  );
};
