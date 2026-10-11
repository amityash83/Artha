import React, { useState } from 'react';
import { TaxRegimeKey } from '../../types';
import type { PlannerChildProps } from './TaxPlanner';
import { WarningList } from './TaxWarnings';
import { EmptyState, formatINR, Pill, Section, SourceBadge, SubTabs, VerificationBadge } from './taxUi';

const STEP_NAMES: Record<number, string> = {
  1: 'Gross salary',
  2: 'Salary exemptions',
  3: 'Taxable salary',
  4: 'Other income',
  5: 'Gross total income',
  6: 'Deductions',
  7: 'Total taxable income',
  8: 'Tax at slab and special rates',
  9: 'Rebate',
  10: 'Surcharge and marginal relief',
  11: 'Health and education cess',
  12: 'Total tax liability',
  13: 'Taxes already paid',
  14: 'Payable or refund',
};

const cell: React.CSSProperties = { padding: '8px 10px', fontSize: '12.5px', borderBottom: '1px solid var(--border-glass)', verticalAlign: 'top' };

export const ComputationDetails: React.FC<PlannerChildProps> = ({ result }) => {
  const [regime, setRegime] = useState<TaxRegimeKey>('new');
  if (!result) return <EmptyState>Computing…</EmptyState>;
  const r = result.regimes[regime];
  const steps = Array.from(new Set(r.audit.map((l) => l.step))).sort((a, b) => a - b);
  const rs = result.rule_set;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <SubTabs label="Regime" tabs={[{ key: 'new' as TaxRegimeKey, label: 'New regime' }, { key: 'old' as TaxRegimeKey, label: 'Old regime' }]}
        active={regime} onChange={setRegime} />

      <Section
        title={`${r.label}: step-by-step computation`}
        subtitle={<>
          Rule set <strong>{rs.name ?? rs.rule_set_id}</strong> ({rs.rule_set_id} v{rs.version}, FY {rs.financial_year}, AY {rs.assessment_year}, {rs.act})
          {rs.content_hash && <> · fingerprint <code style={{ fontSize: '11px' }}>{rs.content_hash.slice(0, 12)}</code></>}
          {result.computed_at && <> · computed {result.computed_at.replace('T', ' ')}</>}
        </>}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Item', 'Annual', 'Monthly equiv.', 'Source', 'How it was derived'].map((h, i) => (
                  <th key={h} scope="col" style={{ ...cell, textAlign: i === 1 || i === 2 ? 'right' : 'left', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            {steps.map((step) => (
              <tbody key={step}>
                <tr>
                  <th colSpan={5} scope="rowgroup" style={{ ...cell, textAlign: 'left', fontSize: '11.5px', color: 'var(--accent-light)', background: 'rgba(139, 92, 246, 0.05)' }}>
                    Step {step}: {STEP_NAMES[step] ?? ''}
                  </th>
                </tr>
                {r.audit.filter((l) => l.step === step).map((line, i) => (
                  <tr key={`${line.key}-${i}`}>
                    <td style={{ ...cell, color: 'var(--text-primary)' }}>{line.label}</td>
                    <td style={{ ...cell, textAlign: 'right', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{formatINR(line.amount, line.step >= 8 && line.step <= 11 ? 2 : 0)}</td>
                    <td style={{ ...cell, textAlign: 'right', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatINR(line.amount / 12)}</td>
                    <td style={cell}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-start' }}>
                        <SourceBadge source={line.source} />
                        <VerificationBadge level={line.verification} />
                      </div>
                    </td>
                    <td style={{ ...cell, color: 'var(--text-secondary)', fontSize: '12px' }}>
                      <div>{line.formula}</div>
                      {(line.legacy_section || line.act_2025_section || line.rule_ref) && (
                        <div style={{ marginTop: '4px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {line.legacy_section && <Pill color="#94a3b8" title="Section under the Income-tax Act, 1961">s.{line.legacy_section}</Pill>}
                          {line.act_2025_section && <Pill color="#94a3b8" title="Section under the Income-tax Act, 2025">2025 Act: {line.act_2025_section}</Pill>}
                          {line.rule_ref && <Pill color="#64748b" title="Rule set path">{line.rule_ref}</Pill>}
                        </div>
                      )}
                      {line.inputs && Object.keys(line.inputs).length > 0 && (
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                          {Object.entries(line.inputs).map(([k, v]) => `${k}: ${typeof v === 'number' ? formatINR(v) : String(v)}`).join(' · ')}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Section>

      <Section title="Checks and notes">
        <WarningList warnings={result.warnings.filter((w) => !w.regime || w.regime === regime)} />
      </Section>
    </div>
  );
};
