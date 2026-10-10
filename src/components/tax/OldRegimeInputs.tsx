import React from 'react';
import { TaxDeductionField } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { getIn } from './plannerInputs';
import { EmptyState, fieldGrid, formatINR, NumberField, Pill, Section, SelectField, VerificationBadge } from './taxUi';
import { regimeItem, sectionLabel, useRuleSetContent } from './useRuleSetContent';

const HRA_COMPONENT_LABELS: Record<string, string> = {
  actual_hra_received: 'Actual HRA received',
  rent_paid_minus_pct_of_salary: 'Rent paid minus % of salary',
  pct_of_salary: 'Metro / non-metro % of salary',
};

// Which computed deduction(s) a metadata group feeds into.
const GROUP_RESULT_KEYS: Record<string, string[]> = {
  '80C': ['80C'],
  NPS: ['80CCD1B'],
  '80D': ['80D'],
  Other: ['80E', '80G', 'other_old'],
};

export const DeductionInput: React.FC<{
  field: TaxDeductionField;
  value: unknown;
  onChange: (value: unknown) => void;
}> = ({ field, value, onChange }) => {
  const id = `ded-${field.path.replace(/\./g, '-')}`;
  if (field.type === 'boolean') {
    return (
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: 'var(--text-secondary)', paddingTop: '20px' }}>
        <input id={id} type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {field.label}
      </label>
    );
  }
  return (
    <NumberField id={id} label={field.label} value={Number(value) || 0} onChange={onChange}
      help={[field.help, field.user_asserted ? 'Taken as entered; eligibility is not checked.' : ''].filter(Boolean).join(' ')} />
  );
};

export const OldRegimeInputs: React.FC<PlannerChildProps> = ({ inputs, result, update, metadata }) => {
  const rules = useRuleSetContent(result?.rule_set.rule_set_id, result?.rule_set.version);
  const old = result?.regimes.old;
  const hraItem = regimeItem(rules, 'old', 'hra');
  const hraRules = hraItem?.value as { metro_cities?: string[] } | undefined;
  const deductionsItem = regimeItem(rules, 'old', 'deductions');
  const allowed = new Set(((deductionsItem?.value as { allowed?: string[] })?.allowed) ?? []);
  const p = inputs.profile;

  const groups = metadata.deduction_fields.reduce<Record<string, TaxDeductionField[]>>((acc, f) => {
    if (f.rule_key === 'other_new') return acc;
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Section
        title="House Rent Allowance"
        subtitle={<>Old regime only. Exempt amount is the least of three figures, over the months you paid rent. {sectionLabel(hraItem)} <VerificationBadge level={hraItem?.verification} /></>}
      >
        <div style={fieldGrid}>
          <NumberField id="hra-rent" label="Rent paid per month" value={inputs.hra.rent_paid_monthly} onChange={(v) => update('hra.rent_paid_monthly', v)} />
          <NumberField id="hra-months" label="Months rent was paid" value={inputs.hra.months_rented} min={0} max={12}
            onChange={(v) => update('hra.months_rented', Math.max(0, Math.min(12, Math.round(v))))} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label htmlFor="hra-city" className="form-label" style={{ fontSize: '12px' }}>City you rent in</label>
            <input id="hra-city" className="form-input" style={{ padding: '8px 10px', fontSize: '13px' }} list="hra-metro-cities"
              value={p.city ?? ''} onChange={(e) => update('profile.city', e.target.value || null)} placeholder="e.g. Pune" />
            <datalist id="hra-metro-cities">{(hraRules?.metro_cities ?? []).map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <SelectField id="hra-metro" label="Metro classification" value={p.metro === null ? 'auto' : p.metro ? 'metro' : 'non'}
            options={[{ value: 'auto', label: 'From city (rule set list)' }, { value: 'metro', label: 'Metro (override)' }, { value: 'non', label: 'Non-metro (override)' }]}
            onChange={(v) => update('profile.metro', v === 'auto' ? null : v === 'metro')}
            help={hraRules?.metro_cities ? `Metro in this rule set: ${hraRules.metro_cities.join(', ')}.` : undefined} />
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          HRA received ({formatINR(inputs.salary.hra || 0)}) and basic + DA come from the Salary & CTC tab.
        </div>
        {old?.hra && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {Object.entries(old.hra.components).map(([key, amount]) => {
              const binding = old.hra!.binding_component === key;
              return (
                <div key={key} className="glass-card" style={{ padding: '12px', border: binding ? '1px solid rgba(16,185,129,0.4)' : undefined }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                    {HRA_COMPONENT_LABELS[key] ?? key}
                    {key === 'pct_of_salary' && ` (${old.hra!.metro_or_non_metro_pct}%, ${old.hra!.metro ? 'metro' : 'non-metro'})`}
                    {key === 'rent_paid_minus_pct_of_salary' && ` (${old.hra!.rent_excess_over_salary_pct}%)`}
                  </div>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: binding ? '#10b981' : 'var(--text-primary)' }}>{formatINR(amount)}</div>
                  {binding && <Pill color="#10b981">Lowest: this is the exemption</Pill>}
                </div>
              );
            })}
            <div className="glass-card" style={{ padding: '12px' }}>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>HRA exemption</div>
              <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{formatINR(old.hra.exemption)}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Taxable HRA: {formatINR(Math.max((inputs.salary.hra || 0) - old.hra.exemption, 0))}</div>
            </div>
          </div>
        )}
      </Section>

      <Section title="Exempt allowances" subtitle="Old regime only. Limits per child come from the rule set.">
        <div style={fieldGrid}>
          <NumberField id="ea-ce" label="Children education allowance received (annual)" value={inputs.exempt_allowances.children_education_received}
            onChange={(v) => update('exempt_allowances.children_education_received', v)} />
          <NumberField id="ea-ce-n" label="Children (education allowance)" value={inputs.exempt_allowances.children_education_children}
            onChange={(v) => update('exempt_allowances.children_education_children', Math.round(v))} />
          <NumberField id="ea-h" label="Hostel allowance received (annual)" value={inputs.exempt_allowances.hostel_received}
            onChange={(v) => update('exempt_allowances.hostel_received', v)} />
          <NumberField id="ea-h-n" label="Children (hostel allowance)" value={inputs.exempt_allowances.hostel_children}
            onChange={(v) => update('exempt_allowances.hostel_children', Math.round(v))} />
          <NumberField id="ea-other-old" label="Other exempt allowances (e.g. LTA claimed)" value={inputs.exempt_allowances.other_old}
            onChange={(v) => update('exempt_allowances.other_old', v)} help="Taken as entered; eligibility is not checked." />
        </div>
      </Section>

      {!result ? <EmptyState>Computing…</EmptyState> : Object.entries(groups).map(([group, fields]) => {
        const resultKeys = GROUP_RESULT_KEYS[group] ?? [];
        const applied = resultKeys.reduce((s, k) => s + (old?.deductions[k] || 0), 0);
        const notAllowed = fields.every((f) => f.rule_key !== 'house_property_loss_setoff_cap' && !allowed.has(f.rule_key));
        return (
          <Section key={group} title={group === 'NPS' ? 'NPS (your own contribution)' : group === 'Home loan' ? 'Home loan interest' : `Section ${group}`}
            subtitle={notAllowed ? 'Not allowed by the selected rule set.' : undefined}
            actions={resultKeys.length > 0 && (
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'right' }}>
                Allowed: <strong style={{ color: 'var(--text-primary)' }}>{formatINR(applied)}</strong>
              </div>
            )}>
            <div style={fieldGrid}>
              {fields.map((f) => (
                <DeductionInput key={f.path} field={f} value={getIn(inputs, f.path)} onChange={(v) => update(f.path, v)} />
              ))}
            </div>
            {group === '80C' && (
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                Payroll EPF ({formatINR(inputs.payroll_deductions.employee_epf || 0)}) and VPF ({formatINR(inputs.payroll_deductions.vpf || 0)}) are included automatically.
              </div>
            )}
            {group === 'Home loan' && old && (
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                House property income after interest: {formatINR(old.house_property_income)}.
              </div>
            )}
          </Section>
        );
      })}
    </div>
  );
};
