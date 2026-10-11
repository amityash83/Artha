import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Wand2 } from 'lucide-react';
import { KnowledgeArticle, Person, TaxComputeResult, TaxInputMetadata, TaxOptimization, TaxPayslipResult, TaxPlannerInputs, TaxPrefillResult, TaxProfile, TaxRuleSetMeta } from '../../types';
import { API_BASE_URL } from '../../config';
import { ConfirmAction } from '../settings/ui';
import { apiJson, EmptyState, ErrorBanner, Pill } from './taxUi';
import { annualFromMonths, clearDraft, DEFAULT_OPTIMIZATION, DEFAULT_PLANNER_INPUTS, EMPTY_PLANNER_INPUTS, isEmptyPlan, loadDraft, payslipRequest, setIn, toEngineInputs } from './plannerInputs';
import { applyTarget, PrefillDialog } from './PrefillDialog';
import { ComputationDetails } from './ComputationDetails';
import { ScenariosPanel } from './ScenariosPanel';
import { TaxChartsTab } from './TaxChartsTab';
import { SensitivityPanel } from './SensitivityPanel';
import { ReportsPanel } from './ReportsPanel';
import { TaxRulesManager } from './TaxRulesManager';
import { DeductionsTab, IncomeTab, MainTab, PayTab, TAB_LABELS, TaxSummary, WaysToSaveTab } from './PlannerTabs';
import { useTaxPost } from './useTaxPost';

// Five tabs for what most people need; the specialist views sit under More.
type MoreTab = 'charts' | 'sensitivity' | 'computation' | 'scenarios' | 'reports' | 'rules';
type PlannerTab = MainTab | MoreTab;

const MAIN_TABS: MainTab[] = ['summary', 'income', 'deductions', 'pay', 'save'];
const MORE_TABS: { key: MoreTab; label: string; hint: string }[] = [
  { key: 'charts', label: 'Charts', hint: 'Tax by regime, the savings waterfall, NPS levels' },
  { key: 'sensitivity', label: 'What-ifs', hint: 'A raise, a bonus, a different basic share, NPS for a target saving' },
  { key: 'computation', label: 'Workings & audit', hint: 'Every step of the calculation and the rule behind it' },
  { key: 'scenarios', label: 'Saved scenarios', hint: 'Keep a version of this plan and compare later' },
  { key: 'reports', label: 'Reports & export', hint: 'CSV and PDF' },
  { key: 'rules', label: 'Tax rules', hint: "The year's slabs and limits, and your own copies" },
];

const AGE_FROM_BAND: Record<string, number | undefined> = { '60to80': 60, Above80: 80 };

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
  /** The earlier Quick estimate's saved figures: a year with no plan yet starts from them. */
  taxProfiles?: TaxProfile[];
  articles?: KnowledgeArticle[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export const TaxPlanner: React.FC<TaxPlannerProps> = ({ people = [], taxProfiles = [], articles, showToast }) => {
  const primaryId = (people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id ?? null;
  const [personId, setPersonId] = useState<number | null>(primaryId);
  const [tab, setTab] = useState<PlannerTab>('summary');
  const [moreOpen, setMoreOpen] = useState(false);
  const [rulesVersion, setRulesVersion] = useState(0);
  const moreRef = useRef<HTMLDivElement>(null);
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
    setInputs(withDefaults(EMPTY_PLANNER_INPUTS, d?.inputs));
    setOptimization(withDefaults(DEFAULT_OPTIMIZATION, d?.optimization));
    setFinancialYear(fy);
  };

  /**
   * A year with no plan but with figures saved in the earlier Quick estimate starts from
   * them: what Fill from my data proposes (its yearly figures and deductions are among
   * those), the salary split into the basic and HRA it recorded with the rest as special
   * allowance, and its age band, metro and regime. Null when there's nothing to bring over.
   */
  const fromQuickEstimate = async (pid: number | null, fy: string, meta: TaxInputMetadata): Promise<TaxPlannerInputs | null> => {
    const profile = taxProfiles.find((p) => p.person_id === pid && p.financial_year === fy);
    if (!profile || pid === null) return null;
    const pre = await apiJson<TaxPrefillResult>(`/api/tax/prefill?financial_year=${encodeURIComponent(fy)}&person_id=${pid}`).catch(() => null);
    const sums = new Map<string, number>();
    pre?.items.filter((i) => i.selected).forEach((i) => sums.set(i.target, (sums.get(i.target) ?? 0) + i.amount));
    const total = Math.round(sums.get('salary_total') ?? 0);
    sums.delete('salary_total');
    let next: TaxPlannerInputs = EMPTY_PLANNER_INPUTS;
    sums.forEach((v, t) => { next = applyTarget(next, meta, t, Math.round(v)); });
    const basic = profile.hra_basic_salary || 0;
    const hra = profile.hra_received || 0;
    const salary: Record<string, number> = basic || hra ? { basic, hra, special_allowance: Math.max(total - basic - hra, 0) } : { basic: total };
    return {
      ...next,
      salary: { ...next.salary, ...salary },
      profile: {
        ...next.profile,
        age: AGE_FROM_BAND[profile.age_band] ?? next.profile.age,
        metro: profile.is_metro_city ? true : null,
        selected_regime: profile.regime === 'Old' ? 'old' : 'new',
      },
    };
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
      } else {
        const migrated = await fromQuickEstimate(primaryId, fy, meta);
        apply(migrated ? { inputs: migrated } : null, fy);
        if (migrated) {
          await putDraft(draftUrl(primaryId, fy), { inputs: migrated, financialYear: fy, optimization: DEFAULT_OPTIMIZATION }).catch(() => undefined);
          showToast?.(`Started FY ${fy} from your Quick estimate figures. Check them under Income and Deductions.`, 'info');
        }
      }
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
    const migrated = saved || !metadata ? null : await fromQuickEstimate(nextPerson, nextFy, metadata);
    setResult(null);
    skipNextSave.current = true;
    if (saved) apply(saved, nextFy);
    else if (migrated) {
      apply({ inputs: migrated }, nextFy);
      skipNextSave.current = false; // keep it as this year's plan straight away
      showToast?.(`Started FY ${nextFy} from your Quick estimate figures. Check them under Income and Deductions.`, 'info');
    } else if (nextPerson === personId) {
      // A new year starts from this year's figures. Month-by-month entries belong to one
      // year, so they're folded into annual totals.
      setInputs(inputs.monthly?.enabled ? { ...annualFromMonths(inputs), monthly: null } : inputs);
      setFinancialYear(nextFy);
      showToast?.(`New plan for FY ${nextFy}, starting from your FY ${financialYear} figures`, 'info');
    } else {
      apply(null, nextFy);
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
  }, [inputs, financialYear, draftReady, rulesVersion]);

  // Before/after payslip for the Summary's employer-NPS suggestion (Pay & TDS fetches its own).
  const summaryPayslip = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, optimization),
    !!financialYear && tab === 'summary' && !isEmptyPlan(inputs));

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [moreOpen]);

  /** Leaving Tax rules: a different rule set may now apply to this year. */
  const goTo = (next: PlannerTab) => {
    if (tab === 'rules' && next !== 'rules') {
      loadRuleSets();
      setRulesVersion((v) => v + 1);
    }
    setTab(next);
    setMoreOpen(false);
  };

  const update = useCallback((path: string, value: unknown) => {
    setInputs((prev) => setIn(prev, path, value));
  }, []);

  const clearPlan = () => {
    // Saved as an empty plan (not deleted), so the year stays cleared: with no plan it
    // would start again from any Quick estimate figures.
    putDraft(draftUrl(personId, financialYear), { inputs: EMPTY_PLANNER_INPUTS, financialYear, optimization: DEFAULT_OPTIMIZATION }).catch(() => undefined);
    setInputs(EMPTY_PLANNER_INPUTS);
    setOptimization(DEFAULT_OPTIMIZATION);
    setTab('summary');
    showToast?.(`Cleared FY ${financialYear}'s figures`, 'info');
  };
  const trySample = () => {
    setInputs(DEFAULT_PLANNER_INPUTS);
    showToast?.('Sample figures loaded: a ₹54 lakh salary. Replace them with yours, or clear them from the top bar.', 'info');
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

  const moreActive = MORE_TABS.find((t) => t.key === tab);
  return (
    <div className="tp-stack">
      <div className="glass-panel tp-bar">
        {people.length > 0 && (
          <label className="tp-pick"><span>Whose tax</span>
            <select id="planner-person" className="form-control" value={personId ?? ''} onChange={(e) => { void switchPlan(Number(e.target.value), financialYear); }}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}
        <label className="tp-pick"><span>Financial year</span>
          <select id="planner-fy" className="form-control" value={financialYear} onChange={(e) => changeYear(e.target.value)}>
            {(years.includes(financialYear) || !financialYear ? years : [financialYear, ...years]).map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
          </select>
        </label>
        {result && (
          <button type="button" className="tp-rules" onClick={() => goTo('rules')} title="See or change the tax rules used for this year">
            {result.rule_set.name ?? result.rule_set.rule_set_id} · v{result.rule_set.version} · {result.rule_set.act}
            {result.rule_set.source === 'user' && <Pill color="#ec4899" title="Your own rule set is selected for this year">Your rules</Pill>}
          </button>
        )}
        {ruleSets.length > 0 && !applying && (
          <Pill color="#f59e0b" title="Select a rule set for this year in Tax rules">No rule set in use for this year</Pill>
        )}
        <span className="tp-bar-actions">
          {computing && <span className="tp-muted" aria-live="polite">Recalculating…</span>}
          <button className="btn btn-primary tp-fill" onClick={() => setShowPrefill(true)} title="Propose figures from your income, investments, insurance, loans and gains">
            <Wand2 size={13} /> Fill from my data
          </button>
          <ConfirmAction label="Clear figures" confirmLabel="Clear" danger question={`Clear every figure in ${people.find((p) => p.id === personId)?.name ?? 'this'}'s FY ${financialYear} plan?`} onConfirm={clearPlan} />
        </span>
      </div>

      {error && <ErrorBanner message={error} />}
      {showPrefill && (
        <PrefillDialog inputs={inputs} metadata={metadata} financialYear={financialYear} personId={personId} onClose={() => setShowPrefill(false)}
          onApply={(next, summary) => { setInputs(next); setShowPrefill(false); showToast?.(summary, 'success'); }} />
      )}

      <div className="cc-views tp-tabs" role="tablist" aria-label="Tax planner sections">
        {MAIN_TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className="cc-view" onClick={() => goTo(t)}>{TAB_LABELS[t]}</button>
        ))}
        <div ref={moreRef} className="tp-more">
          <button type="button" role="tab" aria-selected={!!moreActive} aria-haspopup="menu" aria-expanded={moreOpen} className="cc-view" onClick={() => setMoreOpen(!moreOpen)}>
            {moreActive ? moreActive.label : 'More'} <ChevronDown size={13} />
          </button>
          {moreOpen && (
            <div role="menu" className="topbar-menu tp-more-menu">
              {MORE_TABS.map((t) => (
                <button key={t.key} type="button" role="menuitem" className="topbar-menu-item tp-more-item" onClick={() => goTo(t.key)}>
                  <span>{t.label}</span><small>{t.hint}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {tab === 'summary' && (
        <TaxSummary {...childProps} personId={personId} payslip={summaryPayslip.stale ? null : summaryPayslip.data} articles={articles}
          onGo={goTo} onFill={() => setShowPrefill(true)} onSample={trySample} />
      )}
      {tab === 'income' && <IncomeTab {...childProps} personId={personId} />}
      {tab === 'deductions' && <DeductionsTab {...childProps} />}
      {tab === 'pay' && <PayTab {...childProps} opt={optProps} />}
      {tab === 'save' && <WaysToSaveTab opt={optProps} personId={personId} articles={articles} />}
      {tab === 'charts' && <TaxChartsTab {...optProps} result={result} />}
      {tab === 'sensitivity' && <SensitivityPanel {...optProps} />}
      {tab === 'reports' && <ReportsPanel {...optProps} result={result} />}
      {tab === 'computation' && <ComputationDetails {...childProps} />}
      {tab === 'rules' && <TaxRulesManager showToast={showToast} />}
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
            setInputs(withDefaults(EMPTY_PLANNER_INPUTS, loadedInputs));
            setTab('summary');
          }}
        />
      )}
    </div>
  );
};
