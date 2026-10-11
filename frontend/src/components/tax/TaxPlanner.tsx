import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Wand2 } from 'lucide-react';
import { Person, TaxComputeResult, TaxInputMetadata, TaxOptimization, TaxPayslipResult, TaxPlannerInputs, TaxRuleSetMeta } from '../../types';
import { API_BASE_URL } from '../../config';
import { apiJson, EmptyState, ErrorBanner, Pill, SubTabs } from './taxUi';
import { annualFromMonths, clearDraft, DEFAULT_OPTIMIZATION, DEFAULT_PLANNER_INPUTS, loadDraft, payslipRequest, setIn, toEngineInputs } from './plannerInputs';
import { PrefillDialog } from './PrefillDialog';
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
const DRAFT_SAVE_DEBOUNCE_MS = 600;
// One saved plan per person and year. The single draft kept before that (DB slot 'default',
// or browser storage before that) becomes the Primary Owner's plan for its year, once.
const LEGACY_DRAFT_URL = '/api/tax/planner-draft/default';
const draftUrl = (personId: number | null, fy: string) => `/api/tax/planner-draft/p${personId ?? 0}-${fy}`;
type DraftContent = { inputs?: unknown; financialYear?: string; optimization?: unknown };
const getDraft = (url: string) => apiJson<{ content: DraftContent | null }>(url).then((r) => r.content).catch(() => null);
const putDraft = (url: string, content: DraftContent) => apiJson(url, { method: 'PUT', body: JSON.stringify(content) });

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
  people?: Person[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onOpenRules: () => void;
}

export const TaxPlanner: React.FC<TaxPlannerProps> = ({ people = [], showToast, onOpenRules }) => {
  const primaryId = (people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id ?? null;
  const [personId, setPersonId] = useState<number | null>(primaryId);
  const [tab, setTab] = useState<PlannerTab>('overview');
  const [metadata, setMetadata] = useState<TaxInputMetadata | null>(null);
  const [ruleSets, setRuleSets] = useState<TaxRuleSetMeta[]>([]);
  const [financialYear, setFinancialYear] = useState<string>('');
  const [inputs, setInputs] = useState<TaxPlannerInputs>(DEFAULT_PLANNER_INPUTS);
  const [optimization, setOptimization] = useState<TaxOptimization>(DEFAULT_OPTIMIZATION);
  const [draftReady, setDraftReady] = useState(false);
  const [showPrefill, setShowPrefill] = useState(false);
  const [result, setResult] = useState<TaxComputeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [computing, setComputing] = useState(false);
  const skipNextSave = useRef(true);

  const loadRuleSets = useCallback(() => {
    apiJson<TaxRuleSetMeta[]>('/api/tax/rule-sets').then(setRuleSets).catch(() => setRuleSets([]));
  }, []);

  const apply = (d: DraftContent | null, fy: string) => {
    setInputs(withDefaults(DEFAULT_PLANNER_INPUTS, d?.inputs));
    setOptimization(withDefaults(DEFAULT_OPTIMIZATION, d?.optimization));
    setFinancialYear(fy);
  };

  // Plans live in the database, so they travel with the .db file.
  useEffect(() => {
    loadRuleSets();
    (async () => {
      let meta: TaxInputMetadata;
      try {
        meta = await apiJson<TaxInputMetadata>('/api/tax/input-metadata');
        setMetadata(meta);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      const legacy = (await getDraft(LEGACY_DRAFT_URL)) ?? loadDraft();
      const fy = legacy?.financialYear || meta.default_financial_year;
      const own = await getDraft(draftUrl(primaryId, fy));
      if (own) apply(own, fy);
      else if (legacy) {
        apply(legacy, fy);
        await putDraft(draftUrl(primaryId, fy), { ...legacy, financialYear: fy }).catch(() => undefined);
      } else apply(null, fy);
      if (legacy) {
        await apiJson(LEGACY_DRAFT_URL, { method: 'DELETE' }).catch(() => undefined);
        clearDraft(); // never leaks into a different database opened later
      }
      skipNextSave.current = true;
      setDraftReady(true);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!draftReady || !financialYear) return;
    if (skipNextSave.current) { skipNextSave.current = false; return; } // the plan just loaded
    const url = draftUrl(personId, financialYear);
    const timer = window.setTimeout(() => {
      putDraft(url, { inputs, financialYear, optimization })
        .catch(() => { /* next change retries; the planner keeps working without a saved plan */ });
    }, DRAFT_SAVE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draftReady, inputs, financialYear, optimization, personId]);

  /** Opens another person's or year's plan, saving this one first. */
  const switchPlan = async (nextPerson: number | null, nextFy: string) => {
    if (nextPerson === personId && nextFy === financialYear) return;
    await putDraft(draftUrl(personId, financialYear), { inputs, financialYear, optimization }).catch(() => undefined);
    const saved = await getDraft(draftUrl(nextPerson, nextFy));
    setResult(null);
    skipNextSave.current = true;
    if (saved) apply(saved, nextFy);
    else if (nextPerson === personId) {
      // A new year starts from this year's figures. Month-by-month entries belong to one
      // year, so they're folded into annual totals.
      setInputs(inputs.monthly?.enabled ? { ...annualFromMonths(inputs), monthly: null } : inputs);
      setFinancialYear(nextFy);
      showToast?.(`New plan for FY ${nextFy}, starting from your FY ${financialYear} figures`, 'info');
    } else {
      apply(null, nextFy);
      const who = people.find((p) => p.id === nextPerson)?.name ?? 'this person';
      showToast?.(`New plan for ${who}: starting from the sample payroll. Use "Fill from my data" to bring in their figures.`, 'info');
    }
    setPersonId(nextPerson);
  };

  // Debounced recompute on every change; each request aborts the previous one so a
  // slow response can never overwrite a newer result.
  useEffect(() => {
    if (!financialYear || !draftReady) return;
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
  }, [inputs, financialYear, draftReady]);

  // Before/after payslip for the Overview cards (the Payslip tab fetches its own).
  const overviewPayslip = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, optimization),
    !!financialYear && tab === 'overview');

  const update = useCallback((path: string, value: unknown) => {
    setInputs((prev) => setIn(prev, path, value));
  }, []);

  const resetToDefaults = () => {
    apiJson(draftUrl(personId, financialYear), { method: 'DELETE' }).catch(() => undefined);
    setInputs(DEFAULT_PLANNER_INPUTS);
    setOptimization(DEFAULT_OPTIMIZATION);
    showToast?.('Planner inputs reset to the sample payroll', 'info');
  };

  if (!metadata || !draftReady) {
    return error ? <ErrorBanner message={error} /> : <EmptyState>Loading tax planner...</EmptyState>;
  }

  // Only years with a rule set that actually applies (shipped, or a user set selected
  // for that year); a draft must be selected in Tax Rules before the planner uses it.
  const years = Array.from(new Set(ruleSets.filter((r) => r.applies_to_fy).map((r) => r.financial_year))).sort().reverse();
  const applying = ruleSets.find((r) => r.financial_year === financialYear && r.applies_to_fy);
  const changeYear = (fy: string) => { void switchPlan(personId, fy); };
  const childProps: PlannerChildProps = { inputs, result, update, metadata, financialYear };
  const optProps = { inputs, financialYear, metadata, optimization, setOptimization };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '12px', fontSize: '12.5px' }}>
        {people.length > 0 && (
          <>
            <label htmlFor="planner-person" className="form-label" style={{ fontSize: '12px' }}>Whose tax</label>
            <select id="planner-person" className="form-input" style={{ padding: '6px 10px', fontSize: '12.5px', width: 'auto' }}
              value={personId ?? ''} onChange={(e) => { void switchPlan(Number(e.target.value), financialYear); }}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        )}
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
          <button className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={() => setShowPrefill(true)} title="Propose figures from your income, investments, insurance, loans and gains">
            <Wand2 size={13} /> Fill from my data
          </button>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={onOpenRules}>Manage tax rules</button>
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={resetToDefaults} title="Replace all inputs with the sample payroll">
            <RotateCcw size={13} /> Reset inputs
          </button>
        </span>
      </div>

      {error && <ErrorBanner message={error} />}
      {showPrefill && (
        <PrefillDialog inputs={inputs} metadata={metadata} financialYear={financialYear} personId={personId} onClose={() => setShowPrefill(false)}
          onApply={(next, summary) => { setInputs(next); setShowPrefill(false); showToast?.(summary, 'success'); }} />
      )}

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
            // A scenario loads into this person's plan for the scenario's year (and is saved there).
            if (fy !== financialYear) {
              void putDraft(draftUrl(personId, financialYear), { inputs, financialYear, optimization }).catch(() => undefined);
              setResult(null);
              setFinancialYear(fy);
            }
            setInputs(withDefaults(DEFAULT_PLANNER_INPUTS, loadedInputs));
            setTab('overview');
          }}
        />
      )}
    </div>
  );
};
