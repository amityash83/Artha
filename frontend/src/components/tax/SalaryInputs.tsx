import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { TaxInputField } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { annualFromMonths, MONTHS, monthsFromAnnual } from './plannerInputs';
import { MonthlySalaryGrid } from './MonthlySalaryGrid';
import { EpfHelper } from './EpfHelper';
import { fieldGrid, formatINR, NumberField, Pill, Section, SelectField } from './taxUi';

const cellInput: React.CSSProperties = { padding: '6px 8px', fontSize: '13px', textAlign: 'right', width: '100%', minWidth: '110px' };
const th: React.CSSProperties = { padding: '8px 10px', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', color: 'var(--text-muted)', textAlign: 'left', borderBottom: '1px solid var(--border-glass)' };
const td: React.CSSProperties = { padding: '6px 10px', fontSize: '13px', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-glass)', verticalAlign: 'middle' };

const toNumber = (raw: string) => {
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

/**
 * Monthly/annual pair. `monthly` is shown as entered when the caller tracks it
 * (salary components, for payroll reconciliation); otherwise it's annual / 12.
 */
const MoneyRow: React.FC<{
  id: string;
  field: TaxInputField;
  annual: number;
  monthly?: number;
  onAnnual: (annual: number) => void;
  onMonthly: (monthly: number) => void;
  onRemove?: () => void;
}> = ({ id, field, annual, monthly, onAnnual, onMonthly, onRemove }) => {
  const shownMonthly = monthly ?? Math.round(annual / MONTHS);
  const roundingGap = monthly !== undefined ? annual - monthly * MONTHS : 0;
  return (
    <tr>
      <td style={td}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-primary)' }}>{field.label}</span>
          {field.variable && <Pill color="#a78bfa" title="Variable pay">Variable</Pill>}
          {field.kind === 'custom' && <Pill color="#94a3b8" title="Added by you; taxed as a fully taxable cash component">Custom</Pill>}
        </div>
        {field.help && <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{field.help}</div>}
      </td>
      <td style={td}>
        <input aria-label={`${field.label} monthly`} id={`${id}-m`} type="number" min={0} className="form-input" style={cellInput}
          value={shownMonthly} onChange={(e) => onMonthly(toNumber(e.target.value))} />
      </td>
      <td style={td}>
        <input aria-label={`${field.label} annual`} id={`${id}-a`} type="number" min={0} className="form-input" style={cellInput}
          value={annual} onChange={(e) => onAnnual(toNumber(e.target.value))} />
      </td>
      <td style={{ ...td, fontSize: '11.5px', whiteSpace: 'nowrap' }}>
        {roundingGap === 0 ? <span style={{ color: 'var(--text-muted)' }}>Reconciled</span> : (
          <span style={{ color: Math.abs(roundingGap) > MONTHS ? 'var(--warning)' : 'var(--text-muted)' }}
            title="Annual minus monthly × 12">
            {Math.abs(roundingGap) > MONTHS ? 'Mismatch' : 'Rounding'} {roundingGap > 0 ? '+' : ''}{formatINR(roundingGap)}
          </span>
        )}
      </td>
      <td style={{ ...td, width: '36px' }}>
        {onRemove && (
          <button aria-label={`Remove ${field.label}`} onClick={onRemove} className="btn btn-secondary" style={{ padding: '4px 6px' }}>
            <Trash2 size={13} />
          </button>
        )}
      </td>
    </tr>
  );
};

const MoneyTable: React.FC<{ caption: string; children: React.ReactNode; totals?: { monthly: number; annual: number } }> = (
  { caption, children, totals },
) => (
  <div style={{ overflowX: 'auto' }}>
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <caption style={{ textAlign: 'left', fontSize: 0, height: 0 }}>{caption}</caption>
      <thead>
        <tr>
          <th style={th}>Component</th>
          <th style={{ ...th, textAlign: 'right' }}>Monthly (₹)</th>
          <th style={{ ...th, textAlign: 'right' }}>Annual (₹)</th>
          <th style={th}>Check</th>
          <th style={th} />
        </tr>
      </thead>
      <tbody>{children}</tbody>
      {totals && (
        <tfoot>
          <tr>
            <td style={{ ...td, fontWeight: 700, color: 'var(--text-primary)' }}>Total</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{formatINR(totals.monthly)}</td>
            <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>{formatINR(totals.annual)}</td>
            <td style={td} colSpan={2} />
          </tr>
        </tfoot>
      )}
    </table>
  </div>
);

const slug = (label: string) => label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

export const SalaryInputs: React.FC<PlannerChildProps> = ({ inputs, update, metadata, result, financialYear }) => {
  const monthlyOn = Boolean(inputs.monthly?.enabled);
  const setMode = (mode: 'annual' | 'monthly') => {
    if (mode === 'monthly' && !monthlyOn) {
      const earlier = inputs.monthly?.months?.length === MONTHS ? inputs.monthly.months : null;
      // Annual figures may have changed since the months were last used: let the user choose.
      const reuse = earlier && window.confirm(
        'Use your earlier month-by-month entries?\n\nOK: keep them (any annual changes made since are ignored).\nCancel: start again from the current annual figures.');
      const months = reuse && earlier ? earlier : monthsFromAnnual(inputs, financialYear);
      update('monthly', { enabled: true, months });
    } else if (mode === 'annual' && monthlyOn) {
      // Carry the months' totals into the annual fields so nothing entered is lost.
      const a = annualFromMonths(inputs);
      (['salary', 'salary_monthly', 'payroll_deductions', 'employer_contributions', 'hra'] as const).forEach((k) => update(k, a[k]));
      update('prepaid.tds', a.prepaid.tds);
      update('monthly', { ...inputs.monthly!, enabled: false });
    }
  };
  const [newComponent, setNewComponent] = useState('');
  const known = new Set(metadata.salary_components.map((f) => f.key));
  const customFields: TaxInputField[] = Object.keys(inputs.salary)
    .filter((k) => !known.has(k))
    .map((k) => ({ key: k, label: k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), kind: 'custom' }));
  const salaryFields = [...metadata.salary_components, ...customFields];
  const monthly = inputs.salary_monthly ?? {};

  const setSalaryAnnual = (key: string, annual: number) => {
    update(`salary.${key}`, annual);
    update(`salary_monthly.${key}`, Math.round(annual / MONTHS));
  };
  const setSalaryMonthly = (key: string, m: number) => {
    update(`salary_monthly.${key}`, m);
    update(`salary.${key}`, m * MONTHS);
  };
  const addComponent = () => {
    const key = slug(newComponent);
    if (!key || key in inputs.salary) return;
    update(`salary.${key}`, 0);
    update(`salary_monthly.${key}`, 0);
    setNewComponent('');
  };
  const removeComponent = (key: string) => {
    const { [key]: _removed, ...rest } = inputs.salary;
    void _removed;
    update('salary', rest);
  };

  const salaryMonthlyTotal = salaryFields.reduce((s, f) => s + (monthly[f.key] ?? Math.round((inputs.salary[f.key] || 0) / MONTHS)), 0);
  const salaryAnnualTotal = salaryFields.reduce((s, f) => s + (inputs.salary[f.key] || 0), 0);

  const simpleRows = (section: 'payroll_deductions' | 'employer_contributions', fields: TaxInputField[]) => fields.map((f) => (
    <MoneyRow key={f.key} id={`${section}-${f.key}`} field={f} annual={inputs[section][f.key] || 0}
      onAnnual={(a) => update(`${section}.${f.key}`, a)} onMonthly={(m) => update(`${section}.${f.key}`, m * MONTHS)} />
  ));

  const p = inputs.profile;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Section title="Profile" subtitle="Age and residency decide which old-regime slabs, rebates and 80TTB apply.">
        <div style={fieldGrid}>
          <NumberField id="tp-age" label="Age" value={p.age} min={0} max={130} onChange={(v) => update('profile.age', Math.round(v))} />
          <SelectField id="tp-residency" label="Residential status" value={p.residential_status}
            options={[{ value: 'resident', label: 'Resident' }, { value: 'rnor', label: 'Resident but not ordinarily resident' }, { value: 'non_resident', label: 'Non-resident' }]}
            onChange={(v) => update('profile.residential_status', v)} />
          <SelectField id="tp-employer" label="Employer type" value={p.employer_type}
            options={[{ value: 'private', label: 'Private sector' }, { value: 'government', label: 'Central / State government' }]}
            onChange={(v) => update('profile.employer_type', v)} help="Sets the old-regime employer NPS limit." />
          <SelectField id="tp-selected-regime" label="Regime your employer deducts TDS under" value={p.selected_regime ?? ''}
            options={[{ value: '', label: 'Not known' }, { value: 'new', label: 'New regime' }, { value: 'old', label: 'Old regime' }]}
            onChange={(v) => update('profile.selected_regime', v || null)} help="Used to reconcile TDS against the computed liability." />
        </div>
      </Section>

      <Section title="How do you want to enter salary?"
        subtitle={monthlyOn
          ? 'Month by month: enter each payslip (actual) and expected months (projected). Bonuses, raises, rent and TDS can differ by month; the year is the total.'
          : 'Annual (CTC): one figure per component for the year. Switch to month by month if your pay varies (quarterly or performance bonus, a mid-year raise, joining mid-year).'}>
        <div role="radiogroup" aria-label="Salary entry mode" style={{ display: 'flex', gap: '8px' }}>
          {(['annual', 'monthly'] as const).map((mode) => {
            const active = (mode === 'monthly') === monthlyOn;
            return (
              <button key={mode} role="radio" aria-checked={active} onClick={() => setMode(mode)} className={active ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ padding: '6px 14px', fontSize: '12.5px' }}>
                {mode === 'annual' ? 'Annual (CTC)' : 'Month by month'}
              </button>
            );
          })}
        </div>
      </Section>

      {monthlyOn ? (
        <MonthlySalaryGrid inputs={inputs} financialYear={financialYear} metadata={metadata} result={result}
          setMonths={(months) => update('monthly', { enabled: true, months })} />
      ) : (
      <>
      <Section title="Salary structure" subtitle="Enter either column; the other is calculated. Annual is what's taxed. Monthly figures are kept as entered so rounding against the annual amount is visible.">
        <MoneyTable caption="Salary components" totals={{ monthly: salaryMonthlyTotal, annual: salaryAnnualTotal }}>
          {salaryFields.map((f) => (
            <MoneyRow key={f.key} id={`salary-${f.key}`} field={f} annual={inputs.salary[f.key] || 0} monthly={monthly[f.key]}
              onAnnual={(a) => setSalaryAnnual(f.key, a)} onMonthly={(m) => setSalaryMonthly(f.key, m)}
              onRemove={f.kind === 'custom' ? () => removeComponent(f.key) : undefined} />
          ))}
        </MoneyTable>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="tp-new-component" className="form-label" style={{ fontSize: '12px' }}>Add a component</label>
          <input id="tp-new-component" className="form-input" style={{ padding: '6px 10px', fontSize: '13px', width: '240px' }}
            placeholder="e.g. Car allowance" value={newComponent} onChange={(e) => setNewComponent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addComponent(); }} />
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
            onClick={addComponent} disabled={!slug(newComponent)}>
            <Plus size={13} /> Add
          </button>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Added components are taxed as ordinary cash salary in both regimes.</span>
        </div>
      </Section>

      <Section title="Payroll deductions" subtitle="Deducted from your cash pay. EPF/VPF also count towards 80C in the old regime automatically.">
        <MoneyTable caption="Payroll deductions">{simpleRows('payroll_deductions', metadata.payroll_deductions)}</MoneyTable>
        <EpfHelper inputs={inputs} financialYear={financialYear} monthly={false}
          onApply={(s) => update('payroll_deductions.employee_epf', s.annual)} />
      </Section>

      <Section title="Employer contributions" subtitle="Paid by your employer into retirement accounts, not as cash. How NPS is funded (restructured from CTC or added on top) is modelled in the Corporate NPS optimiser (Phase 3).">
        <MoneyTable caption="Employer contributions">{simpleRows('employer_contributions', metadata.employer_contributions)}</MoneyTable>
      </Section>
      </>
      )}

      <Section title="Other income" subtitle="Annual amounts.">
        <div style={fieldGrid}>
          {metadata.other_income.map((f) => (
            <NumberField key={f.key} id={`oi-${f.key}`} label={f.label} value={inputs.other_income[f.key] || 0}
              onChange={(v) => update(`other_income.${f.key}`, v)} help={f.help} />
          ))}
          {metadata.capital_gains.map((f) => (
            <NumberField key={f.key} id={`cg-${f.key}`} label={f.label} value={inputs.capital_gains[f.key] || 0}
              onChange={(v) => update(`capital_gains.${f.key}`, v)} help={f.help} />
          ))}
        </div>
      </Section>

      <Section title="Tax already paid" subtitle="Used to work out tax still payable or refundable.">
        <div style={fieldGrid}>
          {monthlyOn
            ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <span className="form-label" style={{ fontSize: '12px' }}>TDS deducted so far</span>
                <strong style={{ fontSize: '14px', color: 'var(--text-primary)', padding: '8px 0' }}>{formatINR(result?.inputs.prepaid.tds ?? 0)}</strong>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total of the actual months' TDS in the grid above.</span>
              </div>
            )
            : <NumberField id="tp-tds" label="TDS deducted this year" value={inputs.prepaid.tds} onChange={(v) => update('prepaid.tds', v)} />}
          <NumberField id="tp-advance" label="Advance tax paid" value={inputs.prepaid.advance_tax} onChange={(v) => update('prepaid.advance_tax', v)} />
        </div>
      </Section>
    </div>
  );
};
