import React from 'react';
import { InitData } from '../types';
import { TaxPlanner } from './tax/TaxPlanner';

interface TaxationProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * Income tax: one plan per person and year (TaxPlanner). Summary, Income, Deductions,
 * Pay & TDS and Ways to save cover what most people need; charts, what-ifs, the workings,
 * scenarios, reports and the tax rules are under More. (The separate Quick estimate and
 * Capital gains tabs were folded in: a year with Quick estimate figures and no plan starts
 * from them, and capital gains live under Income and Ways to save.)
 */
export const Taxation: React.FC<TaxationProps> = ({ data, showToast }) => (
  <div className="db-page">
    <div className="eg-head">
      <div>
        <h1 className="page-title">Taxation</h1>
        <p className="page-subtitle">Your income tax for the year: which regime is better, what's still to pay, and how to pay less.</p>
      </div>
    </div>
    {data.people.length === 0
      ? <div className="settings-group"><div className="ie-empty"><p>Add a person in Settings › People first.</p></div></div>
      : <TaxPlanner people={data.people} taxProfiles={data.tax_profiles} articles={data.knowledge_articles} showToast={showToast} />}
    <p className="cc-note tx-disclaimer">Estimates to help you decide, not tax advice. Each result names the rule set it used and how well each rule is verified; check against the current Act before filing.</p>
  </div>
);
