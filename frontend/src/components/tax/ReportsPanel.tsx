import React, { useMemo, useState } from 'react';
import { Download, FileText } from 'lucide-react';
import {
  TaxComputeResult, TaxNpsScenariosResult, TaxPayslipResult, TaxRegimeKey, TaxWaterfallResult,
} from '../../types';
import type { OptimizationProps } from './NpsOptimizer';
import { npsRequest, payslipRequest, toEngineInputs } from './plannerInputs';
import { EmptyState, ErrorBanner, formatINR, Section } from './taxUi';
import { useTaxPost } from './useTaxPost';
import type { SensitivityResult } from './SensitivityPanel';
import { allTablesCsvRows, buildReportTables, ReportTable } from './reportTables';
import { downloadCsv } from './csvExport';
import { saveAsPdf } from '../../platform';

// Printed on white paper, so the report uses its own light palette (not the app theme).
const paper = { background: '#ffffff', color: '#111827', muted: '#4b5563', rule: '#d1d5db', head: '#f3f4f6' };

const cellValue = (v: unknown, format: string) => {
  if (v === null || v === undefined || v === '') return '';
  if ((format === 'inr' || format === 'auto') && typeof v === 'number') return formatINR(v);
  return String(v);
};

const PrintableTable: React.FC<{ table: ReportTable }> = ({ table }) => (
  <section style={{ marginBottom: '22px' }}>
    <h3 style={{ fontSize: '14px', margin: '0 0 4px', color: paper.color }}>{table.title}</h3>
    {table.note && <p style={{ fontSize: '10.5px', color: paper.muted, margin: '0 0 6px', lineHeight: 1.45 }}>{table.note}</p>}
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10.5px' }}>
      <thead>
        <tr>
          {table.columns.map((c, i) => (
            <th key={c.label} style={{ textAlign: i === 0 || c.format === 'text' ? 'left' : 'right', padding: '4px 6px', background: paper.head, borderBottom: `1px solid ${paper.rule}`, color: paper.color }}>{c.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r}>
            {row.map((v, i) => {
              const fmt = table.columns[i]?.format ?? 'text';
              const right = i > 0 && (fmt === 'inr' || fmt === 'pct' || (fmt === 'auto' && (typeof v === 'number' || /^-?[\d.,]+%$/.test(String(v)))));
              return (
                <td key={i} style={{ padding: '3px 6px', borderBottom: `1px solid ${paper.rule}`, color: paper.color, textAlign: right ? 'right' : 'left', fontVariantNumeric: 'tabular-nums', verticalAlign: 'top' }}>
                  {cellValue(v, fmt)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  </section>
);

export const ReportsPanel: React.FC<OptimizationProps & { result: TaxComputeResult | null }> = (props) => {
  const { inputs, financialYear, optimization, result } = props;
  const [status, setStatus] = useState<string | null>(null);
  const enabled = !!financialYear;
  const engineInputs = toEngineInputs(inputs);
  const nps = useTaxPost<TaxNpsScenariosResult>('/api/tax/nps-scenarios', npsRequest(inputs, financialYear, optimization), enabled);
  const slip = useTaxPost<TaxPayslipResult>('/api/tax/payslip', payslipRequest(inputs, financialYear, optimization), enabled);
  const sens = useTaxPost<SensitivityResult>('/api/tax/sensitivity', { financial_year: financialYear, inputs: engineInputs }, enabled);
  const wfNew = useTaxPost<TaxWaterfallResult>('/api/tax/waterfall', { financial_year: financialYear, inputs: engineInputs, regime: 'new' }, enabled);
  const wfOld = useTaxPost<TaxWaterfallResult>('/api/tax/waterfall', { financial_year: financialYear, inputs: engineInputs, regime: 'old' }, enabled);

  const pending = [nps, slip, sens, wfNew, wfOld].some((q) => !q.data || q.stale);
  const tables = useMemo(() => (result ? buildReportTables({
    result, nps: nps.data, payslip: slip.data, sensitivity: sens.data,
    waterfalls: { new: wfNew.data ?? undefined, old: wfOld.data ?? undefined } as Partial<Record<TaxRegimeKey, TaxWaterfallResult>>,
  }) : []), [result, nps.data, slip.data, sens.data, wfNew.data, wfOld.data]);

  if (!result) return <EmptyState>Computing…</EmptyState>;
  const errors = [nps.error, slip.error, sens.error, wfNew.error, wfOld.error].filter(Boolean) as string[];
  const stamp = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  const fileBase = `artha-tax-${result.rule_set.financial_year}`;

  const savePdf = async () => {
    setStatus(null);
    try {
      const saved = await saveAsPdf(`${fileBase}-report.pdf`);
      setStatus(saved === 'print-dialog' ? 'Choose "Save as PDF" in the print dialog.' : saved ? `Saved ${saved}` : 'Cancelled.');
    } catch (e) {
      setStatus(`Could not save the PDF: ${(e as Error).message}`);
    }
  };
  const btn: React.CSSProperties = { padding: '6px 12px', fontSize: '12px', display: 'inline-flex', gap: '6px', alignItems: 'center' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {errors.map((e) => <ErrorBanner key={e} message={e} />)}
      <Section title="Export"
        subtitle="Every download is built from the same computations the planner shows. The PDF is the report previewed below.">
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" style={btn} onClick={savePdf} disabled={pending}>
            <FileText size={13} /> {pending ? 'Preparing report…' : 'Save report as PDF'}
          </button>
          <button className="btn btn-secondary" style={btn} disabled={pending}
            onClick={() => downloadCsv(`${fileBase}-full-report.csv`, allTablesCsvRows(tables))}>
            <Download size={13} /> Everything (one CSV)
          </button>
          {status && <span role="status" style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{status}</span>}
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {tables.map((t) => (
            <button key={t.id} className="btn btn-secondary" style={{ ...btn, padding: '4px 10px', fontSize: '11.5px' }}
              onClick={() => downloadCsv(`${fileBase}-${t.id}.csv`, [t.columns.map((c) => c.label), ...t.rows])}>
              <Download size={11} /> {t.title}
            </button>
          ))}
        </div>
      </Section>

      <div className="print-root" style={{ background: paper.background, color: paper.color, borderRadius: '10px', padding: '28px 32px', fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif' }}>
        <header style={{ marginBottom: '18px', borderBottom: `2px solid ${paper.color}`, paddingBottom: '10px' }}>
          <h2 style={{ margin: 0, fontSize: '20px', color: paper.color }}>Artha income tax report</h2>
          <div style={{ fontSize: '11px', color: paper.muted, marginTop: '4px', lineHeight: 1.6 }}>
            FY {result.rule_set.financial_year} (AY {result.rule_set.assessment_year}) · {result.rule_set.act} ·
            rules {result.rule_set.name ?? result.rule_set.rule_set_id} v{result.rule_set.version}
            {result.rule_set.content_hash && ` (fingerprint ${result.rule_set.content_hash.slice(0, 12)})`} · generated {stamp}
            {inputs.monthly?.enabled && ' · salary entered month by month'}
          </div>
        </header>
        {tables.map((t) => <PrintableTable key={t.id} table={t} />)}
        <footer style={{ fontSize: '10px', color: paper.muted, borderTop: `1px solid ${paper.rule}`, paddingTop: '8px', lineHeight: 1.5 }}>
          Estimates for decision support, not tax advice. Rules are labelled by how far they are verified; values marked
          secondary source, unverified, assumption or user-entered should be checked against the Income-tax Act, the
          Finance Act and the Income-tax Rules before filing. Employer contribution levels and exemptions depend on your
          employer's policy.
        </footer>
      </div>
    </div>
  );
};
