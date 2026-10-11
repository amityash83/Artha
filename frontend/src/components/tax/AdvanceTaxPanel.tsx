import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TaxAdvanceInstalment, TaxAdvancePayment, TaxAdvanceSchedule } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { toEngineInputs } from './plannerInputs';
import { EmptyState, ErrorBanner, formatINR, Freshness, NumberField, Pill, Section, VerificationBadge } from './taxUi';
import { useTaxPost } from './useTaxPost';

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const STATUS: Record<TaxAdvanceInstalment['status'], [string, string]> = {
  met: ['Paid on time', '#10b981'],
  safe_harbour: ['Within the safe harbour', '#10b981'],
  short: ['Paid short', '#f59e0b'],
  upcoming: ['Upcoming', '#60a5fa'],
  not_required: ['Not required', '#94a3b8'],
};

/** Advance tax for the year: instalments, dated payments and interest, from the rule set. */
export const AdvanceTaxPanel: React.FC<PlannerChildProps> = ({ inputs, update, financialYear }) => {
  const [ownTds, setOwnTds] = useState<number | null>(null);
  const payments: TaxAdvancePayment[] = inputs.advance_tax_payments ?? [];
  const { data, error, stale } = useTaxPost<TaxAdvanceSchedule>('/api/tax/advance-tax', {
    financial_year: financialYear, inputs: toEngineInputs(inputs), expected_tds: ownTds,
  }, !!financialYear);

  const setPayments = (next: TaxAdvancePayment[]) => update('advance_tax_payments', next);
  const today = new Date().toISOString().slice(0, 10);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <EmptyState>Working out advance tax…</EmptyState>;
  if (!data.available) return <ErrorBanner message={data.reason} />;
  const cell: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

  return (
    <Freshness stale={stale}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {[
            [`Tax for the year (${data.regime} regime)`, data.total_tax, ''],
            ['TDS expected', data.expected_tds ?? 0, data.tds_basis === 'entered' ? 'As you entered' : 'Tax on salary alone'],
            ['Due as advance tax', data.advance_tax_liability ?? 0, data.required ? `Over the ${formatINR(data.threshold)} threshold` : 'Not required'],
            ['Paid so far', data.paid_total ?? 0, `${payments.length} payment${payments.length === 1 ? '' : 's'}`],
            ['Interest for late instalments', data.deferment_interest_total ?? 0, 'So far this year'],
          ].map(([label, value, sub]) => (
            <div key={label as string} className="glass-card" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>{label}</div>
              <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatINR(value as number)}</div>
              {sub && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</div>}
            </div>
          ))}
        </div>

        <div role="note" style={{
          padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5, color: 'var(--text-secondary)',
          background: data.required ? 'var(--info-bg)' : 'rgba(16,185,129,0.08)', border: `1px solid ${data.required ? 'rgba(59,130,246,0.3)' : 'rgba(16,185,129,0.3)'}`,
        }}>
          <strong style={{ color: 'var(--text-primary)' }}>{data.required ? 'Advance tax applies. ' : 'No advance tax needed. '}</strong>
          {data.reason}
          {data.next_due && <> Next: <strong style={{ color: 'var(--text-primary)' }}>{formatINR(data.next_due.still_to_pay)}</strong> by {fmtDate(data.next_due.due_date)}.</>}
          {data.return_due_date && <> Return due {fmtDate(data.return_due_date)}.</>}
        </div>

        <Section title="Instalments" subtitle={<>The share of the year&apos;s advance tax due by each date, what you&apos;d paid by then, and interest on any shortfall. <VerificationBadge level={data.rule?.verification} /> {[data.rule?.legacy_section, data.rule?.act_2025_section].filter(Boolean).join(' / ')}</>}>
          <div style={{ overflowX: 'auto' }}>
            <table className="custom-table" style={{ marginTop: 0 }}>
              <thead><tr>
                <th>Due by</th><th style={cell}>Share</th><th style={cell}>Due by then</th><th style={cell}>Paid by then</th>
                <th style={cell}>Still to pay</th><th>Status</th><th style={cell}>Interest</th>
              </tr></thead>
              <tbody>
                {data.instalments?.map((i) => (
                  <tr key={i.due_date}>
                    <td>{fmtDate(i.due_date)}</td>
                    <td style={cell}>{i.cumulative_pct}%</td>
                    <td style={cell}>{formatINR(i.cumulative_due)}</td>
                    <td style={cell}>{formatINR(i.paid_by_due_date)}</td>
                    <td style={{ ...cell, color: 'var(--text-primary)', fontWeight: 600 }}>{i.still_to_pay > 0 ? formatINR(i.still_to_pay) : '—'}</td>
                    <td><Pill color={STATUS[i.status][1]}>{STATUS[i.status][0]}</Pill></td>
                    <td style={cell} title={i.status === 'upcoming' ? 'If nothing more is paid by this date' : undefined}>
                      {i.deferment_interest > 0 ? formatINR(i.deferment_interest) : i.interest_if_unpaid > 0 ? <span style={{ color: 'var(--text-muted)' }}>{formatINR(i.interest_if_unpaid)} if missed</span> : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {data.year_end_shortfall && (
            <div style={{ fontSize: '12.5px', color: data.year_end_shortfall.final ? 'var(--warning)' : 'var(--text-muted)' }}>
              {data.year_end_shortfall.explanation} unpaid {formatINR(data.year_end_shortfall.unpaid)}, about {formatINR(data.year_end_shortfall.interest_per_month)} a month from {fmtDate(data.year_end_shortfall.from)}.
            </div>
          )}
        </Section>

        <Section title="Payments made" subtitle="Each advance-tax challan with its date. Their total is used as advance tax paid everywhere in the planner.">
          {payments.length === 0 && <div style={{ fontSize: '12.5px', color: 'var(--text-muted)' }}>No payments entered yet.</div>}
          {payments.map((p, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input aria-label={`Payment ${i + 1} date`} type="date" className="form-input" style={{ width: 'auto', padding: '5px 8px', fontSize: '12.5px' }}
                value={p.date} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, date: e.target.value } : x)))} />
              <input aria-label={`Payment ${i + 1} amount`} type="number" min={0} className="form-input" style={{ width: '150px', padding: '5px 8px', fontSize: '12.5px', textAlign: 'right' }}
                value={p.amount} onChange={(e) => setPayments(payments.map((x, j) => (j === i ? { ...x, amount: Math.max(parseFloat(e.target.value) || 0, 0) } : x)))} />
              <button className="btn btn-secondary" style={{ padding: '4px 8px' }} aria-label={`Remove payment ${i + 1}`}
                onClick={() => setPayments(payments.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
            </div>
          ))}
          <div>
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '12px', display: 'inline-flex', gap: '6px', alignItems: 'center' }}
              onClick={() => setPayments([...payments, { date: today, amount: data.next_due?.still_to_pay ?? 0 }])}>
              <Plus size={12} /> Add a payment
            </button>
          </div>
        </Section>

        <Section title="TDS for the year" subtitle="By default the planner assumes your employer's TDS covers the tax on your salary, so advance tax covers the rest (interest, rent, dividends, gains).">
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12.5px', color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={ownTds !== null} onChange={(e) => setOwnTds(e.target.checked ? Math.round(data.expected_tds ?? 0) : null)} />
            Use my own TDS figure (e.g. banks also deduct TDS on deposits)
          </label>
          {ownTds !== null && (
            <NumberField id="adv-own-tds" label="TDS expected for the whole year" value={ownTds} onChange={(v) => setOwnTds(v)}
              help="Employer TDS plus any other TDS (Form 26AS / AIS shows what's been deducted so far)." />
          )}
        </Section>

        <Section title="About these numbers">
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            {data.notes?.map((n) => <li key={n}>{n}</li>)}
            {data.rule?.note && <li>{data.rule.note}</li>}
          </ul>
        </Section>
      </div>
    </Freshness>
  );
};
