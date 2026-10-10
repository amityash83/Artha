import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { TaxComputeResult, TaxInputMetadata, TaxOptimization, TaxPayslipResult, TaxPlannerInputs, TaxRuleSetMeta } from '../../types';
import { API_BASE_URL } from '../../config';
import { apiJson, EmptyState, ErrorBanner, Pill, SubTabs } from './taxUi';
import { clearDraft, DEFAULT_OPTIMIZATION, DEFAULT_PLANNER_INPUTS, loadDraft, payslipRequest, saveDraft, setIn, toEngineInputs } from './plannerInputs';
import { PlannerOverview } from './PlannerOverview';
import { SalaryInputs } from './SalaryInputs';
import { OldRegimeInputs } from './OldRegimeInputs';
import { NewRegimeInputs } from './NewRegimeInputs';
import { RegimeComparison } from './RegimeComparison';
import { ComputationDetails } from './ComputationDetails';
import { ScenariosPanel } from './ScenariosPanel';
import { NpsOptimizer } from './NpsOptimizer';
import { PayslipSimulator } from './PayslipSimulator';
import { TaxChartsTab } from './TaxChartsTab';
import { SensitivityPanel } from './SensitivityPanel';
import { ReportsPanel } from './ReportsPanel';
import { useTaxPost } from './useTaxPost';

type PlannerTab = 'overview' | 'salary' | 'old' | 'new' | 'comparison' | 'nps' | 'payslip' | 'charts' | 'sensitivity' | 'computation' | 'scenarios' | 'reports';

const TABS: { key: PlannerTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'salary', label: 'Salary & CTC' },
  { key: 'old', label: 'Old Regime' },
  { key: 'new', label: 'New Regime' },
  { key: 'comparison', label: 'Old vs New' },
  { key: 'nps', label: 'NPS Optimizer' },
  { key: 'payslip', label: 'Payslip' },
  { key: 'charts', label: 'Charts' },
  { key: 'sensitivity', label: 'Sensitivity' },
  { key: 'computation', label: 'Computation & Audit' },
  { key: 'scenarios', label: 'Scenarios' },
  { key: 'reports', label: 'Reports & Export' },
];

const COMPUTE_DEBOUNCE_MS = 250;

// Fills fields a stored draft predates (e.g. a field added to the metadata later).
function withDefaults<T>(defaults: T, value: unknown): T {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !defaults || typeof defaults !== 'object') {
    return (value === undefined ? defaults : value) as T;
  }
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [k, d] of Object.entries(defaults as Record<string, unknown>)) {
    out[k] = withDefaults(d, (value as Record<string, unknown>)[k]);
  }
  return out as T;
}

export interface PlannerChildProps {
  inputs: TaxPlannerInputs;
  result: TaxComputeResult | null;
  update: (path: string, value: unknown) => void;
  metadata: TaxInputMetadata;
  financialYear: string;
  payslip?: TaxPayslipResult | null;
}

interface TaxPlannerProps {
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenRules: () => void;
}

export const TaxPlanner: React.FC<TaxPlannerProps> = ({ showToast, onOpenRules }) => {
  const draft = useRef(loadDraft());
  const [tab, setTab] = useState<PlannerTab>('overview');
  const [metadata, setMetadata] = useState<TaxInputMetadata | null>(null);
  const [ruleSets, setRuleSets] = useState<TaxRuleSetMeta[]>([]);
  const [financialYear, setFinancialYear] = useState<string>(draft.current?.financialYear ?? '');
  const [inputs, setInputs] = useState<TaxPlannerInputs>(
    withDefaults(DEFAULT_PLANNER_INPUTS, draft.current?.inputs),
  );
  const [optimization, setOptimization] = useState<TaxOptimization>(
    withDefaults(DEFAULT_OPTIMIZATION, draft.current?.optimization),
  );
  const [result, setResult] = useState<TaxComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);

  const loadRuleSets = useCallback(() => {
    apiJson<TaxRuleSetMeta[]>('/api/tax/rule-sets').then(setRuleSets).catch(() => setRuleSets([]));
  }, []);

  useEffect(() => {
    apiJson<TaxInputMetadata>('/api/tax/input-metadata')
      .then((m) => {
        setMetadata(m);
        setFinancialYear((fy) => fy || m.default_financial_year);
      })
      .catch((e: Error) => setError(e.message));
    loadRuleSets();
  }, [loadRuleSets]);

  // Debounced recompute on every change; each request aborts the previous one so a
  // slow response can never overwrite a newer result.
  useEffect(() => {
    if (!financialYear) return;
    saveDraft(inputs, financialYear, optimization);
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setComputing(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/tax/compute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ financial_year: financialYear, inputs: toEngineInputs(inputs) }),
          signal: controller.signal,
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.detail ?? 'Could not compute tax');
        setResult(body);
        setError(null);
      } catch (e) {
        if ((e as Error).name !== 'AbortError') {
          // Never leave a previous result on screen under a failed request: it may
          // belong to another year or rule set.
          setResult(null);
          setError((e as Error).message);
        }
      } finally {
        if (!controller.signal.aborted) setComputing(false);
      }
    }, COMPUTE_DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [inputs, financialYear]);

  useEffect(() => {
    if (financialYear) saveDraft(inputs, financialYear, optimization);
  }, [optimization]); // eslint-disable-line react-hooks/exhaustive-deps

  // Before/after payslip for the Overview cards (the Payslip tab fetches its own).
  const overviewPayslip = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, optimization),
    !!financialYear && tab === 'overview');

  const update = useCallback((path: string, value: unknown) => {
    setInputs((prev) => setIn(prev, path, value));
  }, []);

  const resetToDefaults = () => {
    clearDraft();
    setInputs(DEFAULT_PLANNER_INPUTS);
    setOptimization(DEFAULT_OPTIMIZATION);
    showToast?.('Planner inputs reset to the sample payroll', 'info');
  };

  if (!metadata) {
    return error ? <ErrorBanner message={error} /> : <EmptyState>Loading tax planner...</EmptyState>;
  }

  // Only years with a rule set that actually applies (shipped, or a user set selected
  // for that year); a draft must be selected in Tax Rules before the planner uses it.
  const years = Array.from(new Set(ruleSets.filter((r) => r.applies_to_fy).map((r) => r.financial_year))).sort().reverse();
  const applying = ruleSets.find((r) => r.financial_year === financialYear && r.applies_to_fy);
  const changeYear = (fy: string) => {
    setResult(null);
    setFinancialYear(fy);
  };
  const childProps: PlannerChildProps = { inputs, result, update, metadata, financialYear };
  const optProps = { inputs, financialYear, metadata, optimization, setOptimization };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12.5px' }}>
        <label htmlFor="planner-fy" className="form-label" style={{ fontSize: '12px' }}>Financial year</label>
        <select id="planner-fy" className="form-input" style={{ padding: '6px 10px', fontSize: '12.5px', width: 'auto' }}
          value={financialYear} onChange={(e) => changeYear(e.target.value)}>
          {(years.includes(financialYear) || !financialYear ? years : [financialYear, ...years]).map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
        </select>
        {result && (
          <span style={{ color: 'var(--text-secondary)' }}>
            Rules: <strong style={{ color: 'var(--text-primary)' }}>{result.rule_set.name ?? result.rule_set.rule_set_id}</strong>{' '}
            v{result.rule_set.version} · {result.rule_set.act}{' '}
            {result.rule_set.source === 'user' && <Pill color="#ec4899" title="Your own rule set is selected for this year">Your rules</Pill>}
          </span>
        )}
        {ruleSets.length > 0 && !applying && (
          <Pill color="#f59e0b" title="Select a rule set for this year in Tax Rules">No rule set in use for this year</Pill>
        )}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {computing && <span style={{ color: 'var(--text-muted)' }} aria-live="polite">Recalculating…</span>}
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onOpenRules}>Manage tax rules</button>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={resetToDefaults} title="Replace all inputs with the sample payroll">
            <RotateCcw size={13} /> Reset inputs
          </button>
        </span>
      </div>

      {error && <ErrorBanner message={error} />}

      <SubTabs label="Tax planner sections" tabs={TABS} active={tab} onChange={setTab} />

      {tab === 'overview' && <PlannerOverview {...childProps} payslip={overviewPayslip.stale ? null : overviewPayslip.data} />}
      {tab === 'salary' && <SalaryInputs {...childProps} />}
      {tab === 'old' && <OldRegimeInputs {...childProps} />}
      {tab === 'new' && <NewRegimeInputs {...childProps} />}
      {tab === 'comparison' && <RegimeComparison {...childProps} />}
      {tab === 'nps' && <NpsOptimizer {...optProps} />}
      {tab === 'payslip' && <PayslipSimulator {...optProps} />}
      {tab === 'charts' && <TaxChartsTab {...optProps} result={result} />}
      {tab === 'sensitivity' && <SensitivityPanel {...optProps} />}
      {tab === 'reports' && <ReportsPanel {...optProps} result={result} />}
      {tab === 'computation' && <ComputationDetails {...childProps} />}
      {tab === 'scenarios' && (
        <ScenariosPanel
          inputs={inputs}
          financialYear={financialYear}
          showToast={showToast}
          onLoad={(loadedInputs, fy) => {
            setInputs(withDefaults(DEFAULT_PLANNER_INPUTS, loadedInputs));
            changeYear(fy);
            setTab('overview');
          }}
        />
      )}
    </div>
  );
};
