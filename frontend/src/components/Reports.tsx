import React from 'react';
import { FileText, Download } from 'lucide-react';
import { InitData } from '../types';

interface ReportsProps {
  data: InitData;
}

export const Reports: React.FC<ReportsProps> = ({ data }) => {
  // Generate and Download local reports
  const exportMarkdownReport = () => {
    const summary = data.summary;
    const liabilities = data.liabilities || [];
    const assets = data.assets || [];
    const accounts = data.accounts || [];
    const goals = data.goals || [];

    let md = `# Financial Status & Plan Report - ${new Date().toISOString().split('T')[0]}\n\n`;

    md += `## 1. Summary Overview\n`;
    md += `- **Net Worth:** ₹${summary.net_worth.toLocaleString()}\n`;
    md += `- **Total Liquid Funds:** ₹${summary.total_liquid.toLocaleString()}\n`;
    md += `- **Total Investments Value:** ₹${summary.total_investments.toLocaleString()}\n`;
    md += `- **Total Liabilities (Debt):** ₹${summary.total_debt.toLocaleString()}\n\n`;

    md += `## 2. Savings Accounts balances\n`;
    accounts.forEach((a: any) => {
      md += `- **${a.name} (${a.institution_name || 'Bank'}):** ₹${a.current_balance.toLocaleString()}\n`;
    });
    md += `\n`;

    md += `## 3. Active Liabilities Details\n`;
    liabilities.forEach((l: any) => {
      md += `- **${l.name} (${l.lender_name || 'Lender'}):** Outstanding: ₹${l.outstanding.toLocaleString()} | EMI: ₹${(l.emi || 0).toLocaleString()} | ROI: ${l.interest_rate || 0}% | Remaining Tenure: ${l.remaining_tenure || 0} mo\n`;
    });
    md += `\n`;

    md += `## 4. Assets Registry\n`;
    assets.forEach((i: any) => {
      md += `- **${i.name} (${i.category_name || 'General'}):** Current: ₹${i.current_value.toLocaleString()} | Invested: ₹${(i.invested_amount || 0).toLocaleString()}\n`;
    });
    md += `\n`;

    md += `## 5. Goals Milestones\n`;
    goals.forEach((g: any) => {
      md += `- **${g.name}:** Target: ₹${g.target_amount.toLocaleString()} | Current: ₹${g.current_amount.toLocaleString()} | Shortfall: ₹${(g.gap || 0).toLocaleString()} | Contribution: ₹${(g.monthly_contribution || 0)}/mo\n`;
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
    let csv = `Account Name,Institution,Balance\n`;
    data.accounts.forEach((a: any) => {
      csv += `"${a.name}","${a.institution_name || 'Bank'}",${a.current_balance}\n`;
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
    let csv = `Liability Name,Lender,Outstanding Balance,ROI (%),Monthly EMI,Remaining Tenure (Months),Progress (%)\n`;
    data.liabilities.forEach((l: any) => {
      csv += `"${l.name}","${l.lender_name || 'Lender'}",${l.outstanding},${l.interest_rate},${l.emi},${l.remaining_tenure},${l.progress}\n`;
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
    let csv = `Asset Name,Category,Current Value,Invested Amount\n`;
    data.assets.forEach((i: any) => {
      csv += `"${i.name}","${i.category_name || 'General'}",${i.current_value},${i.invested_amount || 0}\n`;
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
    let csv = `Asset Name,Policy Type,Policy Number,Coverage,Premium,Frequency,Renewal Date\n`;
    const insurance = (data.assets || []).filter((a: any) => a.category_name === 'Insurance');
    insurance.forEach((ins: any) => {
      const coverage = ins.policy_type === 'Health' ? (ins.sum_insured || 0)
        : ins.policy_type === 'Vehicle' ? (ins.idv || 0)
        : (ins.sum_assured || 0);
      csv += `"${ins.name}","${ins.policy_type || ''}","${ins.policy_number || ''}",${coverage},${ins.premium || 0},"${ins.frequency || ''}","${ins.renewal_date || ''}"\n`;
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
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header">
        <h1 className="page-title">Reports</h1>
        <p className="page-subtitle">Download your data as a planning report or spreadsheets.</p>
      </div>

      <div className="glass-panel" style={{ padding: '24px', maxWidth: '480px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText size={16} style={{ color: 'var(--accent-light)' }} />
          Downloads
        </h3>

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
    </div>
  );
};
