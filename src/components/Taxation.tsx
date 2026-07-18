import React, { useEffect, useState } from 'react';
import { Plus, Trash2, AlertTriangle } from 'lucide-react';
import { InitData, TaxProfile, TaxDeduction, CapitalGainsRealization, TaxEstimate } from '../types';
import { API_BASE_URL } from '../config';
import { TaxDeductionsEditor } from './TaxDeductionsEditor';
import { InfoTooltip } from './InfoTooltip';

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

  const [activeSubTab, setActiveSubTab] = useState<'profile' | 'estimate' | 'capital-gains'>('profile');
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(people[0]?.id ?? null);
  const [selectedFY, setSelectedFY] = useState<string>(getCurrentFY());

  const [formData, setFormData] = useState<TaxProfile>(emptyProfile(selectedPersonId || 0));
  const [deductions, setDeductions] = useState<TaxDeduction[]>([]);
  const [saving, setSaving] = useState(false);

  const [estimate, setEstimate] = useState<TaxEstimate | null>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);

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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value || 0);
  };

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

      showToast?.('Tax profile saved', 'success');
      onRefresh();
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
      showToast?.('Tax profile deleted', 'success');
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to delete tax profile', 'error');
    }
  };

  const loadEstimate = async () => {
    if (!selectedProfile) return;
    setLoadingEstimate(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/tax-profiles/${selectedProfile.id}/estimate`);
      const json = await res.json();
      setEstimate(json);
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
    if (activeSubTab === 'estimate') loadEstimate();
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

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="page-title">Taxation</h1>
          <p className="page-subtitle">Estimated tax position by person and financial year — regime comparison, deductions, capital gains.</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <select
            className="form-control"
            style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
            value={selectedPersonId ?? ''}
            onChange={(e) => setSelectedPersonId(e.target.value ? parseInt(e.target.value) : null)}
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ padding: '6px 12px', fontSize: '12px', height: '32px' }}
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
          >
            {fyOptions.map((fy) => (
              <option key={fy} value={fy}>FY {fy}</option>
            ))}
          </select>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          Add a person in Settings before creating a tax profile.
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '10px 14px', marginBottom: '20px',
            background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '10px',
            fontSize: '11.5px', color: 'var(--text-secondary)', lineHeight: 1.5,
          }}>
            <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '1px' }} />
            <span>Estimate only, based on best-effort modeling of recent Indian tax law. Not tax advice — verify against the current Finance Act before filing.</span>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '24px', gap: '8px' }}>
            {(['profile', 'estimate', 'capital-gains'] as const).map((tab) => (
              <button
                key={tab}
                className={`tab-btn ${activeSubTab === tab ? 'active' : ''}`}
                onClick={() => setActiveSubTab(tab)}
                style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === tab ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === tab ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
              >
                {tab === 'profile' ? 'Profile & Deductions' : tab === 'estimate' ? 'Old vs New Estimate' : 'Capital Gains'}
              </button>
            ))}
          </div>

          {activeSubTab === 'profile' && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="tax-regime" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Regime</label>
                  <select id="tax-regime" className="form-control" value={formData.regime} onChange={(e) => setFormData({ ...formData, regime: e.target.value as 'Old' | 'New' })}>
                    <option value="New">New</option>
                    <option value="Old">Old</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="tax-age-band" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Age Band</label>
                  <select id="tax-age-band" className="form-control" value={formData.age_band} onChange={(e) => setFormData({ ...formData, age_band: e.target.value as TaxProfile['age_band'] })}>
                    <option value="Below60">Below 60</option>
                    <option value="60to80">60 to 80</option>
                    <option value="Above80">Above 80</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label htmlFor="tax-metro-city" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Metro City</label>
                  <select id="tax-metro-city" className="form-control" value={formData.is_metro_city ? 'yes' : 'no'} onChange={(e) => setFormData({ ...formData, is_metro_city: e.target.value === 'yes' })}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '10px' }}>HRA Exemption Inputs</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-hra-basic-salary" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Annual Basic Salary</label>
                    <input id="tax-hra-basic-salary" type="number" className="form-control" value={formData.hra_basic_salary} onChange={(e) => setFormData({ ...formData, hra_basic_salary: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-hra-received" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Annual HRA Received</label>
                    <input id="tax-hra-received" type="number" className="form-control" value={formData.hra_received} onChange={(e) => setFormData({ ...formData, hra_received: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-hra-rent-paid" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Annual Rent Paid</label>
                    <input id="tax-hra-rent-paid" type="number" className="form-control" value={formData.hra_rent_paid} onChange={(e) => setFormData({ ...formData, hra_rent_paid: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', marginBottom: '10px' }}>Other Inputs</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-home-loan-interest" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Home Loan Interest (Self-Occupied)</label>
                    <input id="tax-home-loan-interest" type="number" className="form-control" value={formData.home_loan_interest_self_occupied} onChange={(e) => setFormData({ ...formData, home_loan_interest_self_occupied: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-other-income" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Other Taxable Income</label>
                    <input id="tax-other-income" type="number" className="form-control" value={formData.other_income_reported} onChange={(e) => setFormData({ ...formData, other_income_reported: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-tds-deducted" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>TDS Deducted</label>
                    <input id="tax-tds-deducted" type="number" className="form-control" value={formData.tds_deducted} onChange={(e) => setFormData({ ...formData, tds_deducted: parseFloat(e.target.value) || 0 })} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label htmlFor="tax-advance-tax-paid" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Advance Tax Paid</label>
                    <input id="tax-advance-tax-paid" type="number" className="form-control" value={formData.advance_tax_paid} onChange={(e) => setFormData({ ...formData, advance_tax_paid: parseFloat(e.target.value) || 0 })} />
                  </div>
                </div>
              </div>

              <TaxDeductionsEditor deductions={deductions} onChange={setDeductions} />

              <div style={{ display: 'flex', gap: '10px', borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
                <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }} onClick={handleSaveProfile} disabled={saving}>
                  <Plus size={14} /> {saving ? 'Saving...' : selectedProfile ? 'Update Profile' : 'Create Profile'}
                </button>
                {selectedProfile && (
                  <button className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', color: '#ef4444' }} onClick={handleDeleteProfile}>
                    <Trash2 size={14} /> Delete Profile
                  </button>
                )}
              </div>
            </div>
          )}

          {activeSubTab === 'estimate' && (
            <div>
              {!selectedProfile ? (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  Create a tax profile in the "Profile &amp; Deductions" tab first.
                </div>
              ) : loadingEstimate || !estimate ? (
                <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  {loadingEstimate ? 'Computing estimate...' : 'No estimate loaded yet.'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{
                    padding: '16px 20px', borderRadius: '12px',
                    background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
                  }}>
                    <div>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        Recommended Regime
                        <InfoTooltip articles={data.knowledge_articles} slug="old-vs-new-tax-regime" />
                      </span>
                      <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: '#10b981' }}>{estimate.recommended_regime} Regime</h2>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Savings vs. the other regime</span>
                      <h3 style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 0 0', color: '#f8fafc' }}>{formatCurrency(estimate.savings_with_recommended)}</h3>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
                    {(['old_regime', 'new_regime'] as const).map((key) => {
                      const r = estimate[key];
                      const label = key === 'old_regime' ? 'Old Regime' : 'New Regime';
                      const isRecommended = estimate.recommended_regime === (key === 'old_regime' ? 'Old' : 'New');
                      return (
                        <div key={key} className="glass-card" style={{ padding: '18px', border: isRecommended ? '1px solid rgba(16,185,129,0.4)' : undefined }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>{label}</span>
                            {isRecommended && <span className="badge badge-green" style={{ fontSize: '10px' }}>Recommended</span>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <span>Gross Tax: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(r.gross_tax)}</strong></span>
                            <span>Section 87A Rebate: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(r.rebate_87a)}</strong></span>
                            <span>Cess (4%): <strong style={{ color: '#e2e8f0' }}>{formatCurrency(r.cess)}</strong></span>
                            <span style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '6px', marginTop: '2px' }}>
                              Total Tax: <strong style={{ color: '#f8fafc', fontSize: '14px' }}>{formatCurrency(r.total_tax)}</strong>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="glass-panel" style={{ padding: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '14px' }}>Computation Breakdown</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>Gross Income: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.gross_income)}</strong></span>
                      <span>Standard Deduction: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.standard_deduction)}</strong></span>
                      <span>80C Deductions (capped): <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.total_80c_deductions)}</strong></span>
                      <span>80D Deductions (capped): <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.total_80d_deductions)}</strong></span>
                      <span>Other Deductions: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.other_deductions)}</strong></span>
                      <span>HRA Exemption: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.hra_exemption)}</strong></span>
                      <span>Taxable Income (Old): <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.taxable_income_old)}</strong></span>
                      <span>Taxable Income (New): <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.taxable_income_new)}</strong></span>
                    </div>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: '18px 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Capital Gains (Unrealized Estimate)
                      <InfoTooltip articles={data.knowledge_articles} slug="ltcg-vs-stcg" />
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                      <span>STCG: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.capital_gains.stcg)}</strong></span>
                      <span>LTCG: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.capital_gains.ltcg)}</strong></span>
                      <span>Capital Gains Tax: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(estimate.capital_gains.tax)}</strong></span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px', marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-glass)', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px' }}>Estimated Total Tax (incl. CG): <strong style={{ color: '#f8fafc' }}>{formatCurrency(estimate.estimated_total_tax)}</strong></span>
                      <span style={{ fontSize: '13px' }}>Prepaid (TDS + Advance): <strong style={{ color: '#f8fafc' }}>{formatCurrency(estimate.prepaid_taxes)}</strong></span>
                      <span style={{ fontSize: '13px' }}>
                        {estimate.estimated_refund_or_due >= 0 ? 'Estimated Refund' : 'Estimated Amount Due'}:{' '}
                        <strong style={{ color: estimate.estimated_refund_or_due >= 0 ? '#10b981' : '#ef4444' }}>
                          {formatCurrency(Math.abs(estimate.estimated_refund_or_due))}
                        </strong>
                      </span>
                    </div>
                  </div>

                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{estimate.disclaimer}</div>
                </div>
              )}
            </div>
          )}

          {activeSubTab === 'capital-gains' && (
            <div className="glass-panel" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '14px' }}>Realized Capital Gains ({selectedFY})</h3>
              {!selectedProfile ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Create a tax profile first to view realized gains for this person/year.</div>
              ) : realizations.length === 0 ? (
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  No realized sales recorded yet. A row appears here automatically when a "Sell" transaction is posted against a Stock, Mutual Fund, or Property asset owned by this person.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-glass)' }}>
                        <th style={{ padding: '8px' }}>Asset</th>
                        <th style={{ padding: '8px' }}>Sale Date</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Sale Value</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Cost Basis</th>
                        <th style={{ padding: '8px', textAlign: 'right' }}>Gain</th>
                        <th style={{ padding: '8px' }}>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {realizations.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.02)' }}>
                          <td style={{ padding: '8px', color: '#e2e8f0' }}>{r.asset_name || r.asset_id}</td>
                          <td style={{ padding: '8px', color: 'var(--text-secondary)' }}>{r.sale_date}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#e2e8f0' }}>{formatCurrency(r.sale_value)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: '#e2e8f0' }}>{formatCurrency(r.cost_basis)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', color: r.gain_amount >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(r.gain_amount)}</td>
                          <td style={{ padding: '8px' }}>
                            <span className={`badge ${r.gain_type === 'LTCG' ? 'badge-green' : 'badge-yellow'}`} style={{ fontSize: '10px' }}>{r.gain_type}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
