import React, { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { TaxInputMetadata, TaxMonthInput } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';
import { formatINR } from './taxUi';
import { GridRow, parseAmount } from './monthlyRows';

// ---------------------------------------------------------------------------
// CSV parsing and matching (pure functions)
// ---------------------------------------------------------------------------

/** RFC 4180-ish: quoted fields, doubled quotes, commas/newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const MONTH_NAMES = ['apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec', 'jan', 'feb', 'mar'];
const MONTH_FULL = ['april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december', 'january', 'february', 'march'];
const CALENDAR_TO_FY = [9, 10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8]; // Jan(1)..Dec(12) -> FY index

/** "Apr", "April 2026", "Apr-26", "2026-04", "04/2026" -> 0..11 (April = 0), else null. */
export function monthIndex(label: string): number | null {
  const t = label.trim().toLowerCase();
  // Whole month words only ("Apr", "April 2026", "Apr-26", "Sept"), so labels like
  // "Marriage allowance" or "Junior bonus" are never read as months.
  const byName = MONTH_NAMES.findIndex((n, i) => new RegExp(`(^|[^a-z])(${n}|${MONTH_FULL[i]}${n === 'sep' ? '|sept' : ''})([^a-z]|$)`).test(t));
  if (byName >= 0) return byName;
  const iso = t.match(/^(\d{4})[-/](\d{1,2})/) || t.match(/^(\d{1,2})[-/](\d{4})/);
  if (iso) {
    const month = Number(iso[1].length === 4 ? iso[2] : iso[1]);
    if (month >= 1 && month <= 12) return CALENDAR_TO_FY[month - 1];
  }
  return null;
}

const GUESSES: [RegExp, string][] = [
  [/\b(gross|net|total|ctc|take.?home)\b/, 'ignore'],
  [/employer.*(pf|provident)/, 'employer_contributions.pf'],
  [/employer.*nps|nps.*employer|80ccd\s*\(?2/, 'employer_contributions.nps'],
  [/superannuation/, 'employer_contributions.superannuation'],
  [/\bvpf\b|voluntary/, 'payroll_deductions.vpf'],
  [/\besic?\b/, 'payroll_deductions.employee_esic'],
  [/prof(essional)?\.?\s*tax|\bp\.?\s?tax\b|^pt$/, 'payroll_deductions.professional_tax'],
  [/\b(e?pf|provident)\b/, 'payroll_deductions.employee_epf'],
  [/\btds\b|income.?tax|tax deducted/, 'tds'],
  [/rent paid|^rent$/, 'rent_paid'],
  [/\bbasic\b/, 'salary.basic'],
  [/dearness|\bda\b/, 'salary.da'],
  [/\bhra\b|house rent/, 'salary.hra'],
  [/special/, 'salary.special_allowance'],
  [/bonus|performance|variable/, 'salary.bonus'],
  [/incentive|commission/, 'salary.incentives'],
  [/other.*allowance/, 'salary.other_taxable_allowances'],
];

export function guessTarget(label: string, rowIds: Set<string>): string {
  const t = label.trim().toLowerCase();
  for (const [re, target] of GUESSES) {
    if (re.test(t) && (target === 'ignore' || rowIds.has(target))) return target;
  }
  return 'ignore';
}

interface Parsed {
  items: { label: string; values: (number | null)[] }[]; // values indexed by FY month
  monthsFound: number[];
  orientation: 'months-as-columns' | 'months-as-rows';
}

/** Accepts either layout: months across the top (one row per item) or one row per month. */
export function interpretCsv(rows: string[][]): Parsed | string {
  if (rows.length < 2) return 'The file needs a header row and at least one data row.';
  const header = rows[0];
  const colMonths = header.slice(1).map(monthIndex);
  const rowMonths = rows.slice(1).map((r) => monthIndex(r[0] ?? ''));
  const colHits = colMonths.filter((m) => m !== null).length;
  const rowHits = rowMonths.filter((m) => m !== null).length;
  if (!colHits && !rowHits) return 'No month names found. Use month labels like "Apr 2026" in the first row or first column.';

  const items: Parsed['items'] = [];
  if (colHits >= rowHits) {
    for (const r of rows.slice(1)) {
      const values: (number | null)[] = Array(12).fill(null);
      colMonths.forEach((m, j) => { if (m !== null) values[m] = parseAmount(r[j + 1] ?? ''); });
      if ((r[0] ?? '').trim()) items.push({ label: r[0].trim(), values });
    }
    return { items, monthsFound: colMonths.filter((m): m is number => m !== null), orientation: 'months-as-columns' };
  }
  header.slice(1).forEach((label, j) => {
    const values: (number | null)[] = Array(12).fill(null);
    rows.slice(1).forEach((r, i) => { const m = rowMonths[i]; if (m !== null) values[m] = parseAmount(r[j + 1] ?? ''); });
    if (label.trim()) items.push({ label: label.trim(), values });
  });
  return { items, monthsFound: rowMonths.filter((m): m is number => m !== null), orientation: 'months-as-rows' };
}

// ---------------------------------------------------------------------------

interface Props {
  rows: GridRow[];
  months: TaxMonthInput[];
  metadata: TaxInputMetadata;
  onClose: () => void;
  onImport: (months: TaxMonthInput[], summary: string) => void;
}

const slug = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'item';

export const CsvImportDialog: React.FC<Props> = ({ rows, months, onClose, onImport }) => {
  const modalRef = useModalA11y(true, onClose);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [targets, setTargets] = useState<Record<string, string>>({});
  const [markActual, setMarkActual] = useState(true);
  const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);

  const load = async (file: File) => {
    setFileName(file.name);
    const result = interpretCsv(parseCsv(await file.text()));
    if (typeof result === 'string') {
      setError(result);
      setParsed(null);
      return;
    }
    setError(null);
    setParsed(result);
    setTargets(Object.fromEntries(result.items.map((it) => [it.label, guessTarget(it.label, rowIds)])));
  };

  const doImport = () => {
    if (!parsed) return;
    const next = months.map((m) => ({ ...m, salary: { ...m.salary } }));
    const touched = new Set<number>();
    let cells = 0;
    parsed.items.forEach((item) => {
      const target = targets[item.label];
      if (!target || target === 'ignore') return;
      const row: GridRow | undefined = target === 'new'
        ? {
          id: `salary.${slug(item.label)}`, label: item.label, group: 'Earnings',
          get: (m) => m.salary[slug(item.label)] ?? 0,
          set: (m, v) => ({ ...m, salary: { ...m.salary, [slug(item.label)]: v ?? 0 } }),
        }
        : rows.find((r) => r.id === target);
      if (!row) return;
      item.values.forEach((v, i) => {
        if (v === null) return;
        next[i] = row.set(next[i], v);
        touched.add(i);
        cells++;
      });
    });
    if (markActual) touched.forEach((i) => { next[i] = { ...next[i], status: 'actual' }; });
    const monthsLabel = Array.from(touched).sort((a, b) => a - b).map((i) => months[i].label.split(' ')[0]).join(', ');
    onImport(next, `Imported ${cells} value(s) from ${fileName} for ${monthsLabel || 'no months'}${markActual && touched.size ? ' (marked actual)' : ''}.`);
  };

  const mapped = parsed ? parsed.items.filter((it) => targets[it.label] && targets[it.label] !== 'ignore').length : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby="csv-import-title"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 id="csv-import-title" style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>Import payslips from CSV</h3>
          <button className="btn btn-secondary" style={{ padding: '4px 6px' }} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
          Either layout works: months across the top with one row per payslip line (like the template), or one row per month
          with payslip lines as columns (like many payroll exports). Month labels such as "Apr 2026", "April" or "2026-04" are recognised.
        </p>
        <input aria-label="CSV file" type="file" accept=".csv,text/csv,text/plain"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) load(f); }} />
        {error && <div role="alert" style={{ marginTop: '10px', fontSize: '12.5px', color: '#fca5a5' }}>{error}</div>}

        {parsed && (
          <>
            <div style={{ margin: '12px 0 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Found {parsed.items.length} line(s) and {parsed.monthsFound.length} month(s)
              ({parsed.orientation === 'months-as-columns' ? 'months across the top' : 'one row per month'}). Check where each line should go:
            </div>
            <table className="custom-table" style={{ marginTop: 0 }}>
              <thead><tr><th>Line in file</th><th>Goes to</th><th style={{ textAlign: 'right' }}>Year total</th></tr></thead>
              <tbody>
                {parsed.items.map((it) => (
                  <tr key={it.label}>
                    <td style={{ color: 'var(--text-primary)' }}>{it.label}</td>
                    <td>
                      <select aria-label={`Destination for ${it.label}`} className="form-input" style={{ padding: '4px 6px', fontSize: '12px' }}
                        value={targets[it.label] ?? 'ignore'} onChange={(e) => setTargets({ ...targets, [it.label]: e.target.value })}>
                        <option value="ignore">Ignore</option>
                        <option value="new">New earning: "{it.label}"</option>
                        {['Earnings', 'Payroll deductions', 'Employer contributions', 'Tax & rent'].map((g) => (
                          <optgroup key={g} label={g}>
                            {rows.filter((r) => r.group === g).map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatINR(it.values.reduce<number>((t, v) => t + (v || 0), 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12.5px', color: 'var(--text-secondary)', margin: '10px 0' }}>
              <input type="checkbox" checked={markActual} onChange={(e) => setMarkActual(e.target.checked)} />
              Mark imported months as actual (from payslips)
            </label>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" style={{ padding: '6px 14px' }} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{ padding: '6px 14px' }} disabled={!mapped} onClick={doImport}>
                Import {mapped} line(s)
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
