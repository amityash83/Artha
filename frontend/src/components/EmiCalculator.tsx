import React, { useState, useEffect } from 'react';
import { formatDate } from '../format';
import { AmountInput, ConfirmAction, Group, Row } from './settings/ui';
import { API_BASE_URL } from '../config';
interface Prepayment {
  date: string;
  amount: number;
}

interface EmiResult {
  monthly_emi: number;
  total_principal: number;
  total_interest: number;
  total_prepayments: number;
  total_payment: number;
  tenure_months: number;
  schedule: Array<{
    month: number;
    date: string;
    beginning_balance: number;
    emi: number;
    interest: number;
    principal: number;
    prepayments: number;
    ending_balance: number;
  }>;
}

interface EmiCalculatorProps {
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Shown inside the Loan planner, which supplies the page title. */
  embedded?: boolean;
  /** The user's own loans, offered as a starting point. */
  loans?: any[];
}

export const EmiCalculator: React.FC<EmiCalculatorProps> = ({ showToast, embedded, loans = [] }) => {
  // Inputs state
  const [loanAmount, setLoanAmount] = useState<number>(5000000); // 50 Lakhs default
  const [roi, setRoi] = useState<number>(8.5); // 8.5% default
  const [tenureValue, setTenureValue] = useState<number>(20); // default tenure value
  const [tenureUnit, setTenureUnit] = useState<'years' | 'months'>('years'); // default unit
  const [startDate, setStartDate] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  });

  // Prepayment additions
  const [prepayments, setPrepayments] = useState<Prepayment[]>([]);
  const [newPrepayDate, setNewPrepayDate] = useState<string>('');
  const [newPrepayAmount, setNewPrepayAmount] = useState<number>(100000);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  // Saved profiles state
  const [savedProfiles, setSavedProfiles] = useState<any[]>([]);
  const [profileName, setProfileName] = useState<string>('');
  const [activeProfileId, setActiveProfileId] = useState<number | null>(null);

  // Load profiles on mount
  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/emi-profiles`);
      if (res.ok) {
        const d = await res.json();
        setSavedProfiles(d);
      }
    } catch (err) {
      console.error("Error loading profiles:", err);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/emi-profiles`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: profileName,
          loan_amount: loanAmount,
          roi: roi,
          tenure_value: tenureValue,
          tenure_unit: tenureUnit,
          start_date: startDate,
          prepayments: prepayments
        })
      });

      if (res.ok) {
        if (showToast) showToast("Profile saved successfully!", "success");
        else alert("Profile saved successfully!");
        fetchProfiles();
        const refreshedRes = await fetch(`${API_BASE_URL}/api/settings/emi-profiles`);
        if (refreshedRes.ok) {
          const updatedProfiles = await refreshedRes.json();
          setSavedProfiles(updatedProfiles);
          const matched = updatedProfiles.find((p: any) => p.name === profileName);
          if (matched) {
            setActiveProfileId(matched.id);
          }
        }
      } else {
        if (showToast) showToast("Failed to save profile", "error");
        else alert("Failed to save profile");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error saving profile", "error");
      else alert("Error saving profile");
    }
  };

  const handleLoadProfile = (id: number) => {
    if (!id) {
      setActiveProfileId(null);
      setProfileName('');
      return;
    }

    const p = savedProfiles.find(p => p.id === id);
    if (p) {
      setLoanAmount(p.loan_amount);
      setRoi(p.roi);
      setTenureValue(p.tenure_value);
      setTenureUnit(p.tenure_unit);
      setStartDate(p.start_date);
      setPrepayments(p.prepayments);
      setActiveProfileId(p.id);
      setProfileName(p.name);
    }
  };

  /** Fill the calculator from one of the user's loans: what's owed now, its rate, the months left. */
  const startFromLoan = (id: number) => {
    const loan = loans.find((l) => l.id === id);
    if (!loan) return;
    const left = loan.remaining_tenure > 0 ? Math.round(loan.remaining_tenure) : loan.tenure_months || 120;
    setLoanAmount(Math.round(loan.outstanding));
    setRoi(loan.interest_rate || 0);
    if (left % 12 === 0) { setTenureUnit('years'); setTenureValue(left / 12); } else { setTenureUnit('months'); setTenureValue(left); }
    setStartDate(new Date().toISOString().split('T')[0]);
    setPrepayments([]);
    setActiveProfileId(null);
    setProfileName(loan.name);
  };

  const handleDeleteProfile = async () => {
    if (!activeProfileId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/emi-profiles/${activeProfileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setActiveProfileId(null);
        setProfileName('');
        fetchProfiles();
        if (showToast) showToast("Profile deleted successfully!", "success");
      } else {
        if (showToast) showToast("Failed to delete profile", "error");
        else alert("Failed to delete profile");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error deleting profile", "error");
      else alert("Error deleting profile");
    }
  };

  // Result state
  const [baseline, setBaseline] = useState<EmiResult | null>(null);
  const [optimized, setOptimized] = useState<EmiResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  
  // Collapse state for full table schedule
  const [showFullSchedule, setShowFullSchedule] = useState<boolean>(false);

  // Set default prepayment date to current start date plus 6 months
  useEffect(() => {
    if (startDate) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + 6);
      setNewPrepayDate(d.toISOString().split('T')[0]);
    }
  }, [startDate]);

  // Recalculate both baseline and optimized emi schedules when inputs change
  useEffect(() => {
    calculateEmi();
  }, [loanAmount, roi, tenureValue, tenureUnit, startDate, prepayments]);

  const calculateEmi = async () => {
    setLoading(true);
    const tenureMonths = tenureUnit === 'years' ? tenureValue * 12 : tenureValue;

    try {
      // 1. Fetch baseline (no prepayments)
      const resBaseline = await fetch(`${API_BASE_URL}/api/calculations/advanced-emi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: loanAmount,
          roi: roi,
          tenure_months: tenureMonths,
          start_date: startDate,
          prepayments: []
        })
      });

      // 2. Fetch optimized (with prepayments)
      const resOptimized = await fetch(`${API_BASE_URL}/api/calculations/advanced-emi`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: loanAmount,
          roi: roi,
          tenure_months: tenureMonths,
          start_date: startDate,
          prepayments: prepayments
        })
      });

      if (resBaseline.ok && resOptimized.ok) {
        const dBaseline = await resBaseline.json();
        const dOptimized = await resOptimized.json();
        setBaseline(dBaseline);
        setOptimized(dOptimized);
      }
    } catch (err) {
      console.error("Error calculating EMI schedules:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrepayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPrepayAmount <= 0 || !newPrepayDate) return;

    const newPrepay: Prepayment = {
      date: newPrepayDate,
      amount: newPrepayAmount
    };

    setPrepayments(prev => {
      let updated;
      if (editingIdx !== null) {
        updated = prev.map((item, idx) => idx === editingIdx ? newPrepay : item);
        setEditingIdx(null);
      } else {
        updated = [...prev, newPrepay];
      }
      // Sort prepayments by date
      updated.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return updated;
    });

    // Reset default amount
    setNewPrepayAmount(100000);
  };

  const handleEditPrepayment = (index: number) => {
    const p = prepayments[index];
    setNewPrepayDate(p.date);
    setNewPrepayAmount(p.amount);
    setEditingIdx(index);
  };

  const handleCancelEdit = () => {
    setEditingIdx(null);
    setNewPrepayAmount(100000);
    if (startDate) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + 6);
      setNewPrepayDate(d.toISOString().split('T')[0]);
    }
  };

  const handleRemovePrepayment = (index: number) => {
    if (editingIdx === index) {
      setEditingIdx(null);
      setNewPrepayAmount(100000);
    }
    setPrepayments(prev => prev.filter((_, i) => i !== index));
  };

  // Helper values
  const interestSaved = baseline && optimized ? Math.max(baseline.total_interest - optimized.total_interest, 0) : 0;
  const tenureSavedMonths = baseline && optimized ? Math.max(baseline.tenure_months - optimized.tenure_months, 0) : 0;
  
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatTenure = (months: number) => {
    const yrs = Math.floor(months / 12);
    const mths = Math.round(months % 12);
    let str = '';
    if (yrs > 0) str += `${yrs} Yr${yrs > 1 ? 's' : ''}`;
    if (mths > 0) str += `${str ? ' ' : ''}${mths} Mo${mths > 1 ? 's' : ''}`;
    return str || '0 Months';
  };

  const handleExportExcel = async () => {
    const tenureMonths = tenureUnit === 'years' ? tenureValue * 12 : tenureValue;
    try {
      const res = await fetch(`${API_BASE_URL}/api/calculations/advanced-emi/export/excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          loan_amount: loanAmount,
          roi: roi,
          tenure_months: tenureMonths,
          start_date: startDate,
          prepayments: prepayments
        })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `emi_amortization_schedule_${profileName || 'calculator'}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      } else {
        if (showToast) showToast("Failed to export Excel sheet", "error");
        else alert("Failed to export Excel sheet");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Network error during Excel export", "error");
      else alert("Network error during Excel export");
    }
  };

  const handleExportCSV = () => {
    if (!optimized) return;
    let csvContent = "Month,Payment Date,Beginning Balance,EMI,Interest Paid,Principal Paid,Prepayment,Ending Balance\n";
    optimized.schedule.forEach(row => {
      csvContent += `${row.month},${row.date},${row.beginning_balance},${row.emi},${row.interest},${row.principal},${row.prepayments},${row.ending_balance}\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `emi_schedule_${profileName || 'calculator'}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleExportPDF = () => {
    if (!optimized) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      if (showToast) showToast("Please allow popups to export PDF.", "info");
      else alert("Please allow popups to export PDF.");
      return;
    }
    
    const scheduleRows = optimized.schedule.map(row => `
      <tr>
        <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${row.month}</td>
        <td style="text-align: center; padding: 8px; border: 1px solid #ddd;">${row.date}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd;">${formatCurrency(row.beginning_balance)}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd;">${formatCurrency(row.emi)}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd; color: #d9534f;">${formatCurrency(row.interest)}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd; color: #5cb85c;">${formatCurrency(row.principal)}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd; color: #f0ad4e;">${row.prepayments > 0 ? formatCurrency(row.prepayments) : '—'}</td>
        <td style="text-align: right; padding: 8px; border: 1px solid #ddd; font-weight: bold;">${formatCurrency(row.ending_balance)}</td>
      </tr>
    `).join('');

    const prepaymentsSummary = prepayments.map(p => `
      <li style="margin-bottom: 4px;"><strong>${formatCurrency(p.amount)}</strong> on ${p.date}</li>
    `).join('') || 'None';

    const html = `
      <html>
        <head>
          <title>Artha - Loan repayment schedule</title>
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 40px; }
            h1 { color: #8B5CF6; margin-bottom: 5px; }
            h2 { border-bottom: 2px solid #8B5CF6; padding-bottom: 5px; margin-top: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 15px; }
            th { background-color: #8B5CF6; color: white; padding: 10px; border: 1px solid #ddd; text-align: center; }
            .meta-container { display: flex; justify-content: space-between; margin-bottom: 20px; background-color: #f9f9f9; padding: 15px; border-radius: 4px; border: 1px solid #eee; }
            .meta-col { width: 48%; }
            .summary-box { background-color: #f4fcf7; border: 1px solid #d4eed8; padding: 15px; border-radius: 4px; color: #2b542c; margin-top: 20px; }
          </style>
        </head>
        <body>
          <h1>Loan repayment schedule</h1>
          <p style="color: #666; margin-top: 0;">From Artha, ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
          
          <div class="meta-container">
            <div class="meta-col">
              <p><strong>Profile Name:</strong> ${profileName || 'Custom Calculator'}</p>
              <p><strong>Loan Amount:</strong> ${formatCurrency(loanAmount)}</p>
              <p><strong>Interest Rate:</strong> ${roi}%</p>
              <p><strong>Original Tenure:</strong> ${formatTenure(tenureUnit === 'years' ? tenureValue * 12 : tenureValue)}</p>
              <p><strong>Start Date:</strong> ${startDate}</p>
            </div>
            <div class="meta-col">
              <p><strong>Monthly EMI:</strong> ${formatCurrency(optimized.monthly_emi)}</p>
              <p><strong>Actual Closure Tenure:</strong> ${formatTenure(optimized.tenure_months)}</p>
              <p><strong>Total Interest Payable:</strong> ${formatCurrency(optimized.total_interest)}</p>
              <p><strong>Total Prepayments:</strong> ${formatCurrency(optimized.total_prepayments)}</p>
            </div>
          </div>

          ${interestSaved > 0 ? `
            <div class="summary-box">
              <strong>Total Savings Accrued:</strong> Saved ${formatCurrency(interestSaved)} in interest and debt-free ${formatTenure(tenureSavedMonths)} early!
            </div>
          ` : ''}

          <h2>Scheduled Prepayments</h2>
          <ul>${prepaymentsSummary}</ul>

          <h2>Amortization Schedule</h2>
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Payment Date</th>
                <th>Beginning Balance</th>
                <th>EMI</th>
                <th>Interest</th>
                <th>Principal</th>
                <th>Prepayment</th>
                <th>Ending Balance</th>
              </tr>
            </thead>
            <tbody>
              ${scheduleRows}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const tenureMonths = tenureUnit === 'years' ? tenureValue * 12 : tenureValue;
  const rows = optimized?.schedule ?? [];
  const shown = showFullSchedule ? rows : rows.slice(0, 12);

  return (
    <div className="lp-page" style={embedded ? undefined : { paddingBottom: '40px' }}>
      {!embedded && (
        <div className="page-header">
          <h1 className="page-title">EMI Tool</h1>
          <p className="page-subtitle">Work out a loan's EMI, and how much interest prepayments save.</p>
        </div>
      )}

      <div className="lp-bar">
        {loans.length > 0 && (
          <label className="lp-bar-field">
            <span>Start from</span>
            <select className="form-control" value="" onChange={(e) => startFromLoan(Number(e.target.value))}>
              <option value="">One of my loans…</option>
              {loans.map((l) => <option key={l.id} value={l.id}>{l.name} ({formatCurrency(l.outstanding)})</option>)}
            </select>
          </label>
        )}
        <label className="lp-bar-field">
          <span>Saved</span>
          <select className="form-control" value={activeProfileId || ''} onChange={(e) => handleLoadProfile(Number(e.target.value))}>
            <option value="">{savedProfiles.length ? 'Open a saved calculation…' : 'None saved yet'}</option>
            {savedProfiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        {activeProfileId && <ConfirmAction label="Delete" confirmLabel="Delete" danger question={`Delete "${profileName}"?`} onConfirm={handleDeleteProfile} />}
        <form onSubmit={handleSaveProfile} className="lp-bar-save">
          <input type="text" className="form-control" placeholder="Name this calculation" aria-label="Calculation name" value={profileName} onChange={(e) => setProfileName(e.target.value)} required />
          <button type="submit" className="settings-btn">Save</button>
        </form>
      </div>

      <div className="lp-grid">
        <Group title="The loan">
          <Row label="Amount" htmlFor="emi-amount">
            <AmountInput id="emi-amount" label="Loan amount" prefix="₹" width={130} value={loanAmount} onChange={setLoanAmount} />
          </Row>
          <Row label="Interest rate" description="A year, as the lender quotes it." htmlFor="emi-rate">
            <AmountInput id="emi-rate" label="Interest rate" suffix="%" width={80} value={roi} onChange={setRoi} />
          </Row>
          <Row label="Tenure" htmlFor="emi-tenure">
            <span className="lp-inline">
              <AmountInput id="emi-tenure" label="Tenure" width={60} value={tenureValue} onChange={(v) => setTenureValue(Math.max(Math.round(v), 1))} />
              <span className="lp-toggle" role="group" aria-label="Tenure unit">
                <button type="button" aria-pressed={tenureUnit === 'years'} onClick={() => { if (tenureUnit !== 'years') { setTenureUnit('years'); setTenureValue(Math.max(Math.round(tenureValue / 12), 1)); } }}>years</button>
                <button type="button" aria-pressed={tenureUnit === 'months'} onClick={() => { if (tenureUnit !== 'months') { setTenureUnit('months'); setTenureValue(tenureValue * 12); } }}>months</button>
              </span>
            </span>
          </Row>
          <Row label="First EMI" htmlFor="emi-start">
            <input id="emi-start" type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Row>
        </Group>

        <section className="glass-panel db-card">
          <div className="db-card-head"><h3>What it costs</h3>{loading && <span className="cc-note">Working it out…</span>}</div>
          <strong className="eg-figure">{optimized ? formatCurrency(optimized.monthly_emi) : '—'} <span>a month</span></strong>
          {baseline && optimized && (
            <ul className="db-facts">
              <li>Over {formatTenure(tenureMonths).toLowerCase()} you'd pay <strong>{formatCurrency(baseline.total_interest)}</strong> in interest on {formatCurrency(loanAmount)} borrowed.</li>
              {prepayments.length > 0 && (
                <li>With {prepayments.length === 1 ? 'the prepayment' : `${prepayments.length} prepayments`} ({formatCurrency(optimized.total_prepayments)}), interest drops to <strong>{formatCurrency(optimized.total_interest)}</strong> and the loan closes in {formatTenure(optimized.tenure_months).toLowerCase()}.</li>
              )}
            </ul>
          )}
          {interestSaved > 0 && (
            <div className="lp-saved">
              <strong>{formatCurrency(interestSaved)}</strong> less interest, debt-free <strong>{formatTenure(tenureSavedMonths).toLowerCase()}</strong> sooner.
            </div>
          )}
        </section>
      </div>

      <Group title="Prepayments" description="Lump sums paid off the principal on a date. They shorten the loan; the EMI stays the same.">
        {prepayments.map((p, idx) => (
          <Row key={`${p.date}-${idx}`} label={formatCurrency(p.amount)} description={`on ${formatDate(p.date)}`}>
            <button type="button" className="settings-link" onClick={() => handleEditPrepayment(idx)}>Edit</button>
            <button type="button" className="settings-link settings-link--danger" onClick={() => handleRemovePrepayment(idx)}>Remove</button>
          </Row>
        ))}
        <form onSubmit={handleAddPrepayment} className="settings-row lp-prepay-add">
          <div className="settings-row-text"><div className="settings-row-label">{editingIdx !== null ? 'Change this prepayment' : 'Add a prepayment'}</div></div>
          <div className="settings-row-control">
            <input type="date" className="form-control" aria-label="Prepayment date" value={newPrepayDate} onChange={(e) => setNewPrepayDate(e.target.value)} required />
            <AmountInput label="Prepayment amount" prefix="₹" width={110} value={newPrepayAmount} onChange={setNewPrepayAmount} />
            <button type="submit" className="settings-btn settings-btn--primary">{editingIdx !== null ? 'Update' : 'Add'}</button>
            {editingIdx !== null && <button type="button" className="settings-link" onClick={handleCancelEdit}>Cancel</button>}
          </div>
        </form>
      </Group>

      <section className="glass-panel db-card">
        <div className="db-card-head">
          <h3>Repayment schedule</h3>
          {optimized && (
            <span className="db-head-actions">
              <button type="button" className="settings-link" onClick={handleExportCSV}>CSV</button>
              <button type="button" className="settings-link" onClick={handleExportExcel}>Excel</button>
              <button type="button" className="settings-link" onClick={handleExportPDF}>Print</button>
            </span>
          )}
        </div>
        {rows.length === 0 ? <p className="cc-note">Enter a loan above to see each month's payment.</p> : (
          <div style={{ overflowX: 'auto' }}>
            <table className="cf-compare lp-schedule">
              <thead><tr><th>#</th><th>Date</th><th>Owed at start</th><th>Interest</th><th>Principal</th><th>Prepaid</th><th>Owed after</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.month} className={r.prepayments > 0 ? 'lp-prepaid' : undefined}>
                    <th scope="row">{r.month}</th>
                    <td>{formatDate(r.date)}</td>
                    <td>{formatCurrency(r.beginning_balance)}</td>
                    <td>{formatCurrency(r.interest)}</td>
                    <td>{formatCurrency(r.principal)}</td>
                    <td>{r.prepayments > 0 ? formatCurrency(r.prepayments) : '—'}</td>
                    <td>{formatCurrency(r.ending_balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows.length > 12 && (
          <button type="button" className="settings-link" style={{ alignSelf: 'flex-start', paddingLeft: 0 }} onClick={() => setShowFullSchedule((v) => !v)}>
            {showFullSchedule ? 'Show the first year only' : `Show all ${rows.length} months`}
          </button>
        )}
      </section>
    </div>
  );
};
