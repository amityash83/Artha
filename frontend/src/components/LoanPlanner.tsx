import React, { useState } from 'react';
import { InitData } from '../types';
import { EmiCalculator } from './EmiCalculator';
import { LoanOptimizer } from './LoanOptimizer';

type View = 'emi' | 'order';
const VIEWS: { id: View; label: string; intro: string }[] = [
  { id: 'emi', label: 'EMI and prepayments', intro: "Work out any loan's EMI, and how much interest and time prepayments save." },
  { id: 'order', label: 'Which loan to pay first', intro: 'For your own loans: compare clearing the smallest first (snowball) with the costliest first (avalanche).' },
];

/** The two loan calculators on one page (they used to be the EMI Tool and Loan Optimizer pages). */
export const LoanPlanner: React.FC<{
  data: InitData;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ data, showToast }) => {
  const [view, setView] = useState<View>('emi');
  const current = VIEWS.find((v) => v.id === view)!;
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Loan planner</h1>
        <p className="page-subtitle">{current.intro}</p>
      </div>
      <div role="tablist" aria-label="Loan planner views" className="cc-views" style={{ marginBottom: '22px' }}>
        {VIEWS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={view === v.id} className="cc-view" onClick={() => setView(v.id)}>{v.label}</button>
        ))}
      </div>
      {view === 'emi' ? <EmiCalculator showToast={showToast} embedded /> : <LoanOptimizer data={data} embedded />}
    </div>
  );
};
