import React, { useState, useEffect } from 'react';
import { Upload, Database, FileText, Download } from 'lucide-react';
import { InitData } from '../types';

interface ReportsProps {
  data: InitData;
  onRefresh: () => void;
}

export const Reports: React.FC<ReportsProps> = ({ data, onRefresh }) => {
  const [backupsList, setBackupsList] = useState<string[]>([]);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [backupStatus, setBackupStatus] = useState<string | null>(null);

  // Database Configuration State
  const [dbSettings, setDbSettings] = useState<{
    active_path: string;
    default_path: string;
    recent_databases: string[];
    backup_on_open?: boolean;
    backup_on_close?: boolean;
    backup_count_limit?: number;
    custom_backup_dir?: string;
  } | null>(null);

  // MMEx-Style backup options state
  const [backupOnOpen, setBackupOnOpen] = useState(true);
  const [backupOnClose, setBackupOnClose] = useState(true);
  const [backupCountLimit, setBackupCountLimit] = useState(10);
  const [customBackupDir, setCustomBackupDir] = useState('');
  const [saveSettingsStatus, setSaveSettingsStatus] = useState<string | null>(null);

  useEffect(() => {
    fetchBackups();
    fetchDatabaseSettings();
  }, []);

  const fetchDatabaseSettings = () => {
    fetch('http://127.0.0.1:8000/api/settings/database')
      .then(res => res.json())
      .then(d => {
        setDbSettings(d);
        setBackupOnOpen(d.backup_on_open ?? true);
        setBackupOnClose(d.backup_on_close ?? true);
        setBackupCountLimit(d.backup_count_limit ?? 10);
        setCustomBackupDir(d.custom_backup_dir ?? '');
      })
      .catch(err => console.error(err));
  };

  const handleSaveBackupSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaveSettingsStatus("Saving...");
      const res = await fetch('http://127.0.0.1:8000/api/settings/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup_on_open: backupOnOpen,
          backup_on_close: backupOnClose,
          backup_count_limit: backupCountLimit,
          custom_backup_dir: customBackupDir
        })
      });
      if (res.ok) {
        setSaveSettingsStatus("Saved!");
        fetchDatabaseSettings();
        fetchBackups();
        setTimeout(() => setSaveSettingsStatus(null), 3000);
      } else {
        setSaveSettingsStatus("Failed to save");
      }
    } catch (err) {
      console.error(err);
      setSaveSettingsStatus("Error");
    }
  };

  const handleSelectDatabase = async (mode: 'open' | 'create') => {
    const electron = (window as any).require ? (window as any).require('electron') : null;
    if (!electron) {
      alert("Database switching is only supported inside the Desktop application wrapper.");
      return;
    }
    
    try {
      const selectedPath = await electron.ipcRenderer.invoke('select-db-file', mode);
      if (!selectedPath) return; // Cancelled
      
      const res = await fetch('http://127.0.0.1:8000/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedPath })
      });
      
      if (res.ok) {
        alert(`Successfully switched active database file to:\n${selectedPath}`);
        onRefresh();
        fetchDatabaseSettings();
        fetchBackups();
      } else {
        const err = await res.json();
        alert(`Failed to switch: ${err.detail || "Unknown error"}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error picking database file");
    }
  };

  const handleQuickSwitch = async (path: string) => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/settings/database', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (res.ok) {
        onRefresh();
        fetchDatabaseSettings();
        fetchBackups();
      } else {
        const err = await res.json();
        alert(`Failed to switch: ${err.detail}`);
      }
    } catch (err) {
      console.error(err);
      alert("Network error");
    }
  };

  const fetchBackups = () => {
    fetch('http://127.0.0.1:8000/api/backup/list')
      .then(res => res.json())
      .then(d => setBackupsList(d))
      .catch(err => console.error(err));
  };

  const handleMMexImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setImportStatus("Importing...");
      const res = await fetch('http://127.0.0.1:8000/api/import/mmex', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        const result = await res.json();
        setImportStatus(`Success! Synced ${result.imported} accounts.`);
        onRefresh();
      } else {
        const err = await res.json();
        setImportStatus(`Import failed: ${err.detail || "Invalid CSV layout"}`);
      }
    } catch (err) {
      setImportStatus("Network error during import");
    }
  };

  const handleCreateBackup = async () => {
    try {
      setBackupStatus("Creating backup...");
      const res = await fetch('http://127.0.0.1:8000/api/backup/create', { method: 'POST' });
      if (res.ok) {
        await res.json();
        setBackupStatus("Backup saved successfully!");
        fetchBackups();
      }
    } catch (err) {
      setBackupStatus("Failed to create backup");
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (!confirm(`Are you sure you want to restore the backup: ${filename}? This will overwrite current data.`)) return;

    try {
      const formData = new FormData();
      formData.append('backup_name', filename);
      const res = await fetch('http://127.0.0.1:8000/api/backup/restore', {
        method: 'POST',
        body: formData
      });
      if (res.ok) {
        alert("Backup restored successfully!");
        onRefresh();
      } else {
        alert("Restore failed");
      }
    } catch (err) {
      alert("Network error");
    }
  };

  // Generate and Download local reports
  const exportMarkdownReport = () => {
    const summary = data.summary;
    let md = `# Financial Status & Plan Report - ${new Date().toISOString().split('T')[0]}\n\n`;
    
    md += `## 1. Summary Overview\n`;
    md += `- **Net Worth:** ₹${summary.net_worth.toLocaleString()}\n`;
    md += `- **Total Liquid Funds:** ₹${summary.total_liquid.toLocaleString()}\n`;
    md += `- **Total Investments Value:** ₹${summary.total_investments.toLocaleString()}\n`;
    md += `- **Total Liabilities (Debt):** ₹${summary.total_debt.toLocaleString()}\n\n`;

    md += `## 2. Savings Accounts balances\n`;
    data.accounts.forEach(a => {
      md += `- **${a.name} (${a.institution}):** ₹${a.current_balance.toLocaleString()} _(Updated: ${a.last_updated})_\n`;
    });
    md += `\n`;

    md += `## 3. Active Loans Details\n`;
    data.loans.forEach(l => {
      md += `- **${l.name} (${l.lender}):** Outstanding: ₹${l.outstanding.toLocaleString()} | EMI: ₹${l.emi.toLocaleString()} | ROI: ${l.roi}% | Remaining Tenure: ${l.remaining_tenure} mo\n`;
    });
    md += `\n`;

    md += `## 4. Investments registry\n`;
    data.investments.forEach(i => {
      md += `- **${i.name} (${i.type}):** Current: ₹${i.current_value.toLocaleString()} | Invested: ₹${i.invested_amount.toLocaleString()} | Goal: ${i.goal_mapping || 'Unmapped'}\n`;
    });
    md += `\n`;

    md += `## 5. Goals Milestones\n`;
    data.goals.forEach(g => {
      md += `- **${g.name} (${g.goal_type}):** Target: ₹${g.target_amount.toLocaleString()} | Current: ₹${g.current_amount.toLocaleString()} | Shortfall: ₹${g.gap.toLocaleString()} | Contribution: ₹${g.monthly_contribution}/mo\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `financial_report_${new Date().toISOString().split('T')[0]}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAccountsCSV = () => {
    let csv = `Account Name,Institution,Balance,Last Updated,Remarks\n`;
    data.accounts.forEach(a => {
      csv += `"${a.name}","${a.institution}",${a.current_balance},"${a.last_updated}","${a.remarks || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `accounts_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLoansCSV = () => {
    let csv = `Loan Name,Lender,Outstanding Balance,ROI (%),Monthly EMI,Start Date,Loan Type,Remaining Tenure (Months),Progress (%)\n`;
    data.loans.forEach(l => {
      csv += `"${l.name}","${l.lender}",${l.outstanding},${l.roi},${l.emi},"${l.start_date}","${l.loan_type}",${l.remaining_tenure},${l.progress}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `loans_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportInvestmentsCSV = () => {
    let csv = `Investment Name,Type,Current Value,Invested Amount,Goal Mapping,Last Updated\n`;
    data.investments.forEach(i => {
      csv += `"${i.name}","${i.type}",${i.current_value},${i.invested_amount},"${i.goal_mapping || ''}","${i.last_updated}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `investments_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportInsuranceCSV = () => {
    let csv = `Insurance Company,Policy Number,Coverage,Premium,Frequency,Nominee,Renewal Date,Waiting Period\n`;
    data.insurance.forEach(ins => {
      csv += `"${ins.company}","${ins.policy_number}",${ins.coverage},${ins.premium},"${ins.frequency}","${ins.nominee}","${ins.renewal_date}","${ins.waiting_period || ''}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `insurance_export.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Integration &amp; Backup Center</h1>
        <p className="page-subtitle">Import balances, manage SQLite snapshots, and download custom plans reports</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
        {/* Left Side: MMex CSV Importer & Reports */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* MMex Import Panel */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={18} style={{ color: 'var(--accent-light)' }} />
              Money Manager Ex (MMex) Balances Import
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
              Upload your exported MMex Accounts list CSV. The application will match balances based on Account names and update them immediately.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <input 
                type="file" 
                accept=".csv" 
                onChange={handleMMexImport} 
                id="csv_import_file" 
                style={{ display: 'none' }} 
              />
              <label 
                htmlFor="csv_import_file" 
                className="btn btn-secondary" 
                style={{ width: '100%', cursor: 'pointer', display: 'flex', justifyContent: 'center' }}
              >
                Choose MMex Accounts CSV File
              </label>
              
              {importStatus && (
                <div style={{ 
                  padding: '10px 14px', 
                  borderRadius: 'var(--radius-sm)', 
                  fontSize: '12px', 
                  background: importStatus.includes('Success') ? 'var(--success-bg)' : 'rgba(255,255,255,0.02)',
                  color: importStatus.includes('Success') ? 'var(--success)' : 'var(--text-secondary)'
                }}>
                  {importStatus}
                </div>
              )}
            </div>
          </div>

          {/* Export Center */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: 'var(--accent-light)' }} />
              Report Export Center
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.4' }}>
              Export your plans and assets portfolios into raw standard formats for backup, offline storage, or processing.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between' }} onClick={exportMarkdownReport}>
                <span>Download Markdown Planning Report</span>
                <Download size={14} />
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between' }} onClick={exportAccountsCSV}>
                <span>Download Accounts CSV Export</span>
                <Download size={14} />
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between' }} onClick={exportLoansCSV}>
                <span>Download Loans CSV Export</span>
                <Download size={14} />
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between' }} onClick={exportInvestmentsCSV}>
                <span>Download Investments CSV Export</span>
                <Download size={14} />
              </button>
              <button className="btn btn-secondary" style={{ display: 'flex', justifyContent: 'space-between' }} onClick={exportInsuranceCSV}>
                <span>Download Insurance CSV Export</span>
                <Download size={14} />
              </button>
            </div>
          </div>

          {/* Active Database Settings */}
          <div className="glass-panel" style={{ padding: '24px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Database size={18} style={{ color: 'var(--accent-light)' }} />
              Active Database Settings
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
              Define where your portfolio plan database is saved. You can switch between plans or load custom databases.
            </p>

            <div style={{ wordBreak: 'break-all', fontSize: '13px', background: 'rgba(255,255,255,0.02)', padding: '10px 12px', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Currently Active Database Path</span>
              <strong style={{ color: 'var(--accent-light)', fontSize: '12px', fontFamily: 'monospace' }}>{dbSettings ? dbSettings.active_path : "Loading..."}</strong>
            </div>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
              <button className="btn btn-primary" style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }} onClick={() => handleSelectDatabase('open')}>
                Open Existing DB
              </button>
              <button className="btn btn-secondary" style={{ flex: 1, padding: '8px 12px', fontSize: '12px' }} onClick={() => handleSelectDatabase('create')}>
                Create New DB
              </button>
            </div>

            {dbSettings && dbSettings.recent_databases && dbSettings.recent_databases.length > 1 && (
              <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '14px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>Recent Databases</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {dbSettings.recent_databases.map((path, idx) => {
                    if (path === dbSettings.active_path) return null;
                    return (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', padding: '6px 8px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)' }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '280px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '11px' }} title={path}>
                          {path.split(/[\\/]/).pop()}
                        </span>
                        <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '10px' }} onClick={() => handleQuickSwitch(path)}>
                          Switch
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Database Backups */}
        <div className="glass-panel" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Database size={18} style={{ color: 'var(--accent-light)' }} />
            SQLite Database Backups
          </h3>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px', lineHeight: '1.4' }}>
            Configure automatic replication profiles like Money Manager Ex (MMEx) to safeguard your portfolios.
          </p>

          {/* Backup settings configuration form */}
          <form onSubmit={handleSaveBackupSettings} style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px', marginBottom: '20px' }}>
            <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '12px' }}>Automatic Replication Rules</h4>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input 
                  type="checkbox" 
                  checked={backupOnOpen} 
                  onChange={e => setBackupOnOpen(e.target.checked)} 
                />
                Backup on app startup (Open DB)
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input 
                  type="checkbox" 
                  checked={backupOnClose} 
                  onChange={e => setBackupOnClose(e.target.checked)} 
                />
                Backup on app shutdown (Close DB)
              </label>
            </div>

            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Max backup retention count</label>
              <input 
                type="number" 
                className="form-input" 
                style={{ padding: '6px 10px', fontSize: '12px' }}
                required 
                min={1} 
                max={100}
                value={backupCountLimit} 
                onChange={e => setBackupCountLimit(parseInt(e.target.value) || 10)} 
              />
            </div>

            <div className="form-group" style={{ marginBottom: '16px' }}>
              <label className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Custom backup folder path (Optional)</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Leave blank to use default data/backups" 
                style={{ padding: '6px 10px', fontSize: '12px' }}
                value={customBackupDir} 
                onChange={e => setCustomBackupDir(e.target.value)} 
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '12px' }}>
                Save Settings
              </button>
              {saveSettingsStatus && (
                <span style={{ fontSize: '11px', color: 'var(--success)', fontWeight: 600 }}>{saveSettingsStatus}</span>
              )}
            </div>
          </form>

          {/* Manual Snaps Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <button className="btn btn-secondary" onClick={handleCreateBackup}>
              Create Backup Point Now
            </button>

            {backupStatus && (
              <div style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '12px', background: 'var(--success-bg)', color: 'var(--success)' }}>
                {backupStatus}
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '16px' }}>
              <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '12px' }}>Available Backup Snapshots</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                {backupsList.length > 0 ? (
                  backupsList.map((filename, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: 'var(--radius-sm)', fontSize: '12px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '11px', wordBreak: 'break-all', maxWidth: '200px' }} title={filename}>{filename}</span>
                      <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '10px' }} onClick={() => handleRestoreBackup(filename)}>
                        Restore
                      </button>
                    </div>
                  ))
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '12px 0' }}>No backups found.</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
