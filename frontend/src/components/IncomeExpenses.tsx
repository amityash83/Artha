import React, { useEffect, useState } from 'react';
import { InitData } from '../types';
import { EntityGrid } from './EntityGrid';
import { monthlyEquivalent } from '../frequency';

const inr = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v);

/**
 * The recurring plan: what each person expects to earn and pay, per month or year.
 * Cash Flow Planning's monthly log (what actually happened) auto-fills from it, and the
 * Tax Planner's "Fill from my data" reads each person's entries from it.
 */
export const IncomeExpenses: React.FC<{
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  addRequest?: { view: 'income' | 'expenses'; nonce: number } | null;
  searchSeed?: { text: string; nonce: number } | null;
}> = ({ data, onRefresh, showToast, addRequest, searchSeed }) => {
  const seedView = searchSeed && data.expenses.some((e) => e.name === searchSeed.text) && !data.income.some((i) => i.name === searchSeed.text) ? 'expenses' : null;
  const [view, setView] = useState<'income' | 'expenses'>(addRequest?.view ?? seedView ?? 'income');
  useEffect(() => { if (addRequest) setView(addRequest.view); }, [addRequest]);
  useEffect(() => { if (seedView) setView(seedView); }, [searchSeed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const monthlyIncome = data.income.reduce((t, i) => t + monthlyEquivalent(i.amount, i.frequency), 0);
  const monthlyExpenses = data.expenses.reduce((t, e) => t + monthlyEquivalent(e.amount, e.frequency), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 className="page-title">Income &amp; Expenses</h1>
        <p className="page-subtitle">
          Your recurring plan: what each person expects to earn and pay. Cash Flow Planning&apos;s monthly log auto-fills from it,
          and the Tax Planner reads each person&apos;s entries. Enter salary as gross pay, with take-home in its own field.
        </p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
        {[
          ['Planned income per month (gross)', monthlyIncome, `${data.income.length} entr${data.income.length === 1 ? 'y' : 'ies'}`],
          ['Planned expenses per month', monthlyExpenses, `${data.expenses.length} entr${data.expenses.length === 1 ? 'y' : 'ies'}`],
          ['Difference per month', monthlyIncome - monthlyExpenses, 'Before tax, EMIs, premiums and investments'],
        ].map(([label, value, sub]) => (
          <div key={label as string} className="glass-card" style={{ padding: '14px 16px' }}>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{inr(value as number)}</div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{sub}</div>
          </div>
        ))}
      </div>
      <div role="tablist" aria-label="Income or expenses" style={{ display: 'flex', gap: '8px' }}>
        {(['income', 'expenses'] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} className={`btn ${view === v ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 16px', fontSize: '13px' }} onClick={() => setView(v)}>
            {v === 'income' ? 'Income' : 'Expenses'}
          </button>
        ))}
      </div>
      <EntityGrid
        key={view}
        entityType={view}
        entities={view === 'income' ? data.income : data.expenses}
        categories={data.categories}
        institutions={data.institutions}
        people={data.people}
        goals={data.goals}
        onRefresh={onRefresh}
        showToast={showToast}
        addRequest={addRequest && addRequest.view === view ? addRequest.nonce : undefined}
        searchSeed={searchSeed}
      />
    </div>
  );
};
