import React, { useEffect, useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Category, Expense, Income, InitData, Person } from '../types';
import { useModalA11y } from '../hooks/useModalA11y';
import { FREQUENCIES, monthlyEquivalent, perYear } from '../frequency';
import { AmountInput, api, ConfirmAction, Switch } from './settings/ui';

// The recurring plan: what each person expects to earn and pay. Cash Flow Planning's
// monthly log auto-fills from it, and the Tax Planner reads each person's entries.
// Entries are ordinary income/expenses rows (generic entity API); salary amounts are
// gross, with take-home in the Salary category's net_amount field.

type Kind = 'income' | 'expenses';
type Entry = (Income | Expense) & { owner_id?: number; owner_name?: string; status?: string; taxable?: number; net_amount?: number };

const inr = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const isActive = (e: Entry) => (e.status ?? 'Active') === 'Active';
const takeHomeMonthly = (e: Entry) =>
  e.category_name === 'Salary' && (e.net_amount || 0) > 0 ? monthlyEquivalent(e.net_amount || 0, e.frequency) : monthlyEquivalent(e.amount, e.frequency);

const QUICK_STARTS: Record<Kind, { category: string; name: string }[]> = {
  income: [{ category: 'Salary', name: 'Salary' }, { category: 'Rental', name: 'Rent received' }, { category: 'Interest', name: 'Interest' }],
  expenses: [{ category: 'Rent', name: 'Rent' }, { category: 'Education', name: 'School fees' }, { category: 'General', name: 'Household' }],
};
const FREQ_LABEL: Record<string, string> = { Monthly: 'month', Quarterly: 'quarter', 'Half-Yearly': 'half-year', Yearly: 'year' };

// ---------------------------------------------------------------------------

interface Draft { name: string; category_id: number | ''; owner_id: number | ''; amount: number; frequency: string; net_amount: number; taxable: boolean; active: boolean }

const EntryForm: React.FC<{
  kind: Kind;
  entry: Entry | null;
  seed?: { category: string; name: string };
  categories: Category[];
  people: Person[];
  defaultOwner: number | '';
  onClose: () => void;
  onSaved: (msg: string) => void;
}> = ({ kind, entry, seed, categories, people, defaultOwner, onClose, onSaved }) => {
  const modalRef = useModalA11y(true, onClose);
  const cats = categories.filter((c) => c.entity_type === (kind === 'income' ? 'Income' : 'Expense'));
  const seedCat = seed ? cats.find((c) => c.name === seed.category) : undefined;
  const [d, setD] = useState<Draft>(() => entry ? {
    name: entry.name, category_id: entry.category_id, owner_id: entry.owner_id ?? defaultOwner, amount: entry.amount,
    frequency: entry.frequency || 'Monthly', net_amount: entry.net_amount || 0, taxable: entry.taxable !== 0, active: isActive(entry),
  } : {
    name: seed?.name ?? '', category_id: seedCat?.id ?? cats[0]?.id ?? '', owner_id: defaultOwner, amount: 0,
    frequency: 'Monthly', net_amount: 0, taxable: true, active: true,
  });
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const category = cats.find((c) => c.id === d.category_id);
  const isSalary = kind === 'income' && category?.name === 'Salary';
  const noun = kind === 'income' ? 'income' : 'expense';
  const frequencies = (FREQUENCIES as readonly string[]).includes(d.frequency) ? [...FREQUENCIES] : [d.frequency, ...FREQUENCIES];

  const save = async () => {
    const payload: Record<string, unknown> = {
      name: d.name.trim(), category_id: d.category_id, owner_id: d.owner_id || undefined, amount: d.amount,
      frequency: d.frequency, status: d.active ? 'Active' : 'Paused',
    };
    if (kind === 'income') payload.taxable = d.taxable ? 1 : 0;
    if (isSalary) payload.net_amount = d.net_amount;
    try {
      await api(entry ? `/api/entities/${kind}/${entry.id}` : `/api/entities/${kind}`, { method: entry ? 'PUT' : 'POST', body: JSON.stringify(payload) });
      onSaved(entry ? 'Saved' : `Added ${d.name.trim()}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const remove = async () => {
    try {
      await api(`/api/entities/${kind}/${entry!.id}`, { method: 'DELETE' });
      onSaved(`Deleted ${entry!.name}`);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal-content ie-form" role="dialog" aria-modal="true" aria-labelledby="ie-form-title" onClick={(e) => e.stopPropagation()}>
        <div className="ie-form-head">
          <h3 id="ie-form-title">{entry ? `Edit ${entry.name}` : `Add ${noun}`}</h3>
          <button type="button" className="settings-link" aria-label="Close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ie-fields">
          <label>
            <span>Type</span>
            <select className="settings-input" value={d.category_id} onChange={(e) => set({ category_id: Number(e.target.value) })}>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            <span>Whose</span>
            <select className="settings-input" value={d.owner_id} onChange={(e) => set({ owner_id: Number(e.target.value) })}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="ie-wide">
            <span>Name</span>
            <input className="settings-input" value={d.name} placeholder={kind === 'income' ? 'e.g. Acme salary' : 'e.g. Flat rent'} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <div className="ie-wide">
            <span className="ie-label">{isSalary ? 'Gross pay' : 'Amount'}</span>
            <div className="ie-amount">
              <AmountInput label="Amount" value={d.amount} prefix="₹" width={150} onChange={(v) => set({ amount: v })} />
              <span className="settings-note">per</span>
              <select aria-label="How often" className="settings-input" value={d.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                {frequencies.map((f) => <option key={f} value={f}>{FREQ_LABEL[f] ?? f}</option>)}
              </select>
              {d.frequency !== 'Monthly' && perYear(d.frequency) && <span className="settings-note">= {inr(monthlyEquivalent(d.amount, d.frequency))} a month</span>}
            </div>
            {isSalary && <span className="settings-note">Before tax and payroll deductions. The Tax Planner uses this.</span>}
          </div>
          {isSalary && (
            <div className="ie-wide">
              <span className="ie-label">Take-home pay</span>
              <div className="ie-amount">
                <AmountInput label="Take-home pay" value={d.net_amount} prefix="₹" width={150} onChange={(v) => set({ net_amount: v })} />
                <span className="settings-note">per {FREQ_LABEL[d.frequency] ?? d.frequency}, what reaches your bank. Cash Flow Planning uses this.</span>
              </div>
            </div>
          )}
          {kind === 'income' && !isSalary && (
            <div className="ie-toggle ie-wide">
              <span><strong>Taxable</strong><span className="settings-note">Counted by the Tax Planner.</span></span>
              <Switch label="Taxable" checked={d.taxable} onChange={(v) => set({ taxable: v })} />
            </div>
          )}
          <div className="ie-toggle ie-wide">
            <span><strong>Still current</strong><span className="settings-note">Turn off for something that has stopped; it's kept but not counted.</span></span>
            <Switch label="Still current" checked={d.active} onChange={(v) => set({ active: v })} />
          </div>
        </div>
        {error && <p role="alert" style={{ color: '#fca5a5', fontSize: '12.5px', margin: '8px 0 0' }}>{error}</p>}
        <div className="ie-form-actions">
          {entry && <ConfirmAction label="Delete" confirmLabel="Delete" question={`Delete ${entry.name}?`} danger onConfirm={remove} />}
          <span style={{ flex: 1 }} />
          <button type="button" className="settings-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="settings-btn settings-btn--primary" disabled={!d.name.trim() || !d.category_id} onClick={save}>
            {entry ? 'Save' : `Add ${noun}`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const EntryList: React.FC<{
  kind: Kind;
  entries: Entry[];
  highlight: string | null;
  showOwner: boolean;
  onAdd: (seed?: { category: string; name: string }) => void;
  onEdit: (e: Entry) => void;
}> = ({ kind, entries, highlight, showOwner, onAdd, onEdit }) => {
  const sorted = [...entries].sort((a, b) => Number(isActive(b)) - Number(isActive(a)) || monthlyEquivalent(b.amount, b.frequency) - monthlyEquivalent(a.amount, a.frequency));
  return (
    <section className="ie-list" aria-label={kind === 'income' ? 'Income' : 'Expenses'}>
      <div className="settings-group-head">
        <h3 className="settings-group-title">{kind === 'income' ? 'Income' : 'Expenses'}</h3>
        <button type="button" className="settings-link" onClick={() => onAdd()}><Plus size={12} style={{ verticalAlign: '-2px' }} /> Add {kind === 'income' ? 'income' : 'expense'}</button>
      </div>
      <div className="settings-group">
        {sorted.length === 0 && (
          <div className="ie-empty">
            <p>{kind === 'income' ? 'Nothing yet. Start with what comes in regularly:' : 'Nothing yet. Start with your regular commitments:'}</p>
            <div>
              {QUICK_STARTS[kind].map((q) => (
                <button key={q.name} type="button" className="settings-btn" onClick={() => onAdd(q)}><Plus size={12} /> {q.name}</button>
              ))}
            </div>
          </div>
        )}
        {sorted.map((e) => {
          const yearly = (e.amount || 0) * (perYear(e.frequency) ?? 1);
          return (
            <button key={e.id} type="button" className={`ie-row${isActive(e) ? '' : ' ie-row--paused'}${highlight === e.name ? ' ie-row--hit' : ''}`} onClick={() => onEdit(e)}>
              <span className="ie-row-text">
                <strong>{e.name}</strong>
                <span>{[e.category_name !== e.name ? e.category_name : null, showOwner ? e.owner_name : null, isActive(e) ? null : 'Paused'].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="ie-row-amount">
                <strong>{inr(monthlyEquivalent(e.amount, e.frequency))}<small>/mo</small></strong>
                <span>{inr(yearly)} a year{e.category_name === 'Salary' && (e.net_amount || 0) > 0 ? ` · take-home ${inr(takeHomeMonthly(e))}/mo` : ''}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const IncomeExpenses: React.FC<{
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  addRequest?: { view: Kind; nonce: number } | null;
  searchSeed?: { text: string; nonce: number } | null;
}> = ({ data, onRefresh, showToast, addRequest, searchSeed }) => {
  const people = data.people;
  const primary = (people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id ?? '';
  const [person, setPerson] = useState<number | 'all'>('all');
  const [form, setForm] = useState<{ kind: Kind; entry: Entry | null; seed?: { category: string; name: string } } | null>(null);
  const [highlight, setHighlight] = useState<string | null>(searchSeed?.text ?? null);

  useEffect(() => { if (addRequest) setForm({ kind: addRequest.view, entry: null }); }, [addRequest]);
  useEffect(() => { if (searchSeed) { setPerson('all'); setHighlight(searchSeed.text); } }, [searchSeed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (rows: Entry[]) => rows.filter((r) => person === 'all' || r.owner_id === person);
  const income = pick(data.income as Entry[]);
  const expenses = pick(data.expenses as Entry[]);
  const totals = useMemo(() => {
    const active = (rows: Entry[]) => rows.filter(isActive);
    const gross = active(income).reduce((t, e) => t + monthlyEquivalent(e.amount, e.frequency), 0);
    const takeHome = active(income).reduce((t, e) => t + takeHomeMonthly(e), 0);
    const spend = active(expenses).reduce((t, e) => t + monthlyEquivalent(e.amount, e.frequency), 0);
    return { gross, takeHome, spend, left: takeHome - spend };
  }, [income, expenses]);
  const owners = new Set([...data.income, ...data.expenses].map((e: Entry) => e.owner_id));

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Income &amp; Expenses</h1>
          <p className="page-subtitle">What comes in and goes out regularly. Cash Flow Planning starts each month from this, and the Tax Planner reads each person's income.</p>
        </div>
        {people.length > 1 && (
          <div role="radiogroup" aria-label="Whose" className="cc-subviews">
            <button type="button" role="radio" aria-checked={person === 'all'} className="cc-subview" aria-selected={person === 'all'} onClick={() => setPerson('all')}>Everyone</button>
            {people.filter((p) => owners.has(p.id) || p.id === primary).map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={person === p.id} aria-selected={person === p.id} className="cc-subview" onClick={() => setPerson(p.id)}>{p.name.split(' ')[0]}</button>
            ))}
          </div>
        )}
      </div>

      <div className="glass-panel cc-summary ie-summary">
        {[
          ['Income (before tax)', totals.gross, 'a month'],
          ['Take-home', totals.takeHome, 'salary after deductions, plus other income'],
          ['Regular expenses', totals.spend, 'a month'],
          ['Left over', totals.left, 'for EMIs, premiums, savings and investing'],
        ].map(([label, value, note], i) => (
          <div key={label as string} className={i === 0 ? 'cc-summary-main' : 'cc-summary-stat'}>
            <div className="cc-label">{label}</div>
            <strong style={{ fontSize: i === 0 ? '22px' : undefined, color: label === 'Left over' && (value as number) < 0 ? '#f87171' : undefined }}>{inr(value as number)}</strong>
            <span className="cc-note">{note}</span>
          </div>
        ))}
      </div>

      <div className="ie-lists">
        <EntryList kind="income" entries={income} highlight={highlight} showOwner={person === 'all' && people.length > 1}
          onAdd={(seed) => setForm({ kind: 'income', entry: null, seed })} onEdit={(e) => setForm({ kind: 'income', entry: e })} />
        <EntryList kind="expenses" entries={expenses} highlight={highlight} showOwner={person === 'all' && people.length > 1}
          onAdd={(seed) => setForm({ kind: 'expenses', entry: null, seed })} onEdit={(e) => setForm({ kind: 'expenses', entry: e })} />
      </div>

      {form && (
        <EntryForm kind={form.kind} entry={form.entry} seed={form.seed} categories={data.categories} people={people}
          defaultOwner={person === 'all' ? primary : person}
          onClose={() => setForm(null)}
          onSaved={(msg) => { setForm(null); setHighlight(null); onRefresh(); showToast?.(msg, 'success'); }} />
      )}
    </div>
  );
};
