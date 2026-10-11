import React, { useEffect, useState } from 'react';
import { InitData, Category } from '../types';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';
import { AmountInput, SaveStatus, useAutoSave } from './settings/ui';

interface BudgetPlannerProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

// Spending is what left a bank account ("Money out") or went on a card ("Card spend"),
// by expense category, in the chosen month. Loan EMIs carry no category, so they count
// towards an expense category named "EMI" when there is one.
const SPENDING_TYPES = ['Debit', 'Spend', 'EMI'];

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** One category: what was spent, against its monthly limit, which saves as you type. */
const BudgetRow: React.FC<{ cat: Category; spent: number; onSaved: () => void }> = ({ cat, spent, onSaved }) => {
  const [limit, setLimit] = useState(cat.monthly_budget || 0);
  useEffect(() => setLimit(cat.monthly_budget || 0), [cat.monthly_budget]);
  const save = useAutoSave(async (value: number) => {
    const res = await fetch(`${API_BASE_URL}/api/metadata/categories/${cat.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cat.name, entity_type: cat.entity_type, fields_definition: cat.fields_definition, monthly_budget: value }),
    });
    if (!res.ok) throw new Error('could not save');
    onSaved();
  });
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const tone = limit <= 0 ? null : spent > limit ? 'danger' : pct >= 80 ? 'warning' : 'success';
  return (
    <div className="settings-row bp-row">
      <div className="settings-row-text">
        <div className="settings-row-label">{cat.name}</div>
        <div className="settings-row-desc">
          {limit > 0
            ? spent > limit ? <span style={{ color: '#fca5a5' }}>{formatINR(spent)} spent, {formatINR(spent - limit)} over</span>
              : `${formatINR(spent)} spent, ${formatINR(limit - spent)} left`
            : spent > 0 ? `${formatINR(spent)} spent, no limit set` : 'No limit set'}
        </div>
        {tone && <div className="cc-meter bp-meter"><div style={{ width: `${Math.min(pct, 100)}%`, background: `var(--${tone})` }} /></div>}
      </div>
      <div className="settings-row-control">
        <SaveStatus state={save.state} error={save.error} />
        <AmountInput label={`${cat.name} monthly limit`} prefix="₹" width={100} value={limit}
          onChange={(v) => { setLimit(v); save.schedule(v); }} />
      </div>
    </div>
  );
};

export const BudgetPlanner: React.FC<BudgetPlannerProps> = ({ data, onRefresh }) => {
  const categories = data.categories.filter((c) => c.entity_type === 'Expense');
  const [month, setMonth] = useState(thisMonth);
  const [spent, setSpent] = useState<Record<number, number>>({});
  const [uncategorised, setUncategorised] = useState(0);
  const [loading, setLoading] = useState(true);
  // Row order is fixed when a month loads, so a row doesn't jump while its limit is typed.
  const [order, setOrder] = useState<number[]>([]);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE_URL}/api/entities/transactions`)
      .then((r) => (r.ok ? r.json() : []))
      .then((txs: any[]) => {
        const byCat: Record<number, number> = {};
        let none = 0;
        const emiCategory = categories.find((c) => c.name.toLowerCase() === 'emi');
        for (const tx of txs) {
          if (!SPENDING_TYPES.includes(tx.type) || !String(tx.transaction_date || '').startsWith(month)) continue;
          if (tx.type === 'EMI' && !tx.category_id && !emiCategory) continue; // nowhere to count it
          const cat = categories.find((c) => c.id === (tx.type === 'EMI' && !tx.category_id ? emiCategory?.id : tx.category_id));
          if (cat) byCat[cat.id] = (byCat[cat.id] || 0) + tx.amount; else none += tx.amount;
        }
        setSpent(byCat);
        setUncategorised(none);
        // Categories with a limit first (most used first), then ones with spending, then the rest.
        const usage = (c: Category) => ((c.monthly_budget || 0) > 0 ? (byCat[c.id] || 0) / (c.monthly_budget || 1) : -1);
        setOrder([...categories].sort((a, b) => usage(b) - usage(a) || (byCat[b.id] || 0) - (byCat[a.id] || 0) || a.name.localeCompare(b.name)).map((c) => c.id));
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [month]); // eslint-disable-line react-hooks/exhaustive-deps

  const budgeted = categories.filter((c) => (c.monthly_budget || 0) > 0);
  const limits = budgeted.reduce((s, c) => s + (c.monthly_budget || 0), 0);
  const spentBudgeted = budgeted.reduce((s, c) => s + (spent[c.id] || 0), 0);
  const spentElsewhere = categories.filter((c) => !((c.monthly_budget || 0) > 0)).reduce((s, c) => s + (spent[c.id] || 0), 0) + uncategorised;
  const over = budgeted.filter((c) => (spent[c.id] || 0) > (c.monthly_budget || 0));

  const rank = (c: Category) => { const i = order.indexOf(c.id); return i < 0 ? order.length : i; };
  const ordered = [...categories].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return { value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
  });

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Budget Planner</h1>
          <p className="page-subtitle">A monthly limit for each spending category, against what you actually spent from your accounts and cards.</p>
        </div>
        <select className="form-control bp-month" aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="glass-panel cc-summary db-summary">
        <div className="cc-summary-main">
          <div className="cc-label">{limits > 0 ? (spentBudgeted > limits ? 'Over your limits' : 'Left within your limits') : 'No limits set yet'}</div>
          <strong className="eg-figure db-networth" style={spentBudgeted > limits && limits > 0 ? { color: '#fca5a5' } : undefined}>
            {limits > 0 ? formatINR(Math.abs(limits - spentBudgeted)) : '—'}
          </strong>
          {limits > 0 && <div className="cc-meter"><div style={{ width: `${Math.min((spentBudgeted / limits) * 100, 100)}%`, background: spentBudgeted > limits ? 'var(--danger)' : 'var(--accent)' }} /></div>}
          <span className="cc-note">{limits > 0 ? `${formatINR(spentBudgeted)} of ${formatINR(limits)} across ${budgeted.length} categor${budgeted.length === 1 ? 'y' : 'ies'}` : 'Type a limit next to any category below.'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Categories over</div>
          <strong style={over.length ? { color: '#fca5a5' } : undefined}>{over.length}</strong>
          <span className="cc-note">{over.length ? over.map((c) => c.name).join(', ') : 'none'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Spent without a limit</div>
          <strong>{formatINR(spentElsewhere)}</strong>
          <span className="cc-note">{uncategorised > 0 ? `incl. ${formatINR(uncategorised)} uncategorised` : 'in other categories'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Total spent</div>
          <strong>{formatINR(spentBudgeted + spentElsewhere)}</strong>
          <span className="cc-note">accounts and cards</span>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="settings-group"><div className="ie-empty"><p>No spending categories yet. Add them in Settings › Categories.</p></div></div>
      ) : (
        <section aria-label="Categories">
          <div className="settings-group-head">
            <h3 className="settings-group-title">Categories</h3>
            {loading && <span className="cc-note">Adding up…</span>}
          </div>
          <div className="settings-group">
            {ordered.map((c) => <BudgetRow key={c.id} cat={c} spent={spent[c.id] || 0} onSaved={onRefresh} />)}
          </div>
        </section>
      )}
    </div>
  );
};
