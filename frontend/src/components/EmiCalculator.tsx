import React, { useState, useEffect } from 'react';
import { formatDate } from '../format';
import { 
  Calculator, Calendar, Plus, Trash2, Edit2,
  TrendingDown, List, ChevronDown, ChevronUp
} from 'lucide-react';
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
}

export const EmiCalculator: React.FC<EmiCalculatorProps> = ({ showToast }) => {
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState<boolean>(false);

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

  const handleDeleteProfile = async () => {
    if (!activeProfileId) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/settings/emi-profiles/${activeProfileId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setActiveProfileId(null);
        setProfileName('');
        setIsConfirmingDelete(false);
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
          <title>FinanceOS - Amortization Report</title>
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
          <h1>FinanceOS Loan Amortization Report</h1>
          <p style="color: #666; margin-top: 0;">Generated on ${new Date().toLocaleDateString()}</p>
          
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

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <h1 className="page-title">EMI Tool</h1>
        <p className="page-subtitle">Work out a loan's EMI, and how much interest prepayments save.</p>
      </div>

      {/* Profiles Selection & Saving Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Load Profile:</span>
          <select 
            className="form-input" 
            style={{ padding: '6px 12px', fontSize: '13px', minWidth: '200px' }}
            value={activeProfileId || ''}
            onChange={e => handleLoadProfile(Number(e.target.value))}
          >
            <option value="">-- Select Saved Profile --</option>
            {savedProfiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {activeProfileId && (
            isConfirmingDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '8px', padding: '2px 8px' }}>
                <span style={{ color: 'var(--danger-light)', fontSize: '12px', fontWeight: 500 }}>Delete?</span>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '3px 8px', fontSize: '11px', color: '#ef4444', border: 'none', background: 'transparent', minWidth: 'auto' }}
                  onClick={handleDeleteProfile}
                >
                  Yes
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  style={{ padding: '3px 8px', fontSize: '11px', border: 'none', background: 'transparent', minWidth: 'auto' }}
                  onClick={() => setIsConfirmingDelete(false)}
                >
                  No
                </button>
              </div>
            ) : (
              <button className="btn btn-secondary" style={{ color: 'var(--danger)', padding: '6px 12px', fontSize: '12px' }} onClick={() => setIsConfirmingDelete(true)}>
                Delete Profile
              </button>
            )
          )}
        </div>

        <form onSubmit={handleSaveProfile} style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input 
            type="text" 
            className="form-input" 
            placeholder="Profile Name..." 
            style={{ padding: '6px 12px', fontSize: '13px', width: '200px' }}
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            required
          />
          <button type="submit" className="btn btn-primary" style={{ padding: '6px 16px', fontSize: '12px' }}>
            Save Profile
          </button>
        </form>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* Left Side: Inputs Panel */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calculator size={18} style={{ color: 'var(--accent-light)' }} />
            Loan Parameters
          </h3>

          {/* Loan Amount Input + Slider */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>Loan Amount (Principal)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>₹</span>
                <input 
                  type="number" 
                  className="form-input" 
                  value={loanAmount} 
                  onChange={e => setLoanAmount(Math.max(Number(e.target.value), 0))}
                  style={{ width: '150px', padding: '6px 12px 6px 24px', fontSize: '14px', textAlign: 'right' }}
                />
              </div>
            </div>
            <input 
              type="range" 
              min={100000} 
              max={20000000} 
              step={50000}
              value={loanAmount} 
              onChange={e => setLoanAmount(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>₹1 Lakh</span>
              <span>₹1 Crore</span>
              <span>₹2 Crore</span>
            </div>
          </div>

          {/* ROI Input + Slider */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <label className="form-label" style={{ margin: 0 }}>Interest Rate (ROI)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="number" 
                  step="0.05"
                  className="form-input" 
                  value={roi} 
                  onChange={e => setRoi(Math.max(Number(e.target.value), 0))}
                  style={{ width: '100px', padding: '6px 24px 6px 12px', fontSize: '14px', textAlign: 'right' }}
                />
                <span style={{ position: 'absolute', right: '10px', color: 'var(--text-muted)', fontSize: '14px' }}>%</span>
              </div>
            </div>
            <input 
              type="range" 
              min={1.0} 
              max={20.0} 
              step={0.05}
              value={roi} 
              onChange={e => setRoi(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>1%</span>
              <span>10%</span>
              <span>20%</span>
            </div>
          </div>

          {/* Tenure Input + Slider */}
          <div className="form-group" style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <label className="form-label" style={{ margin: 0 }}>Loan Tenure</label>
                <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '2px' }}>
                  <button 
                    type="button"
                    style={{
                      border: 'none',
                      background: tenureUnit === 'years' ? 'var(--accent)' : 'transparent',
                      color: tenureUnit === 'years' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (tenureUnit !== 'years') {
                        setTenureUnit('years');
                        setTenureValue(Math.max(Math.round(tenureValue / 12), 1));
                      }
                    }}
                  >
                    Years
                  </button>
                  <button 
                    type="button"
                    style={{
                      border: 'none',
                      background: tenureUnit === 'months' ? 'var(--accent)' : 'transparent',
                      color: tenureUnit === 'months' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer'
                    }}
                    onClick={() => {
                      if (tenureUnit !== 'months') {
                        setTenureUnit('months');
                        setTenureValue(tenureValue * 12);
                      }
                    }}
                  >
                    Months
                  </button>
                </div>
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input 
                  type="number" 
                  className="form-input" 
                  value={tenureValue} 
                  onChange={e => setTenureValue(Math.max(Number(e.target.value), 1))}
                  style={{ width: '100px', padding: '6px 36px 6px 12px', fontSize: '14px', textAlign: 'right' }}
                />
                <span style={{ position: 'absolute', right: '10px', color: 'var(--text-muted)', fontSize: '12px', pointerEvents: 'none' }}>
                  {tenureUnit === 'years' ? 'Yrs' : 'Mos'}
                </span>
              </div>
            </div>
            <input 
              type="range" 
              min={tenureUnit === 'years' ? 1 : 12} 
              max={tenureUnit === 'years' ? 30 : 360} 
              step={1}
              value={tenureValue} 
              onChange={e => setTenureValue(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--accent)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
              <span>{tenureUnit === 'years' ? '1 Year' : '12 Months'}</span>
              <span>{tenureUnit === 'years' ? '15 Years' : '180 Months'}</span>
              <span>{tenureUnit === 'years' ? '30 Years' : '360 Months'}</span>
            </div>
          </div>

          {/* Start Date */}
          <div className="form-group" style={{ marginBottom: '0px' }}>
            <label className="form-label">Loan Start Date (EMI Disbursal)</label>
            <input 
              type="date" 
              className="form-input" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
            />
          </div>

        </div>

        {/* Right Side: Key Metrics Output */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Main Results Card */}
          <div className="glass-panel" style={{ padding: '24px', flexGrow: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingDown size={18} style={{ color: 'var(--success)' }} />
                Loan Payoff Summary {loading && <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>(Calculating...)</span>}
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly EMI</span>
                  <strong style={{ fontSize: '20px', color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                    {optimized ? formatCurrency(optimized.monthly_emi) : '—'}
                  </strong>
                </div>
                <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px 16px', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px' }}>New Tenure</span>
                  <strong style={{ fontSize: '20px', color: 'var(--text-primary)', display: 'block', marginTop: '4px' }}>
                    {optimized ? formatTenure(optimized.tenure_months) : '—'}
                  </strong>
                </div>
              </div>

              {/* Baseline vs Optimized breakdowns */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-glass)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Original Interest Payable</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {baseline ? formatCurrency(baseline.total_interest) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-glass)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Optimized Interest Payable</span>
                  <span style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
                    {optimized ? formatCurrency(optimized.total_interest) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '10px', borderBottom: '1px solid var(--border-glass)' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Lump-Sum Prepayments</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {optimized ? formatCurrency(optimized.total_prepayments) : '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Total Payment (Principal + Interest)</span>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                    {optimized ? formatCurrency(optimized.total_payment) : '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Savings Callout */}
            {interestSaved > 0 && (
              <div style={{ marginTop: '24px', padding: '16px', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: 'var(--radius-sm)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '10px', borderRadius: '50px', color: 'var(--success)' }}>
                  <TrendingDown size={20} />
                </div>
                <div>
                  <span style={{ fontSize: '11px', color: 'var(--success)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Total Savings Accrued</span>
                  <strong style={{ fontSize: '16px', color: '#fff', display: 'block', marginTop: '2px' }}>
                    Saved {formatCurrency(interestSaved)} &amp; debt-free {formatTenure(tenureSavedMonths)} early!
                  </strong>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: '24px', marginBottom: '24px' }}>
        
        {/* Prepayments Scheduler Panel */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', height: 'fit-content' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={18} style={{ color: 'var(--accent-light)' }} />
            Schedule Prepayments
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
            Simulate a lump-sum principal reduction at any date. The pro-rata daily interest is adjusted instantly.
          </p>

          {/* Add Prepayment Form */}
          <form onSubmit={handleAddPrepayment} style={{ display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', padding: '16px', borderRadius: 'var(--radius-sm)', marginBottom: '20px' }}>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Prepayment Date</label>
              <input 
                type="date" 
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '13px' }}
                value={newPrepayDate}
                onChange={e => setNewPrepayDate(e.target.value)}
                required
              />
            </div>
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label" style={{ fontSize: '11px' }}>Amount (Principal Reduction)</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span style={{ position: 'absolute', left: '10px', color: 'var(--text-muted)', fontSize: '13px' }}>₹</span>
                <input 
                  type="number" 
                  className="form-input" 
                  style={{ padding: '8px 12px 8px 24px', fontSize: '13px', width: '100%' }}
                  value={newPrepayAmount}
                  onChange={e => setNewPrepayAmount(Math.max(Number(e.target.value), 0))}
                  required
                />
              </div>
            </div>
            {editingIdx !== null ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, padding: '8px', fontSize: '13px' }}>
                  Update Payment
                </button>
                <button type="button" className="btn btn-secondary" style={{ flex: 1, padding: '8px', fontSize: '13px' }} onClick={handleCancelEdit}>
                  Cancel
                </button>
              </div>
            ) : (
              <button type="submit" className="btn btn-primary" style={{ padding: '8px', fontSize: '13px', width: '100%' }}>
                <Plus size={14} /> Add Payment
              </button>
            )}
          </form>

          {/* Active Prepayments List */}
          <div>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '10px' }}>Scheduled Payments ({prepayments.length})</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
              {prepayments.length > 0 ? (
                prepayments.map((p, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', fontSize: '13px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <strong style={{ color: 'var(--text-primary)' }}>{formatCurrency(p.amount)}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{formatDate(p.date)}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        style={{ padding: '6px', color: 'var(--accent-light)' }} 
                        onClick={() => handleEditPrepayment(idx)}
                        title="Edit payment"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button 
                        type="button"
                        className="btn btn-secondary" 
                        style={{ padding: '6px', color: 'var(--danger)' }} 
                        onClick={() => handleRemovePrepayment(idx)}
                        title="Delete payment"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div style={{ border: '1px dashed var(--border-glass)', borderRadius: 'var(--radius-sm)', padding: '16px', textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)' }}>
                  No prepayments scheduled yet.
                </div>
              )}
            </div>
          </div>

        </div>

        {/* Amortization Schedule Table */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <List size={18} style={{ color: 'var(--accent-light)' }} />
              Amortization Schedule
            </h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {optimized && (
                <>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={handleExportCSV}>
                    Export CSV
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={handleExportExcel}>
                    Export Excel
                  </button>
                  <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} onClick={handleExportPDF}>
                    Print PDF
                  </button>
                </>
              )}
              {optimized && optimized.schedule.length > 0 && (
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  onClick={() => setShowFullSchedule(!showFullSchedule)}
                >
                  {showFullSchedule ? (
                    <>Show Less <ChevronUp size={12} /></>
                  ) : (
                    <>Show All {optimized.schedule.length} Months <ChevronDown size={12} /></>
                  )}
                </button>
              )}
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ padding: '10px 12px', fontSize: '11px' }}>Month</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px' }}>Date</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right' }}>Beginning Balance</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right' }}>EMI Paid</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right' }}>Interest</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right' }}>Principal</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right', color: 'var(--success)' }}>Prepayments</th>
                  <th style={{ padding: '10px 12px', fontSize: '11px', textAlign: 'right' }}>Ending Balance</th>
                </tr>
              </thead>
              <tbody>
                {optimized && optimized.schedule.length > 0 ? (
                  optimized.schedule
                    .slice(0, showFullSchedule ? optimized.schedule.length : 12)
                    .map((row) => (
                      <tr key={row.month}>
                        <td style={{ padding: '10px 12px', fontSize: '12px' }}>{row.month}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>{formatDate(row.date)}</td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatCurrency(row.beginning_balance)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace' }}>
                          {formatCurrency(row.emi)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'rgba(239, 68, 68, 0.7)' }}>
                          {formatCurrency(row.interest)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'rgba(139, 92, 246, 0.8)' }}>
                          {formatCurrency(row.principal)}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--success)', fontWeight: row.prepayments > 0 ? '600' : 'normal' }}>
                          {row.prepayments > 0 ? formatCurrency(row.prepayments) : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', fontSize: '12px', textAlign: 'right', fontFamily: 'monospace', fontWeight: '500', color: '#fff' }}>
                          {formatCurrency(row.ending_balance)}
                        </td>
                      </tr>
                    ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                      No calculation schedule generated.
                    </td>
                  </tr>
                )}
                {!showFullSchedule && optimized && optimized.schedule.length > 12 && (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '12px', color: 'var(--text-muted)', fontSize: '12px', background: 'rgba(255,255,255,0.01)' }}>
                      Showing first 12 months. Click <strong>"Show All"</strong> above to inspect the entire payoff timeline.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

        </div>

      </div>

    </div>
  );
};
