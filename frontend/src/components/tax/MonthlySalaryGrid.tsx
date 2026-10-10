import React, { useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed, Download, FileUp, Wand2 } from 'lucide-react';
import { TaxComputeResult, TaxInputMetadata, TaxMonthInput, TaxPlannerInputs, TaxRegimeKey } from '../../types';
import { buildRows, GridRow, parseAmount } from './monthlyRows';
import { formatINR, Pill, Section } from './taxUi';
import { MONTHS, monthsFromAnnual } from './plannerInputs';
import { CsvImportDialog } from './CsvImportDialog';

const cellInput: React.CSSProperties = {
  width: '92px', padding: '4px 6px', fontSize: '12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
};
const th: React.CSSProperties = { padding: '6px 6px', fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' };
const stickyLabel: React.CSSProperties = {
  position: 'sticky', left: 0, background: 'var(--bg-secondary)', zIndex: 1, padding: '4px 10px 4px 0',
  fontSize: '12px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', minWidth: '210px',
};

interface Props {
  inputs: TaxPlannerInputs;
  financialYear: string;
  metadata: TaxInputMetadata;
  result: TaxComputeResult | null;
  setMonths: (months: TaxMonthInput[]) => void;
}

export const MonthlySalaryGrid: React.FC<Props> = ({ inputs, financialYear, metadata, result, setMonths }) => {
  const months = inputs.monthly?.months ?? [];
  const rows = useMemo(() => buildRows(metadata, months), [metadata, months]);
  const [copyFrom, setCopyFrom] = useState(0);
  const [raiseFrom, setRaiseFrom] = useState(3);
  const [raisePct, setRaisePct] = useState(10);
  const [bonusAmount, setBonusAmount] = useState(100000);
  const [bonusWhen, setBonusWhen] = useState('quarterly');
  const [actualUpTo, setActualUpTo] = useState(-1);
  const [showImport, setShowImport] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const edit = (fn: (ms: TaxMonthInput[]) => TaxMonthInput[], message?: string) => {
    setMonths(fn(months.map((m) => ({ ...m }))));
    setNotice(message ?? null);
  };
  const setCell = (row: GridRow, i: number, v: number | null) => edit((ms) => ms.map((m, j) => (j === i ? row.set(m, v) : m)));

  // Paste a block copied from a spreadsheet (tab/newline separated) starting at this cell.
  const onPaste = (rowIndex: number, col: number) => (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!/[\t\n]/.test(text.trim())) return; // single value: let the input handle it
    e.preventDefault();
    const block = text.replace(/\r/g, '').replace(/\n$/, '').split('\n').map((line) => line.split('\t'));
    let filled = 0;
    edit((ms) => {
      block.forEach((cells, r) => {
        const row = rows[rowIndex + r];
        if (!row) return;
        cells.forEach((cell, c) => {
          const i = col + c;
          if (i >= MONTHS) return;
          const v = parseAmount(cell);
          ms[i] = row.set(ms[i], row.nullable ? v : v ?? 0);
          filled++;
        });
      });
      return ms;
    });
    setNotice(`Pasted ${filled} value${filled === 1 ? '' : 's'}.`);
  };

  const copyForward = () => edit((ms) => ms.map((m, i) => (i > copyFrom && m.status === 'projected'
    ? { ...ms[copyFrom], label: m.label, status: m.status, tds: null } : m)),
  `Copied ${months[copyFrom]?.label} to the later projected months.`);

  const applyRaise = () => {
    const fixed = rows.filter((r) => r.group === 'Earnings' && !r.variable);
    // Actual months are payslip facts: a raise only changes projected months.
    edit((ms) => ms.map((m, i) => (i < raiseFrom || m.status === 'actual' ? m : fixed.reduce((acc, r) => r.set(acc, Math.round((r.get(acc) || 0) * (1 + raisePct / 100) * 100) / 100), m))),
      `Raised fixed pay by ${raisePct}% in projected months from ${months[raiseFrom]?.label}. Actual months, bonus and incentives were left alone.`);
  };

  const addBonus = () => {
    const targets = bonusWhen === 'quarterly' ? [2, 5, 8, 11] : [Number(bonusWhen)];
    const bonus = rows.find((r) => r.id === 'salary.bonus');
    if (!bonus) return;
    edit((ms) => ms.map((m, i) => (targets.includes(i) ? bonus.set(m, bonusAmount) : m)),
      `Set performance bonus to ${formatINR(bonusAmount)} in ${targets.map((t) => months[t]?.label.split(' ')[0]).join(', ')}.`);
  };

  const markActual = () => edit((ms) => ms.map((m, i) => ({ ...m, status: i <= actualUpTo ? 'actual' : 'projected' })),
    actualUpTo < 0 ? 'All months are projections.' : `Marked ${months[0]?.label} to ${months[actualUpTo]?.label} as actual.`);

  const resetFromCtc = () => {
    if (!window.confirm('Replace every month with the annual (CTC) figures divided by 12? Entered values will be lost.')) return;
    setMonths(monthsFromAnnual({ ...inputs, monthly: null }, financialYear));
    setNotice('Reset every month from the annual figures.');
  };

  const setRowAll = (row: GridRow) => {
    const raw = window.prompt(`Set "${row.label}" for every projected month to:`, String(row.get(months.find((m) => m.status === 'projected') ?? months[0]) ?? ''));
    if (raw === null) return;
    const v = parseAmount(raw);
    edit((ms) => ms.map((m) => (m.status === 'projected' ? row.set(m, row.nullable ? v : v ?? 0) : m)), `Updated "${row.label}" in every projected month.`);
  };

  const downloadTemplate = () => {
    const header = ['Item', ...months.map((m) => m.label)];
    const lines = [header, ...rows.map((r) => [r.label, ...months.map((m) => (r.get(m) ?? '').toString())])];
    const csv = lines.map((l) => l.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `artha-payslips-${financialYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const regime: TaxRegimeKey = inputs.profile.selected_regime ?? result?.comparison.best_regime ?? 'new';
  const view = result?.regimes[regime].monthly ?? null;
  const groups = Array.from(new Set(rows.map((r) => r.group)));
  const monthOptions = months.map((m, i) => <option key={m.label} value={i}>{m.label}</option>);
  const smallSelect: React.CSSProperties = { padding: '4px 6px', fontSize: '12px', width: 'auto' };
  const smallBtn: React.CSSProperties = { padding: '4px 10px', fontSize: '11.5px', display: 'inline-flex', gap: '4px', alignItems: 'center' };
  const tool: React.CSSProperties = { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: 'var(--text-secondary)' };

  return (
    <>
      <Section title="Quick fill" subtitle="Shortcuts for the grid below. Tip: copy cells from a spreadsheet and paste them into any cell; the block fills from there.">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '10px 18px' }}>
          <div style={tool}>
            <Wand2 size={13} /> Copy
            <select aria-label="Month to copy" className="form-input" style={smallSelect} value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))}>{monthOptions}</select>
            to later projected months
            <button className="btn btn-secondary" style={smallBtn} onClick={copyForward}>Apply</button>
          </div>
          <div style={tool}>
            Raise fixed pay by
            <input aria-label="Raise percent" type="number" className="form-input" style={{ ...smallSelect, width: '64px' }} value={raisePct} onChange={(e) => setRaisePct(Number(e.target.value) || 0)} />
            % from
            <select aria-label="Raise from month" className="form-input" style={smallSelect} value={raiseFrom} onChange={(e) => setRaiseFrom(Number(e.target.value))}>{monthOptions}</select>
            <button className="btn btn-secondary" style={smallBtn} onClick={applyRaise}>Apply</button>
          </div>
          <div style={tool}>
            Bonus of
            <input aria-label="Bonus amount" type="number" className="form-input" style={{ ...smallSelect, width: '96px' }} value={bonusAmount} onChange={(e) => setBonusAmount(Number(e.target.value) || 0)} />
            <select aria-label="Bonus timing" className="form-input" style={smallSelect} value={bonusWhen} onChange={(e) => setBonusWhen(e.target.value)}>
              <option value="quarterly">each quarter (Jun, Sep, Dec, Mar)</option>
              {months.map((m, i) => <option key={m.label} value={String(i)}>in {m.label}</option>)}
            </select>
            <button className="btn btn-secondary" style={smallBtn} onClick={addBonus}>Apply</button>
          </div>
          <div style={tool}>
            Payslips received up to
            <select aria-label="Actual up to month" className="form-input" style={smallSelect} value={actualUpTo} onChange={(e) => setActualUpTo(Number(e.target.value))}>
              <option value={-1}>none yet</option>{monthOptions}
            </select>
            <button className="btn btn-secondary" style={smallBtn} onClick={markActual}>Mark actual</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-secondary" style={smallBtn} onClick={() => setShowImport(true)}><FileUp size={12} /> Import CSV</button>
          <button className="btn btn-secondary" style={smallBtn} onClick={downloadTemplate}><Download size={12} /> Download as CSV (template)</button>
          <button className="btn btn-secondary" style={smallBtn} onClick={resetFromCtc}>Reset from annual (CTC)</button>
          {notice && <span role="status" style={{ fontSize: '12px', color: 'var(--success)' }}>{notice}</span>}
        </div>
      </Section>

      <Section title={`Month by month, FY ${financialYear}`}
        subtitle="Click a month's heading to switch it between actual (from your payslip) and projected. The year's tax uses the totals; TDS for projected months is worked out below.">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ ...stickyLabel, ...th }} />
                {months.map((m, i) => (
                  <th key={m.label} style={th}>
                    <button
                      onClick={() => edit((ms) => ms.map((x, j) => (j === i ? { ...x, status: x.status === 'actual' ? 'projected' : 'actual' } : x)))}
                      title={m.status === 'actual' ? 'Actual (from payslip). Click to mark projected.' : 'Projected. Click to mark actual.'}
                      aria-pressed={m.status === 'actual'}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.status === 'actual' ? '#10b981' : 'var(--text-muted)', display: 'inline-flex', gap: '4px', alignItems: 'center', fontSize: '11px', fontWeight: 600 }}>
                      {m.status === 'actual' ? <CheckCircle2 size={11} /> : <CircleDashed size={11} />}{m.label}
                    </button>
                  </th>
                ))}
                <th style={{ ...th, textAlign: 'right' }}>Year</th>
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group}>
                <tr><td colSpan={MONTHS + 2} style={{ ...stickyLabel, paddingTop: '10px', fontSize: '11px', fontWeight: 700, color: 'var(--accent-light)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{group}</td></tr>
                {rows.filter((r) => r.group === group).map((row) => {
                  const rowIndex = rows.indexOf(row);
                  const total = months.reduce((t, m) => t + (row.get(m) || 0), 0);
                  return (
                    <tr key={row.id}>
                      <td style={stickyLabel}>
                        <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {row.label}
                          {row.variable && <Pill color="#a78bfa">Variable</Pill>}
                          <button onClick={() => setRowAll(row)} title="Set every projected month" aria-label={`Set ${row.label} for every projected month`}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '11px', padding: 0 }}>⇉</button>
                        </span>
                      </td>
                      {months.map((m, i) => {
                        const v = row.get(m);
                        // TDS for projected months is the engine's projection, not an input.
                        if (row.id === 'tds' && m.status === 'projected') {
                          const projected = view?.months[i]?.tds;
                          return (
                            <td key={m.label} style={{ padding: '2px 3px' }}>
                              <input aria-label={`${row.label}, ${m.label} (projected)`} className="form-input" readOnly tabIndex={-1}
                                style={{ ...cellInput, color: 'var(--info)', opacity: 0.8, cursor: 'default' }}
                                title="Projected by the engine: tax still due after actual TDS, spread over the remaining months. Mark the month actual to enter its payslip TDS."
                                value={projected === undefined ? '' : String(Math.round(projected))} />
                            </td>
                          );
                        }
                        return (
                          <td key={m.label} style={{ padding: '2px 3px', background: m.status === 'actual' ? 'rgba(16,185,129,0.04)' : undefined }}>
                            <input
                              aria-label={`${row.label}, ${m.label}`}
                              className="form-input"
                              style={cellInput}
                              inputMode="decimal"
                              placeholder={row.nullable ? '—' : '0'}
                              value={v === null || v === undefined ? '' : String(v)}
                              onChange={(e) => setCell(row, i, row.nullable ? parseAmount(e.target.value) : parseAmount(e.target.value) ?? 0)}
                              onPaste={onPaste(rowIndex, i)}
                            />
                          </td>
                        );
                      })}
                      <td style={{ padding: '2px 8px', fontSize: '12px', textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {formatINR(total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tbody>
              <tr>
                <td style={stickyLabel}>Metro city that month</td>
                {months.map((m, i) => (
                  <td key={m.label} style={{ padding: '2px 3px' }}>
                    <select aria-label={`Metro, ${m.label}`} className="form-input" style={{ ...cellInput, textAlign: 'left' }}
                      value={m.metro === null ? '' : m.metro ? 'yes' : 'no'}
                      onChange={(e) => edit((ms) => ms.map((x, j) => (j === i ? { ...x, metro: e.target.value === '' ? null : e.target.value === 'yes' } : x)))}>
                      <option value="">As profile</option>
                      <option value="yes">Metro</option>
                      <option value="no">Non-metro</option>
                    </select>
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      </Section>

      {view && (
        <Section title={`Take-home and TDS by month (${regime === 'new' ? 'new' : 'old'} regime)`}
          subtitle={view.method}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px' }}>
            {[
              ['TDS deducted so far', formatINR(view.tds_paid_to_date), `${view.actual_months} actual month(s)`],
              ['Tax for the year', formatINR(result!.regimes[regime].total_tax), 'Computed from the 12 months'],
              ['Still to be deducted', formatINR(view.tax_still_due), `${view.projected_months} projected month(s)`],
              ['Expected TDS per remaining month', formatINR(view.suggested_tds_per_remaining_month), 'How an employer would spread it'],
              ...(view.expected_refund > 0 ? [['Expected refund', formatINR(view.expected_refund), 'More deducted than the year needs']] : []),
            ].map(([label, value, sub]) => (
              <div key={label} className="glass-card" style={{ padding: '10px 12px' }}>
                <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{value}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>
              </div>
            ))}
          </div>
          {view.missing_tds_months.length > 0 && (
            <div style={{ fontSize: '12px', color: 'var(--warning)' }}>
              No TDS entered for actual month(s): {view.missing_tds_months.join(', ')}. They count as zero TDS paid.
            </div>
          )}
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ marginTop: 0 }}>
              <thead><tr><th>Month</th><th style={{ textAlign: 'right' }}>Gross cash</th><th style={{ textAlign: 'right' }}>Payroll deductions</th><th style={{ textAlign: 'right' }}>TDS</th><th style={{ textAlign: 'right' }}>Take-home</th><th style={{ textAlign: 'right' }}>Employer NPS</th></tr></thead>
              <tbody>
                {view.months.map((m) => (
                  <tr key={m.label}>
                    <td>{m.label} <Pill color={m.status === 'actual' ? '#10b981' : '#94a3b8'}>{m.status}</Pill></td>
                    <td style={{ textAlign: 'right' }}>{formatINR(m.gross_cash)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(m.payroll_deductions)}</td>
                    <td style={{ textAlign: 'right' }}>
                      {formatINR(m.tds)} {m.tds_basis !== 'actual' && <Pill color={m.tds_basis === 'missing' ? '#f59e0b' : '#60a5fa'}>{m.tds_basis}</Pill>}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-primary)', fontWeight: 600 }}>{formatINR(m.in_hand)}</td>
                    <td style={{ textAlign: 'right' }}>{formatINR(m.employer_nps)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {showImport && (
        <CsvImportDialog rows={rows} months={months} metadata={metadata}
          onClose={() => setShowImport(false)}
          onImport={(next, summary) => { setMonths(next); setNotice(summary); setShowImport(false); }} />
      )}
    </>
  );
};
