import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { InitData, MonthlyCashFlow } from '../types';
import { API_BASE_URL } from '../config';
import { monthlyEquivalent } from '../frequency';
import { formatINR } from '../format';
import { useModalA11y } from '../hooks/useModalA11y';
import { AmountInput, ConfirmAction, Group, Row } from './settings/ui';

// The monthly actuals log (monthly_cash_flows): what came in and went out each month.
// Distinct from the recurring plan on Income & Expenses, which "Fill from my plan" reads.

interface CashFlowPlanningProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type View = 'latest' | 'log' | 'whatif';
type Draft = Omit<MonthlyCashFlow, 'id'>;

const FIELDS: { key: keyof Draft; label: string; hint?: string }[] = [
  { key: 'net_salary', label: 'Take-home salary', hint: 'What reached your account after tax and deductions.' },
  { key: 'other_income', label: 'Other income', hint: 'Rent, interest, freelance and the like.' },
  { key: 'household_expenses', label: 'Household spending', hint: 'Regular living costs for the month.' },
  { key: 'one_time_expenses', label: 'One-off spending', hint: 'Anything unusual: a trip, a repair, a big purchase.' },
  { key: 'emi', label: 'Loan EMIs' },
  { key: 'insurance_premium', label: 'Insurance premiums', hint: 'Yearly premiums count as a twelfth each month.' },
  { key: 'investments', label: 'Invested', hint: 'SIPs, PPF, NPS and other money put away.' },
];
const SECTIONS: { title: string; keys: (keyof Draft)[] }[] = [
  { title: 'Came in', keys: ['net_salary', 'other_income'] },
  { title: 'Spent', keys: ['household_expenses', 'one_time_expenses'] },
  { title: 'Commitments and saving', keys: ['emi', 'insurance_premium', 'investments'] },
];
const EMPTY: Draft = { month: '', net_salary: 0, other_income: 0, household_expenses: 0, emi: 0, insurance_premium: 0, investments: 0, one_time_expenses: 0, notes: '' };

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const monthName = (ym: string, style: 'long' | 'short' = 'long') => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-IN', { month: style, year: 'numeric' }) : ym;
};

// The page's arithmetic, in one place.
const cameIn = (f: Draft) => (f.net_salary || 0) + (f.other_income || 0);
const spent = (f: Draft) => (f.household_expenses || 0) + (f.one_time_expenses || 0);
const leftOver = (f: Draft) => cameIn(f) - spent(f) - (f.emi || 0) - (f.insurance_premium || 0) - (f.investments || 0);
/** Share of income not spent: left over plus invested (the target_savings_rate rule's meaning). */
const savingsRate = (f: Draft) => (cameIn(f) > 0 ? ((leftOver(f) + (f.investments || 0)) / cameIn(f)) * 100 : 0);
const pct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : 0);

export const CashFlowPlanning: React.FC<CashFlowPlanningProps> = ({ data, onRefresh, showToast }) => {
  const { cash_flows = [], liabilities, assets, goals, accounts, income = [], expenses = [] } = data;
  const [view, setView] = useState<View>('latest');

  const savingsRule = data.rules?.find((r: any) => r.rule_key === 'target_savings_rate');
  const targetRate = savingsRule && savingsRule.is_enabled === 1 ? savingsRule.value : 35.0;
  const cash = accounts.reduce((s, a) => s + (a.current_balance || 0), 0);

  const latest = cash_flows[0] ?? null;
  const previous = cash_flows[1] ?? null;

  // ---- Log a month / edit ------------------------------------------------------------
  const [editing, setEditing] = useState<MonthlyCashFlow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [fillNote, setFillNote] = useState<string | null>(null);
  const closeForm = () => { setFormOpen(false); setEditing(null); };
  const formRef = useModalA11y(formOpen, closeForm);

  /** Figures from the plan (Income & Expenses), loans, policies and goals. */
  const fromPlan = (base: Draft): { draft: Draft; note: string } => {
    const next = { ...base };
    const filled: string[] = [];
    const active = <T extends { status?: string }>(rows: T[]) => rows.filter((r) => (r.status ?? 'Active') === 'Active');

    // Take-home from Salary entries' take-home field (their amount is gross).
    const salaries = active(income).filter((i) => i.category_name === 'Salary');
    const withTakeHome = salaries.filter((i) => (i.net_amount || 0) > 0);
    if (withTakeHome.length) {
      next.net_salary = Math.round(withTakeHome.reduce((s, i) => s + monthlyEquivalent(i.net_amount || 0, i.frequency), 0));
      filled.push('take-home salary');
    }
    const missingTakeHome = salaries.filter((i) => !((i.net_amount || 0) > 0)).map((i) => `"${i.name}"`);

    next.emi = liabilities.filter((l: any) => l.category_name !== 'Credit Card')
      .reduce((s: number, l: any) => s + (l.outstanding > 0 ? l.emi || 0 : 0), 0);

    // Property rent only when the plan has no Rental entry (it would count twice).
    const otherPlanned = active(income).filter((i) => i.category_name !== 'Salary' && i.category_name !== 'Bonus');
    const hasPlannedRent = otherPlanned.some((i) => i.category_name === 'Rental');
    const rent = hasPlannedRent ? 0 : assets.filter((a: any) => a.category_name === 'Property').reduce((s: number, p: any) => s + (p.rental_income || 0), 0);
    next.other_income = Math.round(rent + otherPlanned.reduce((s, i) => s + monthlyEquivalent(i.amount, i.frequency), 0));
    if (otherPlanned.length) filled.push('other income');

    // EMIs come from the loans above, not from EMI expense entries.
    const planned = active(expenses).filter((e) => e.category_name !== 'EMI');
    if (planned.length) {
      next.household_expenses = Math.round(planned.reduce((s, e) => s + monthlyEquivalent(e.amount, e.frequency), 0));
      filled.push('household spending');
    }

    next.insurance_premium = Math.round(assets.filter((a: any) => a.category_name === 'Insurance')
      .reduce((s: number, p: any) => s + monthlyEquivalent(p.premium || 0, p.frequency || 'Yearly'), 0));
    next.investments = goals.reduce((s: number, g: any) => s + (g.monthly_contribution || 0), 0);

    const note = `EMIs, premiums and investing filled from your loans, policies and goals${filled.length ? `; ${filled.join(', ')} from Income & Expenses` : ''}.`
      + (missingTakeHome.length
        ? withTakeHome.length
          ? ` Take-home leaves out ${missingTakeHome.join(', ')}: add its take-home amount on Income & Expenses.`
          : ' No salary entry has a take-home amount yet, so take-home was left as it was.'
        : '')
      + (!income.length && !expenses.length ? ' Add your regular income and expenses on Income & Expenses to fill salary and spending too.' : '');
    return { draft: next, note };
  };

  const openNew = () => {
    setEditing(null);
    const month = thisMonth();
    if (latest) {
      // Start from the last month logged: most figures repeat month to month.
      setDraft({ ...latest, month, one_time_expenses: 0, notes: '' });
      setFillNote(`Started from ${monthName(latest.month)}. Change what was different, or fill from your plan.`);
    } else {
      const { draft: filled, note } = fromPlan({ ...EMPTY, month });
      setDraft(filled);
      setFillNote(note);
    }
    setFormOpen(true);
  };
  const openEdit = (cf: MonthlyCashFlow) => {
    setEditing(cf);
    setDraft({ ...cf, notes: cf.notes || '' });
    setFillNote(null);
    setFormOpen(true);
  };
  const fillFromPlan = () => {
    const { draft: filled, note } = fromPlan(draft);
    setDraft(filled);
    setFillNote(note);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`${API_BASE_URL}/api/cash-flows`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, id: editing?.id }),
    }).catch(() => null);
    if (res?.ok) {
      closeForm();
      onRefresh();
      showToast?.(`${monthName(draft.month)} saved`, 'success');
    } else {
      showToast?.("Couldn't save that month", 'error');
    }
  };
  const remove = async (cf: MonthlyCashFlow) => {
    const res = await fetch(`${API_BASE_URL}/api/cash-flows/${cf.id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) {
      closeForm();
      onRefresh();
      showToast?.(`${monthName(cf.month)} deleted`, 'success');
    }
  };
  const logged = (month: string) => cash_flows.find((c) => c.month === month);

  // ---- What if -----------------------------------------------------------------------
  const NO_CHANGES = { salary_change_pct: 0, salary_change_abs: 0, one_time_bonus: 0, new_emi: 0, emi_reduction: 0, additional_investment: 0, expense_reduction_pct: 0, expense_reduction_abs: 0 };
  const [changes, setChanges] = useState(NO_CHANGES);
  const [sim, setSim] = useState<any>(null);
  const setChange = (k: keyof typeof NO_CHANGES, v: number) => setChanges((c) => ({ ...c, [k]: v }));
  useEffect(() => {
    if (view !== 'whatif' || !latest) return;
    const timer = setTimeout(() => {
      fetch(`${API_BASE_URL}/api/calculations/cash-flow/simulate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          net_salary: latest.net_salary, other_income: latest.other_income, household_expenses: latest.household_expenses,
          emi: latest.emi, insurance_premium: latest.insurance_premium, investments: latest.investments,
          one_time_expenses: latest.one_time_expenses, ...changes,
        }),
      }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSim(d)).catch(() => null);
    }, 150);
    return () => clearTimeout(timer);
  }, [view, latest, changes]);

  // ---- Render --------------------------------------------------------------------------
  const vsPrevious = (now: number, before: number | null, higherIsBetter: boolean) => {
    if (before === null || now === before) return previous ? 'same as last month' : '';
    const up = now > before;
    return <span style={{ color: up === higherIsBetter ? 'var(--success)' : '#fca5a5' }}>{up ? '+' : '−'}{formatINR(Math.abs(now - before))} vs {monthName(previous!.month, 'short')}</span>;
  };

  const renderLatest = () => {
    if (!latest) {
      return (
        <div className="settings-group">
          <div className="ie-empty">
            <p>Log what came in and went out each month to see where the money goes, your savings rate, and how it changes over time.
              {income.length || expenses.length ? ' The first month starts from your Income & Expenses plan.' : ''}</p>
            <div><button type="button" className="settings-btn" onClick={openNew}><Plus size={12} /> Log {monthName(thisMonth())}</button></div>
          </div>
        </div>
      );
    }
    const inflow = cameIn(latest);
    const rate = savingsRate(latest);
    const commitments = (latest.emi || 0) + (latest.insurance_premium || 0);
    const parts: [string, number][] = [
      ['Household spending', latest.household_expenses], ['One-off spending', latest.one_time_expenses], ['Loan EMIs', latest.emi],
      ['Insurance', latest.insurance_premium], ['Invested', latest.investments], ['Left over', Math.max(leftOver(latest), 0)],
    ];
    const emiShare = pct(latest.emi, inflow);
    const monthlyOutgo = latest.household_expenses + latest.emi;
    const months = monthlyOutgo > 0 ? cash / monthlyOutgo : 0;
    return (
      <>
        <div className="glass-panel cc-summary db-summary">
          <div className="cc-summary-main">
            <div className="cc-label">Left over in {monthName(latest.month)}</div>
            <strong className="eg-figure db-networth" style={leftOver(latest) < 0 ? { color: '#fca5a5' } : undefined}>{formatINR(leftOver(latest))}</strong>
            <span className="cc-note">{vsPrevious(leftOver(latest), previous ? leftOver(previous) : null, true)}</span>
          </div>
          <div className="cc-summary-stat">
            <div className="cc-label">Came in</div><strong>{formatINR(inflow)}</strong>
            <span className="cc-note">{vsPrevious(inflow, previous ? cameIn(previous) : null, true)}</span>
          </div>
          <div className="cc-summary-stat">
            <div className="cc-label">Spent</div><strong>{formatINR(spent(latest))}</strong>
            <span className="cc-note">{vsPrevious(spent(latest), previous ? spent(previous) : null, false)}</span>
          </div>
          <div className="cc-summary-stat">
            <div className="cc-label">EMIs and premiums</div><strong>{formatINR(commitments)}</strong>
            <span className="cc-note">invested {formatINR(latest.investments)}</span>
          </div>
        </div>

        <div className="db-pair">
          <section className="glass-panel db-card">
            <div className="db-card-head"><h3>Where it went</h3><span className="cc-note">share of what came in</span></div>
            <ul className="db-bars">
              {parts.filter(([, v]) => v > 0).map(([label, v]) => (
                <li key={label}>
                  <span className="db-bar-label">{label}<span>{formatINR(v)}</span></span>
                  <span className="db-bar"><span style={{ width: `${Math.min(pct(v, inflow), 100)}%`, background: label === 'Left over' || label === 'Invested' ? 'var(--success)' : undefined }} /></span>
                  <span className="db-bar-pct">{pct(v, inflow).toFixed(0)}%</span>
                </li>
              ))}
            </ul>
            {leftOver(latest) < 0 && <p className="cf-warn">You spent {formatINR(-leftOver(latest))} more than came in this month.</p>}
          </section>

          <section className="glass-panel db-card">
            <div className="db-card-head">
              <h3>Savings rate</h3>
              <span className={`db-pill db-pill--${rate >= targetRate ? 'success' : rate >= targetRate * 0.7 ? 'warning' : 'danger'}`}>
                {rate >= targetRate ? 'On target' : 'Below target'}
              </span>
            </div>
            <div className="db-reserve">
              <strong className="eg-figure">{rate.toFixed(0)}% <span>of {targetRate}% target</span></strong>
              <div className="cc-meter"><div style={{ width: `${Math.min(Math.max(rate, 0) / Math.max(targetRate, 1) * 100, 100)}%`, background: rate >= targetRate ? 'var(--success)' : 'var(--warning)' }} /></div>
            </div>
            <ul className="db-facts">
              <li>Of {formatINR(inflow)} that came in, you kept <strong>{formatINR(leftOver(latest) + latest.investments)}</strong>: {formatINR(latest.investments)} invested and {formatINR(Math.max(leftOver(latest), 0))} left over.</li>
              {latest.emi > 0 && <li>EMIs take <strong>{emiShare.toFixed(0)}%</strong> of your income{emiShare > 40 ? ', which is heavy: over 40% leaves little room.' : emiShare > 30 ? ', manageable but worth watching.' : ', a comfortable level.'}</li>}
              {monthlyOutgo > 0 && <li>Cash in your accounts would cover about <strong>{months < 1 ? 'under a month' : `${months.toFixed(1).replace(/\.0$/, '')} months`}</strong> of spending and EMIs.</li>}
            </ul>
          </section>
        </div>

        <section className="glass-panel db-card">
          <div className="db-card-head"><h3>Over a year at this pace</h3><span className="cc-note">{monthName(latest.month)} × 12</span></div>
          <div className="db-mini-stats cf-year">
            <div><span className="cc-label">Comes in</span><strong>{formatINR(inflow * 12)}</strong></div>
            <div><span className="cc-label">Spent</span><strong>{formatINR(spent(latest) * 12)}</strong></div>
            <div><span className="cc-label">EMIs and premiums</span><strong>{formatINR(commitments * 12)}</strong></div>
            <div><span className="cc-label">Saved and invested</span><strong style={{ color: 'var(--success)' }}>{formatINR((leftOver(latest) + latest.investments) * 12)}</strong></div>
          </div>
        </section>
      </>
    );
  };

  const renderLog = () => (
    cash_flows.length === 0 ? renderLatest() : (
      <div className="settings-group">
        {cash_flows.map((cf) => (
          <button key={cf.id} type="button" className="ie-row" onClick={() => openEdit(cf)}>
            <span className="ie-row-text">
              <strong>{monthName(cf.month)}</strong>
              <span>{[`in ${formatINR(cameIn(cf))}`, `spent ${formatINR(spent(cf))}`, cf.emi ? `EMIs ${formatINR(cf.emi)}` : null, cf.investments ? `invested ${formatINR(cf.investments)}` : null, cf.notes || null].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="ie-row-amount">
              <strong style={leftOver(cf) < 0 ? { color: '#fca5a5' } : undefined}>{formatINR(leftOver(cf))}</strong>
              <span>left over · {savingsRate(cf).toFixed(0)}% saved</span>
            </span>
          </button>
        ))}
      </div>
    )
  );

  const renderWhatIf = () => {
    if (!latest) return renderLatest();
    const amount = (k: keyof typeof NO_CHANGES, label: string, description: string, allowNegative = false) => (
      <Row label={label} description={description} htmlFor={`wi-${k}`}>
        <AmountInput id={`wi-${k}`} label={label} prefix="₹" width={120} value={changes[k]} allowNegative={allowNegative} onChange={(v) => setChange(k, v)} />
      </Row>
    );
    const slider = (k: keyof typeof NO_CHANGES, label: string, max: number, sign: string) => (
      <Row label={<>{label} <strong className="cf-slider-value">{sign}{changes[k]}%</strong></>} htmlFor={`wi-${k}`}>
        <input id={`wi-${k}`} type="range" min={0} max={max} step={1} value={changes[k]} onChange={(e) => setChange(k, Number(e.target.value))} className="cf-range" />
      </Row>
    );
    const rows: [string, string, boolean][] = [
      ['Came in', 'income', true], ['Spent', 'expenses', false], ['Loan EMIs', 'emi', false], ['Invested', 'investments', true], ['Left over', 'surplus', true],
    ];
    const changed = JSON.stringify(changes) !== JSON.stringify(NO_CHANGES);
    return (
      <div className="cf-whatif">
        <Group title="Change something" description={`Starting from ${monthName(latest.month)}, your latest month.`}
          actions={changed ? <button type="button" className="settings-link" onClick={() => setChanges(NO_CHANGES)}>Reset</button> : undefined}>
          {slider('salary_change_pct', 'Salary rise', 50, '+')}
          {amount('salary_change_abs', 'Salary change', 'A fixed amount more (or less) each month.', true)}
          {slider('expense_reduction_pct', 'Spend less', 40, '−')}
          {amount('additional_investment', 'Invest more', 'Extra each month into SIPs or similar.')}
          {amount('new_emi', 'New loan EMI', 'A loan you are thinking of taking.')}
          {amount('emi_reduction', 'EMIs ending', 'A loan you are about to close.')}
          {amount('one_time_bonus', 'One-time bonus', 'A lump sum, such as a bonus or maturity.')}
        </Group>

        <section className="glass-panel db-card">
          <div className="db-card-head"><h3>Each month</h3></div>
          {!sim ? <p className="cc-note">Working it out…</p> : (
            <>
              <table className="cf-compare">
                <thead><tr><th /><th>Now</th><th>With changes</th><th>Difference</th></tr></thead>
                <tbody>
                  {rows.map(([label, key, higherIsBetter]) => {
                    const a = sim.current[key]; const b = sim.simulated[key]; const d = b - a;
                    return (
                      <tr key={key} className={key === 'surplus' ? 'cf-compare-total' : undefined}>
                        <th scope="row">{label}</th><td>{formatINR(a)}</td><td>{formatINR(b)}</td>
                        <td style={{ color: d === 0 ? 'var(--text-muted)' : (d > 0) === higherIsBetter ? 'var(--success)' : '#fca5a5' }}>{d === 0 ? '—' : `${d > 0 ? '+' : '−'}${formatINR(Math.abs(d))}`}</td>
                      </tr>
                    );
                  })}
                  <tr>
                    <th scope="row">Savings rate</th><td>{Number(sim.current.savings_rate).toFixed(0)}%</td><td>{Number(sim.simulated.savings_rate).toFixed(0)}%</td>
                    <td style={{ color: sim.simulated.savings_rate === sim.current.savings_rate ? 'var(--text-muted)' : sim.simulated.savings_rate > sim.current.savings_rate ? 'var(--success)' : '#fca5a5' }}>
                      {sim.simulated.savings_rate === sim.current.savings_rate ? '—' : `${sim.simulated.savings_rate > sim.current.savings_rate ? '+' : '−'}${Math.abs(sim.simulated.savings_rate - sim.current.savings_rate).toFixed(0)} pts`}
                    </td>
                  </tr>
                </tbody>
              </table>
              {changed && sim.recommendations?.length > 0 && (
                <ul className="db-facts">{sim.recommendations.map((r: string) => <li key={r}>{r}</li>)}</ul>
              )}
            </>
          )}
        </section>
      </div>
    );
  };

  const existing = !editing && formOpen ? logged(draft.month) : undefined;
  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Cash Flow Planning</h1>
          <p className="page-subtitle">What actually came in and went out each month, and what-if changes.</p>
        </div>
        <button className="btn btn-primary eg-add" onClick={openNew}><Plus size={15} /> Log a month</button>
      </div>

      <div role="tablist" aria-label="Cash flow views" className="cc-views">
        {([['latest', 'Latest month'], ['log', `Monthly log${cash_flows.length ? ` (${cash_flows.length})` : ''}`], ['whatif', 'What if']] as [View, string][]).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className="cc-view" onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === 'latest' && renderLatest()}
      {view === 'log' && renderLog()}
      {view === 'whatif' && renderWhatIf()}

      {formOpen && (
        <div className="db-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) closeForm(); }}>
          <div ref={formRef} role="dialog" aria-modal="true" aria-label={editing ? `Edit ${monthName(editing.month)}` : 'Log a month'} tabIndex={-1} className="db-modal-body" style={{ maxWidth: '620px' }}>
            <form className="glass-panel df-form" onSubmit={save}>
              <div className="df-head">
                <h3>{editing ? monthName(editing.month) : 'Log a month'}</h3>
                <button type="button" className="settings-link" onClick={fillFromPlan}>Fill from my plan</button>
              </div>
              <div className="df-body">
                {!editing && (
                  <div className="df-grid">
                    <div className="df-field">
                      <label htmlFor="cf-month" className="df-label">Month</label>
                      <input id="cf-month" type="month" className="form-control" required value={draft.month} onChange={(e) => setDraft((d) => ({ ...d, month: e.target.value }))} />
                      {existing && <span className="df-hint" style={{ color: 'var(--warning)' }}>{monthName(existing.month)} is already logged. Saving replaces it.</span>}
                    </div>
                  </div>
                )}
                {fillNote && <p className="cc-note" role="status" style={{ margin: 0 }}>{fillNote}</p>}
                {SECTIONS.map((section) => (
                  <section key={section.title} className="df-section" aria-label={section.title}>
                    <h4>{section.title}</h4>
                    <div className="df-grid">
                      {section.keys.map((k) => {
                        const f = FIELDS.find((x) => x.key === k)!;
                        return (
                          <div key={k} className="df-field">
                            <label htmlFor={`cf-${k}`} className="df-label">{f.label}</label>
                            <AmountInput id={`cf-${k}`} label={f.label} prefix="₹" value={Number(draft[k]) || 0} onChange={(v) => setDraft((d) => ({ ...d, [k]: v }))} />
                            {f.hint && <span className="df-hint">{f.hint}</span>}
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
                <div className="df-field">
                  <label htmlFor="cf-notes" className="df-label">Notes</label>
                  <input id="cf-notes" className="form-control" placeholder="Anything worth remembering about this month" value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} />
                </div>
              </div>
              <div className="df-foot">
                <div className="cf-foot-total">
                  {editing
                    ? <ConfirmAction label="Delete this month" confirmLabel="Delete" danger question={`Delete ${monthName(editing.month)}?`} onConfirm={() => remove(editing)} />
                    : null}
                  <span className="cc-note">Left over <strong style={{ color: leftOver(draft) < 0 ? '#fca5a5' : 'var(--text-primary)' }}>{formatINR(leftOver(draft))}</strong> · {savingsRate(draft).toFixed(0)}% saved</span>
                </div>
                <div className="df-actions">
                  <button type="button" className="btn btn-secondary" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{existing ? 'Replace' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
