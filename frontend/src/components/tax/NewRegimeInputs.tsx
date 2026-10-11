import React from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { PlannerChildProps } from './TaxPlanner';
import { getIn } from './plannerInputs';
import { DeductionInput } from './OldRegimeInputs';
import { EmptyState, fieldGrid, formatINR, NumberField, Section, VerificationBadge } from './taxUi';
import { regimeItem, sectionLabel, useRuleSetContent } from './useRuleSetContent';

const Row: React.FC<{ ok: boolean; label: React.ReactNode; detail?: React.ReactNode }> = ({ ok, label, detail }) => (
  <li style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', fontSize: '12.5px', lineHeight: 1.5 }}>
    {ok ? <CheckCircle2 size={15} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
      : <XCircle size={15} style={{ color: 'var(--text-muted)', flexShrink: 0, marginTop: '2px' }} />}
    <span style={{ color: 'var(--text-secondary)' }}>
      <span style={{ color: ok ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
      {detail && <> · {detail}</>}
    </span>
  </li>
);

/**
 * The new regime on the Deductions tab: part "allowances" says what each regime allows
 * (from the rule set), part "rare" holds the few items only the new regime takes.
 */
export const NewRegimeInputs: React.FC<PlannerChildProps & { part: 'allowances' | 'rare' }> = ({ inputs, result, update, metadata, part }) => {
  const rules = useRuleSetContent(result?.rule_set.rule_set_id, result?.rule_set.version);
  if (!result) return <EmptyState>Computing…</EmptyState>;
  const regime = result.regimes.new;
  const year = result.inputs; // the year as computed (month totals with month-by-month entry)
  const sd = regimeItem(rules, 'new', 'standard_deduction');
  const nps = regimeItem(rules, 'new', 'employer_nps');
  const npsPct = (nps?.value as { pct_of_basic_da?: Record<string, number> })?.pct_of_basic_da?.[inputs.profile.employer_type];
  const pt = regimeItem(rules, 'new', 'professional_tax');
  const hra = regimeItem(rules, 'new', 'hra');
  const hp = regimeItem(rules, 'new', 'house_property_loss_setoff_cap');
  const ignored = result.warnings.find((w) => w.code === 'old_regime_only_deductions' && w.regime === 'new');
  const otherNew = metadata.deduction_fields.filter((f) => f.rule_key === 'other_new');

  if (part === 'rare') {
    return (
      <Section title="New regime: rarely used items" subtitle="Only a few people have these. Taken as entered; eligibility isn't checked.">
        <div style={fieldGrid}>
          {otherNew.map((f) => (
            <DeductionInput key={f.path} field={f} value={getIn(inputs, f.path)} onChange={(v) => update(f.path, v)} />
          ))}
          <NumberField id="ea-other-new" label="Exempt allowances allowed in the new regime (e.g. conveyance for divyang employees)"
            value={inputs.exempt_allowances.other_new} onChange={(v) => update('exempt_allowances.other_new', v)} />
        </div>
      </Section>
    );
  }

  return (
      <Section title="Which regime allows what" subtitle="The new regime allows only what's ticked below; everything else on this tab lowers old-regime tax only. Read from the selected rule set.">
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Row ok label={`Standard deduction: ${formatINR(regime.standard_deduction)}`}
            detail={<>{sectionLabel(sd)} <VerificationBadge level={sd?.verification} /></>} />
          <Row ok={(year.employer_contributions.nps || 0) > 0}
            label={`Employer NPS: ${formatINR(regime.deductions.employer_nps || 0)} deducted (of ${formatINR(year.employer_contributions.nps || 0)} paid in)`}
            detail={<>{npsPct !== undefined && `limit ${npsPct}% of basic + DA`} {sectionLabel(nps)} <VerificationBadge level={nps?.verification} /></>} />
          <Row ok={false} label="HRA exemption: not available" detail={<>{sectionLabel(hra)} <VerificationBadge level={hra?.verification} /></>} />
          <Row ok={false} label="Professional tax deduction: not available" detail={<>{sectionLabel(pt)} <VerificationBadge level={pt?.verification} /></>} />
          <Row ok={false} label="Self-occupied home loan interest: not deductible" detail={<>{sectionLabel(hp)} <VerificationBadge level={hp?.verification} /></>} />
          <Row ok={false} label="80C, 80CCD(1B), 80D, 80E, 80G, 80TTA/80TTB: not available" />
        </ul>
        {ignored && (
          <div style={{ fontSize: '12px', color: 'var(--warning)' }}>{ignored.message}</div>
        )}
      </Section>
  );
};
