import React, { useEffect, useState } from 'react';
import { formatDate } from '../format';
import { formatINR } from '../format';
import { AmountInput, ConfirmAction, Group, Row } from './settings/ui';
import { InitData, TaxProfile, TaxDeduction, CapitalGainsRealization, TaxEstimate } from '../types';
import { API_BASE_URL } from '../config';
import { TaxDeductionsEditor } from './TaxDeductionsEditor';
import { InfoTooltip } from './InfoTooltip';
import { TaxPlanner } from './tax/TaxPlanner';
import { TaxRulesManager } from './tax/TaxRulesManager';
import { HarvestingPanel } from './tax/HarvestingPanel';

interface TaxationProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const getCurrentFY = (): string => {
  const today = new Date();
  const month = today.getMonth() + 1; // 1-12
  const year = today.getFullYear();
  return month >= 4 ? `${year}-${String(year + 1).slice(2)}` : `${year - 1}-${String(year).slice(2)}`;
};

const emptyProfile = (personId: number): TaxProfile => ({
  id: 0,
  person_id: personId,
  financial_year: getCurrentFY(),
  regime: 'New',
  age_band: 'Below60',
  hra_rent_paid: 0,
  hra_basic_salary: 0,
  hra_received: 0,
  is_metro_city: false,
  home_loan_interest_self_occupied: 0,
  other_income_reported: 0,
  tds_deducted: 0,
  advance_tax_paid: 0,
  notes: '',
});

export const Taxation: React.FC<TaxationProps> = ({ data, onRefresh, showToast }) => {
  const { people = [], tax_profiles = [] } = data;

  const [activeSubTab, setActiveSubTab] = useState<'planner' | 'quick' | 'capital-gains' | 'rules'>('planner');
  // Quick estimate and Capital gains work on one person's year (a saved tax profile).
  const profileTab = activeSubTab === 'quick' || activeSubTab === 'capital-gains';
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>((people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id ?? null);
  const [selectedFY, setSelectedFY] = useState<string>(getCurrentFY());

  const [formData, setFormData] = useState<TaxProfile>(emptyProfile(selectedPersonId || 0));
  const [deductions, setDeductions] = useState<TaxDeduction[]>([]);
  const [saving, setSaving] = useState(false);

  const [estimate, setEstimate] = useState<TaxEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);

  const [realizations, setRealizations] = useState<CapitalGainsRealization[]>([]);

  const selectedProfile = tax_profiles.find(
    (tp) => tp.person_id === selectedPersonId && tp.financial_year === selectedFY
  ) || null;

  useEffect(() => {
    if (selectedProfile) {
      setFormData(selectedProfile);
      fetch(`${API_BASE_URL}/api/tax-profiles/${selectedProfile.id}/deductions`)
        .then((r) => r.json())
        .then(setDeductions)
        .catch(() => setDeductions([]));
    } else {
      setFormData(emptyProfile(selectedPersonId || 0));
      setDeductions([]);
    }
    setEstimate(null);
    setRealizations([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPersonId, selectedFY, tax_profiles.length]);

  const handleSaveProfile = async () => {
    if (!selectedPersonId) return;
    setSaving(true);
    try {
      const payload = { ...formData, person_id: selectedPersonId, financial_year: selectedFY };
      let profileId = selectedProfile?.id;
      if (selectedProfile) {
        await fetch(`${API_BASE_URL}/api/tax-profiles/${selectedProfile.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        const res = await fetch(`${API_BASE_URL}/api/tax-profiles`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const created = await res.json();
        profileId = created.id;
      }

      if (profileId) {
        // Diff-and-sync deductions: PUT existing (has id), POST new (no id), DELETE removed.
        const existing: TaxDeduction[] = selectedProfile
          ? await (await fetch(`${API_BASE_URL}/api/tax-profiles/${profileId}/deductions`)).json()
          : [];
        const originalIds = new Set<number>(existing.map((d) => d.id as number));
        const currentIds = new Set<number>(deductions.filter((d) => d.id).map((d) => d.id as number));
        for (const id of originalIds) {
          if (!currentIds.has(id)) {
            await fetch(`${API_BASE_URL}/api/tax-deductions/${id}`, { method: 'DELETE' });
          }
        }
        for (const d of deductions) {
          if (d.id) {
            await fetch(`${API_BASE_URL}/api/tax-deductions/${d.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d),
            });
          } else {
            await fetch(`${API_BASE_URL}/api/tax-profiles/${profileId}/deductions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(d),
            });
          }
        }
      }

      showToast?.('Saved', 'success');
      onRefresh();
      if (profileId) void loadEstimate(profileId);
    } catch (err) {
      console.error(err);
      showToast?.('Failed to save tax profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfile) return;
    try {
      await fetch(`${API_BASE_URL}/api/tax-profiles/${selectedProfile.id}`, { method: 'DELETE' });
      showToast?.('Deleted', 'success');
      setEstimate(null);
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to delete tax profile', 'error');
    }
  };

  const loadEstimate = async (profileId = selectedProfile?.id) => {
    if (!profileId) return;
    setLoadingEstimate(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/tax-profiles/${profileId}/estimate`);
      const json = await res.json();
      if (!res.ok) {
        // e.g. no tax rule set exists for the profile's financial year
        setEstimate(null);
        setEstimateError(json?.detail ?? 'Failed to compute estimate');
        return;
      }
      setEstimate(json);
      setEstimateError(null);
    } catch (err) {
      console.error(err);
      showToast?.('Failed to compute estimate', 'error');
    } finally {
      setLoadingEstimate(false);
    }
  };

  const loadRealizations = async () => {
    if (!selectedProfile) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/tax-profiles/${selectedProfile.id}/capital-gains-realizations`);
      const json = await res.json();
      setRealizations(json);
    } catch (err) {
      console.error(err);
      setRealizations([]);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'quick') loadEstimate();
    if (activeSubTab === 'capital-gains') loadRealizations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSubTab, selectedProfile?.id]);

  const fyOptions = (() => {
    const current = getCurrentFY();
    const [startYear] = current.split('-').map((s) => parseInt(s));
    const options = [];
    for (let y = startYear - 2; y <= startYear + 1; y++) {
      options.push(`${y}-${String(y + 1).slice(2)}`);
    }
    return options;
  })();

  const money = (key: keyof TaxProfile, label: string, description?: string) => (
    <Row label={label} description={description} htmlFor={`tax-${String(key)}`}>
      <AmountInput id={`tax-${String(key)}`} label={label} prefix="₹" width={130} value={Number(formData[key]) || 0}
        onChange={(v) => setFormData({ ...formData, [key]: v })} />
    </Row>
  );
  const TABS: { id: typeof activeSubTab; label: string }[] = [
    { id: 'planner', label: 'Planner' }, { id: 'quick', label: 'Quick estimate' },
    { id: 'capital-gains', label: 'Capital gains' }, { id: 'rules', label: 'Tax rules' },
  ];
  const regimeRows: [string, keyof TaxEstimate['old_regime']][] = [
    ['Tax on income', 'gross_tax'], ['Rebate (87A)', 'rebate_87a'], ['Surcharge', 'surcharge'], ['Health and education cess', 'cess'],
  ];

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Taxation</h1>
          <p className="page-subtitle">Plan your income tax: old vs new regime, deductions, NPS, advance tax and capital gains.</p>
        </div>
        {profileTab && people.length > 0 && (
          <span className="tx-pickers">
            <select className="form-control" aria-label="Person" value={selectedPersonId ?? ''} onChange={(e) => setSelectedPersonId(e.target.value ? parseInt(e.target.value) : null)}>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <select className="form-control" aria-label="Financial year" value={selectedFY} onChange={(e) => setSelectedFY(e.target.value)}>
              {fyOptions.map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
            </select>
          </span>
        )}
      </div>

      <div role="tablist" aria-label="Tax views" className="cc-views">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={activeSubTab === t.id} className="cc-view" onClick={() => setActiveSubTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {activeSubTab === 'planner' && <TaxPlanner people={data.people} showToast={showToast} onOpenRules={() => setActiveSubTab('rules')} />}
      {activeSubTab === 'rules' && <TaxRulesManager showToast={showToast} />}

      {!profileTab ? null : people.length === 0 ? (
        <div className="settings-group"><div className="ie-empty"><p>Add a person in Settings › People first.</p></div></div>
      ) : activeSubTab === 'quick' ? (
        <div className="tx-quick">
          <p className="cc-note" style={{ margin: 0 }}>
            A fast old-vs-new check from a few yearly figures; income comes from this person's entries in Income &amp; Expenses.
            For salary structure, NPS, payslips and month-by-month TDS, use the <button type="button" className="db-link" onClick={() => setActiveSubTab('planner')}>Planner</button>.
          </p>
          <div className="lp-grid">
            <div className="tx-col">
              <Group title="About you">
                <Row label="Regime you're on" htmlFor="tax-regime">
                  <select id="tax-regime" className="form-control" value={formData.regime} onChange={(e) => setFormData({ ...formData, regime: e.target.value as 'Old' | 'New' })}>
                    <option value="New">New</option><option value="Old">Old</option>
                  </select>
                </Row>
                <Row label="Age" htmlFor="tax-age-band">
                  <select id="tax-age-band" className="form-control" value={formData.age_band} onChange={(e) => setFormData({ ...formData, age_band: e.target.value as TaxProfile['age_band'] })}>
                    <option value="Below60">Below 60</option><option value="60to80">60 to 80</option><option value="Above80">80 or over</option>
                  </select>
                </Row>
                <Row label="Live in a metro" description="Delhi, Mumbai, Kolkata, Chennai and others; affects HRA." htmlFor="tax-metro-city">
                  <select id="tax-metro-city" className="form-control" value={formData.is_metro_city ? 'yes' : 'no'} onChange={(e) => setFormData({ ...formData, is_metro_city: e.target.value === 'yes' })}>
                    <option value="no">No</option><option value="yes">Yes</option>
                  </select>
                </Row>
              </Group>
              <Group title="Rent (HRA)" description="Yearly figures, old regime only.">
                {money('hra_basic_salary', 'Basic salary')}
                {money('hra_received', 'HRA received')}
                {money('hra_rent_paid', 'Rent paid')}
              </Group>
              <Group title="Other figures" description="For the whole year.">
                {money('home_loan_interest_self_occupied', 'Home loan interest', 'Self-occupied home, old regime.')}
                {money('other_income_reported', 'Other taxable income', 'Anything not in Income & Expenses.')}
                {money('tds_deducted', 'TDS deducted')}
                {money('advance_tax_paid', 'Advance tax paid')}
              </Group>
              <div className="tx-deductions"><TaxDeductionsEditor deductions={deductions} onChange={setDeductions} /></div>
              <div className="tx-actions">
                <button className="btn btn-primary" onClick={handleSaveProfile} disabled={saving}>{saving ? 'Working it out…' : 'Save and estimate'}</button>
                {selectedProfile && <ConfirmAction label="Delete these figures" confirmLabel="Delete" danger question={`Delete ${selectedFY}'s figures?`} onConfirm={handleDeleteProfile} />}
              </div>
            </div>

            <div className="tx-col">
              {!selectedProfile && !estimate ? (
                <div className="settings-group"><div className="ie-empty"><p>Fill in what applies and press "Save and estimate" to compare the two regimes.</p></div></div>
              ) : loadingEstimate && !estimate ? <p className="cc-note">Working it out…</p>
                : !estimate ? <div className="settings-group"><div className="ie-empty"><p>{estimateError ?? 'No estimate yet.'}</p></div></div> : (
                <>
                  <section className="glass-panel db-card">
                    <div className="db-card-head">
                      <h3>Better for you: {estimate.recommended_regime === 'Old' ? 'the old regime' : 'the new regime'} <InfoTooltip articles={data.knowledge_articles} slug="old-vs-new-tax-regime" /></h3>
                      {loadingEstimate && <span className="cc-note">Updating…</span>}
                    </div>
                    <strong className="eg-figure">{formatINR(estimate.savings_with_recommended)} <span>less tax than the other</span></strong>
                    <table className="cf-compare">
                      <thead><tr><th /><th>Old regime</th><th>New regime</th></tr></thead>
                      <tbody>
                        <tr><th scope="row">Taxable income</th><td>{formatINR(estimate.taxable_income_old)}</td><td>{formatINR(estimate.taxable_income_new)}</td></tr>
                        {regimeRows.map(([label, key]) => (
                          <tr key={key}><th scope="row">{label}</th><td>{formatINR(Number(estimate.old_regime[key]))}</td><td>{formatINR(Number(estimate.new_regime[key]))}</td></tr>
                        ))}
                        <tr className="cf-compare-total"><th scope="row">Total tax</th>
                          <td style={estimate.recommended_regime === 'Old' ? { color: 'var(--success)' } : undefined}>{formatINR(estimate.old_regime.total_tax)}</td>
                          <td style={estimate.recommended_regime === 'New' ? { color: 'var(--success)' } : undefined}>{formatINR(estimate.new_regime.total_tax)}</td></tr>
                      </tbody>
                    </table>
                  </section>
                  <section className="glass-panel db-card">
                    <div className="db-card-head"><h3>How it was worked out</h3></div>
                    <ul className="db-facts">
                      <li>Income {formatINR(estimate.gross_income)}; standard deduction {formatINR(estimate.standard_deduction)}.</li>
                      <li>Old regime only: HRA {formatINR(estimate.hra_exemption)}, 80C {formatINR(estimate.total_80c_deductions)}, 80D {formatINR(estimate.total_80d_deductions)}, other {formatINR(estimate.other_deductions)} (all after limits).</li>
                      {(estimate.capital_gains.stcg || estimate.capital_gains.ltcg) ? (
                        <li>Unrealised gains if sold today: short-term {formatINR(estimate.capital_gains.stcg)}, long-term {formatINR(estimate.capital_gains.ltcg)}, tax about {formatINR(estimate.capital_gains.tax)} <InfoTooltip articles={data.knowledge_articles} slug="ltcg-vs-stcg" />.</li>
                      ) : null}
                      <li>With gains, about <strong>{formatINR(estimate.estimated_total_tax)}</strong> in all; {formatINR(estimate.prepaid_taxes)} already paid (TDS and advance tax), so{' '}
                        <strong style={{ color: estimate.estimated_refund_or_due >= 0 ? 'var(--success)' : '#fca5a5' }}>
                          {estimate.estimated_refund_or_due >= 0 ? `about ${formatINR(estimate.estimated_refund_or_due)} back` : `about ${formatINR(-estimate.estimated_refund_or_due)} still to pay`}
                        </strong>.</li>
                      {(estimate.warnings || []).filter((w) => w.code === 'profile_mapping').map((w) => (
                        <li key={w.message} className="cc-note">{w.message}</li>
                      ))}
                    </ul>
                  </section>
                </>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="db-col">
          <HarvestingPanel personId={selectedPersonId} financialYear={selectedFY} />
          <section aria-label="Gains realised this year">
            <div className="settings-group-head"><h3 className="settings-group-title">Gains realised in FY {selectedFY}</h3></div>
            <div className="settings-group">
              {!selectedProfile ? (
                <div className="ie-empty"><p>Save figures for this person and year under Quick estimate to see realised gains here.</p></div>
              ) : realizations.length === 0 ? (
                <div className="ie-empty"><p>No sales yet. A sale shows up here when you record a "Sell or redeem an asset" transaction for a stock, fund or property this person owns.</p></div>
              ) : realizations.map((r) => (
                <div key={r.id} className="ie-row fc-row">
                  <span className="ie-row-text">
                    <strong>{r.asset_name || `Asset ${r.asset_id}`}</strong>
                    <span>{[formatDate(r.sale_date), `sold for ${formatINR(r.sale_value)}`, `cost ${formatINR(r.cost_basis)}`, r.gain_type === 'LTCG' ? 'long-term' : 'short-term'].join(' · ')}</span>
                  </span>
                  <span className="ie-row-amount"><strong style={{ color: r.gain_amount >= 0 ? 'var(--success)' : '#fca5a5' }}>{r.gain_amount >= 0 ? '+' : '−'}{formatINR(Math.abs(r.gain_amount))}</strong></span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      <p className="cc-note tx-disclaimer">Estimates to help you decide, not tax advice. Each result names the rule set it used and how well each rule is verified; check against the current Act before filing.</p>
    </div>
  );
};
