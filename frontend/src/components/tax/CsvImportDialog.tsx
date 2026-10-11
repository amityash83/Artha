import React, { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { TaxInputMetadata, TaxMonthInput } from '../../types';
import { useModalA11y } from '../../hooks/useModalA11y';
import { formatINR } from './taxUi';
import { GridRow, parseAmount } from './monthlyRows';
import { API_BASE_URL } from '../../config';

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
  orientation: 'months-as-columns' | 'months-as-rows' | 'pdf';
}

// ---------------------------------------------------------------------------
// Payslip PDFs: read by the backend (in memory, never stored) into a pay month and
// label/amount lines, then mapped like a CSV.
// ---------------------------------------------------------------------------

interface PdfResult {
  file: File;
  month: number | null; // FY index (0 = April) chosen for this payslip
  detected: string | null; // e.g. "Apr 2026"
  items: { label: string; amount: number }[];
  error?: string;
  message?: string;
  warnings: string[];
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);

async function readPdfs(files: File[], password: string, months: TaxMonthInput[]): Promise<PdfResult[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  if (password) form.append('password', password);
  const res = await fetch(`${API_BASE_URL}/api/tax/payslip-pdf`, { method: 'POST', body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
  return body.results.map((r: { month?: { year: number; month: number } | null; items?: PdfResult['items']; error?: string; message?: string; warnings?: string[] }, i: number) => {
    const detected = r.month ? `${MONTH_SHORT[r.month.month - 1]} ${r.month.year}` : null;
    const index = detected ? months.findIndex((m) => m.label === detected) : -1;
    const warnings = [...(r.warnings ?? [])];
    if (detected && index < 0) warnings.push(`This payslip is for ${detected}, outside this financial year; pick a month only if that's wrong.`);
    return { file: files[i], month: index >= 0 ? index : null, detected, items: r.items ?? [], error: r.error, message: r.message, warnings };
  });
}

function parsedFromPdfs(pdfs: PdfResult[]): Parsed | null {
  const usable = pdfs.filter((p) => !p.error && p.month !== null);
  if (!usable.length) return null;
  const byLabel = new Map<string, Parsed['items'][number]>();
  usable.forEach((p) => p.items.forEach(({ label, amount }) => {
    const key = label.toLowerCase();
    if (!byLabel.has(key)) byLabel.set(key, { label, values: Array(12).fill(null) });
    byLabel.get(key)!.values[p.month as number] = amount;
  }));
  return { items: Array.from(byLabel.values()), monthsFound: Array.from(new Set(usable.map((p) => p.month as number))), orientation: 'pdf' };
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
  const [pdfs, setPdfs] = useState<PdfResult[]>([]);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const rowIds = useMemo(() => new Set(rows.map((r) => r.id)), [rows]);
  const pdfParsed = useMemo(() => parsedFromPdfs(pdfs), [pdfs]);

  // New labels (another payslip read, a month chosen) get a guessed target; earlier choices stay.
  useEffect(() => {
    if (!pdfParsed) return;
    setTargets((prev) => Object.fromEntries(pdfParsed.items.map((it) => [it.label, prev[it.label] ?? guessTarget(it.label, rowIds)])));
  }, [pdfParsed, rowIds]);

  const loadPdfs = async (files: File[], replace: boolean) => {
    setBusy(true);
    try {
      const read = await readPdfs(files, password, months);
      setPdfs((prev) => (replace ? read : prev.map((p) => read.find((r) => r.file === p.file) ?? p)));
      setError(null);
    } catch (e) {
      setError(`Couldn't read the PDFs: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const loadFiles = async (list: FileList | null) => {
    const files = Array.from(list ?? []);
    if (!files.length) return;
    const pdfFiles = files.filter(isPdf);
    if (pdfFiles.length) {
      if (pdfFiles.length !== files.length) {
        setError('Choose payslip PDFs, or one CSV file, not both.');
        return;
      }
      setParsed(null);
      setFileName(pdfFiles.length === 1 ? pdfFiles[0].name : `${pdfFiles.length} payslips`);
      await loadPdfs(pdfFiles, true);
      return;
    }
    setPdfs([]);
    await load(files[0]);
  };
  const locked = pdfs.filter((p) => p.error === 'password_required' || p.error === 'wrong_password');
  const monthCounts = pdfs.reduce<Record<number, number>>((acc, p) => (p.month === null || p.error ? acc : { ...acc, [p.month]: (acc[p.month] || 0) + 1 }), {});

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

  const active = parsed ?? pdfParsed;

  const doImport = () => {
    const parsed = active;
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

  const mapped = active ? active.items.filter((it) => targets[it.label] && targets[it.label] !== 'ignore').length : 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div ref={modalRef} className="modal-content" role="dialog" aria-modal="true" aria-labelledby="csv-import-title"
        onClick={(e) => e.stopPropagation()} style={{ maxWidth: '760px', width: '95%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 id="csv-import-title" style={{ margin: 0, fontSize: '15px', color: 'var(--text-primary)' }}>Import payslips (PDF or CSV)</h3>
          <button className="btn btn-secondary" style={{ padding: '4px 6px' }} onClick={onClose} aria-label="Close"><X size={14} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginTop: 0 }}>
          <strong>PDF payslips:</strong> choose one or more (one per month). They're read on this computer and not stored; the pay month
          and each line are picked up for you to check below. Scanned (image) payslips can't be read.{' '}
          <strong>CSV:</strong> months across the top with one row per payslip line (like the template), or one row per month with
          payslip lines as columns (like many payroll exports). Month labels such as "Apr 2026", "April" or "2026-04" are recognised.
        </p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input aria-label="Payslip PDFs or CSV file" type="file" multiple accept=".pdf,application/pdf,.csv,text/csv,text/plain"
            onChange={(e) => { void loadFiles(e.target.files); }} />
          <input aria-label="PDF password" type="password" className="form-input" style={{ width: '200px', padding: '5px 8px', fontSize: '12.5px' }}
            placeholder="PDF password, if any" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          {busy && <span role="status" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Reading…</span>}
        </div>
        {error && <div role="alert" style={{ marginTop: '10px', fontSize: '12.5px', color: '#fca5a5' }}>{error}</div>}

        {pdfs.length > 0 && (
          <table className="custom-table" style={{ marginTop: '12px' }} aria-label="Payslip PDFs">
            <thead><tr><th>File</th><th>Month</th><th style={{ textAlign: 'right' }}>Lines</th><th>Notes</th></tr></thead>
            <tbody>
              {pdfs.map((p, i) => (
                <tr key={`${p.file.name}-${i}`}>
                  <td style={{ fontSize: '12px', wordBreak: 'break-all' }}>{p.file.name}</td>
                  <td>
                    {p.error ? '—' : (
                      <select aria-label={`Month for ${p.file.name}`} className="form-input" style={{ padding: '3px 6px', fontSize: '12px', width: 'auto' }}
                        value={p.month ?? ''} onChange={(e) => setPdfs((all) => all.map((x, j) => (j === i ? { ...x, month: e.target.value === '' ? null : Number(e.target.value) } : x)))}>
                        <option value="">Choose month</option>
                        {months.map((m, k) => <option key={m.label} value={k}>{m.label}</option>)}
                      </select>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{p.error ? '—' : p.items.length}</td>
                  <td style={{ fontSize: '11.5px', color: p.error ? '#fca5a5' : 'var(--text-muted)' }}>
                    {p.error ? p.message : [...p.warnings, ...(p.month !== null && monthCounts[p.month] > 1 ? ['Another payslip has the same month; the later one wins.'] : [])].join(' ') || `Read as ${p.detected}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {locked.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            {locked.length} locked PDF{locked.length === 1 ? '' : 's'}: enter the password above, then
            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '12px' }} disabled={!password || busy}
              onClick={() => { void loadPdfs(locked.map((p) => p.file), false); }}>Unlock and read</button>
          </div>
        )}

        {active && (
          <>
            <div style={{ margin: '12px 0 8px', fontSize: '12px', color: 'var(--text-muted)' }}>
              Found {active.items.length} line(s) and {active.monthsFound.length} month(s)
              ({active.orientation === 'pdf' ? 'from payslip PDFs' : active.orientation === 'months-as-columns' ? 'months across the top' : 'one row per month'}). Check where each line should go:
            </div>
            <table className="custom-table" style={{ marginTop: 0 }}>
              <thead><tr><th>Line in file</th><th>Goes to</th><th style={{ textAlign: 'right' }}>Year total</th></tr></thead>
              <tbody>
                {active.items.map((it) => (
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
