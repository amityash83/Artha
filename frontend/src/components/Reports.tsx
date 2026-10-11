import React from 'react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { formatDate, formatINR } from '../format';
import { Group, Row } from './settings/ui';

interface ReportsProps {
  data: InitData;
}

const today = () => new Date().toISOString().slice(0, 10);

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** One CSV row: text quoted (with quotes doubled), numbers left plain. Dates stay ISO, which spreadsheets read best. */
const csvRow = (cells: (string | number | null | undefined)[]) =>
  cells.map((c) => (typeof c === 'number' ? String(Math.round(c * 100) / 100) : `"${String(c ?? '').replace(/"/g, '""')}"`)).join(',');
const csv = (header: string[], rows: (string | number | null | undefined)[][]) => [csvRow(header), ...rows.map(csvRow)].join('\n') + '\n';

/** Remaining months as stored: -1 means the EMI never clears it, and cards have no EMI schedule. */
const tenureText = (l: any) => (l.category_name === 'Credit Card' ? 'card' : l.remaining_tenure > 0 ? `${Math.round(l.remaining_tenure)} months` : l.remaining_tenure < 0 ? 'not cleared at this EMI' : 'paid off');

export const Reports: React.FC<ReportsProps> = ({ data }) => {
  const { accounts = [], assets = [], liabilities = [], goals = [], summary } = data;
  const insurance = assets.filter((a: any) => a.category_name === 'Insurance');
  const owner = (id?: number | null) => data.people.find((p) => p.id === id)?.name ?? '';

  const planningReport = () => {
    const lines: string[] = [
      `# Financial report, ${formatDate(today())}`, '',
      '## Summary',
      `- Net worth: ${formatINR(summary.net_worth)}`,
      `- Cash in accounts: ${formatINR(summary.total_liquid)}`,
      `- Investments: ${formatINR(summary.total_investments)}`,
      `- Debt: ${formatINR(summary.total_debt)}`, '',
      '## Accounts',
      ...accounts.map((a: any) => `- ${a.name}${a.institution_name ? ` (${a.institution_name})` : ''}: ${formatINR(a.current_balance)}`), '',
      '## Loans and cards',
      ...liabilities.map((l: any) => l.category_name === 'Credit Card'
        ? `- ${l.name}: ${formatINR(l.outstanding)} owed on the card`
        : `- ${l.name}${l.lender_name ? ` (${l.lender_name})` : ''}: ${formatINR(l.outstanding)} owed, ${l.interest_rate || 0}%, EMI ${formatINR(l.emi || 0)}, ${tenureText(l)}`), '',
      '## Assets',
      ...assets.map((a: any) => `- ${a.name} (${a.category_name || 'Asset'}): ${formatINR(a.current_value)}${a.category_name === 'EPF' && a.pension_share ? `, plus ${formatINR(a.pension_share)} pension (not counted)` : ''}`), '',
      '## Goals',
      ...goals.map((g: any) => `- ${g.name}: ${formatINR(g.current_amount)} of ${formatINR(g.target_amount)}, ${formatINR(g.monthly_contribution || 0)} a month${g.expected_date && g.expected_date !== 'Never' ? `, on course for ${formatDate(g.expected_date)}` : ''}`),
      '',
    ];
    download(`artha-report-${today()}.md`, lines.join('\n'), 'text/markdown');
  };

  const transactions = async () => {
    const res = await fetch(`${API_BASE_URL}/api/entities/transactions`).catch(() => null);
    if (!res?.ok) return;
    const rows = (await res.json() as any[]).sort((a, b) => String(a.transaction_date).localeCompare(String(b.transaction_date)));
    const name = (type: string, id: number) => (type === 'Account' ? accounts : type === 'Asset' ? assets : type === 'Liability' ? liabilities : [])
      .find((x: any) => x.id === id)?.name ?? '';
    const category = (id?: number) => data.categories.find((c) => c.id === id)?.name ?? '';
    download(`transactions-${today()}.csv`, csv(['Date', 'Type', 'From', 'To', 'Category', 'Amount', 'Notes'],
      rows.map((t) => [t.transaction_date, t.type, name(t.source_ref_type, t.source_ref_id), name(t.dest_ref_type, t.dest_ref_id), category(t.category_id), t.amount, t.notes])), 'text/csv');
  };

  const exports: { label: string; description: string; run: () => void }[] = [
    { label: 'Planning report', description: 'Net worth, accounts, loans, assets and goals on one page (Markdown).', run: planningReport },
    { label: 'Transactions', description: 'Every ledger entry, oldest first.', run: () => { void transactions(); } },
    {
      label: 'Accounts', description: `${accounts.length} account${accounts.length === 1 ? '' : 's'} with balances.`,
      run: () => download('accounts.csv', csv(['Account', 'Bank', 'Owner', 'Balance'], accounts.map((a: any) => [a.name, a.institution_name, owner(a.owner_id), a.current_balance])), 'text/csv'),
    },
    {
      label: 'Loans and cards', description: `${liabilities.length} with what's owed, rate, EMI and months left.`,
      run: () => download('loans.csv', csv(['Name', 'Type', 'Lender', 'Owner', 'Owed', 'Rate %', 'EMI', 'Months left', 'Interest still to pay'],
        liabilities.map((l: any) => [l.name, l.category_name, l.lender_name, owner(l.owner_id), l.outstanding, l.interest_rate, l.emi,
          l.category_name === 'Credit Card' || !(l.remaining_tenure > 0) ? tenureText(l) : Math.round(l.remaining_tenure), l.remaining_interest])), 'text/csv'),
    },
    {
      label: 'Assets', description: `${assets.length} with current value and, where known, what was put in.`,
      run: () => download('assets.csv', csv(['Name', 'Kind', 'Owner', 'Current value', 'Invested', 'Fund type', 'Risk'],
        assets.map((a: any) => [a.name, a.category_name, owner(a.owner_id), a.current_value, a.invested_amount ?? null, a.fund_type ?? '', a.effective_risk ?? a.risk_level])), 'text/csv'),
    },
    {
      label: 'Insurance', description: `${insurance.length} polic${insurance.length === 1 ? 'y' : 'ies'} with cover, premium and renewal.`,
      run: () => download('insurance.csv', csv(['Policy', 'Type', 'Policy number', 'Cover', 'Premium', 'Paid', 'Next renewal'],
        insurance.map((p: any) => [p.name, p.policy_type, p.policy_number, p.cover ?? 0, p.premium ?? 0, p.frequency, p.renewal_date])), 'text/csv'),
    },
  ];

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Reports</h1>
          <p className="page-subtitle">Download your data as a planning report or spreadsheets.</p>
        </div>
      </div>
      <div style={{ maxWidth: '720px' }}>
        <Group title="Downloads" description="Saved to your downloads folder. Spreadsheets use plain numbers and ISO dates so they sort and add up correctly.">
          {exports.map((e) => (
            <Row key={e.label} label={e.label} description={e.description}>
              <button type="button" className="settings-btn" onClick={e.run}>Download</button>
            </Row>
          ))}
        </Group>
      </div>
      <p className="cc-note" style={{ margin: 0 }}>Tax reports (CSV and PDF) are under Taxation › Planner › Reports.</p>
    </div>
  );
};
