import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config';
import { Group, Row } from '../settings/ui';

interface GainSuggestion { asset_id: number; asset: string; category: string; units: number; units_held: number; price: number; sale_value: number; gain: number; future_tax_avoided: number }
interface LossSuggestion { asset_id: number; asset: string; category: string; units: number; sale_value: number; loss: number; short_term_loss: number; long_term_loss: number; tax_saved_this_year: number; carried_forward: number }
interface Plan {
  financial_year: string;
  deadline: string;
  days_left: number;
  year_over: boolean;
  exemption: number;
  exemption_used: number;
  exemption_left: number;
  exemption_left_after: number;
  gain_harvest: GainSuggestion[];
  gain_harvest_total: number;
  future_tax_avoided: number;
  loss_harvest: LossSuggestion[];
  holdings_considered: number;
  rates: { stcg_pct: number; ltcg_pct: number };
  notes: string[];
}

const inr = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const units = (n: number, category: string) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${category === 'Stock' ? (n === 1 ? 'share' : 'shares') : 'units'}`;
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** Sell-and-rebuy suggestions to use the year's tax-free long-term gains, and losses worth booking. */
export const HarvestingPanel: React.FC<{ personId: number | null; financialYear: string }> = ({ personId, financialYear }) => {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (personId === null) return;
    setPlan(null);
    fetch(`${API_BASE_URL}/api/tax/harvesting?person_id=${personId}&financial_year=${encodeURIComponent(financialYear)}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b?.detail ?? 'Request failed'); return b; })
      .then((p) => { setPlan(p); setError(null); })
      .catch((e: Error) => setError(e.message));
  }, [personId, financialYear]);

  if (personId === null) return null;
  if (error) return <div className="glass-panel" style={{ padding: '16px', color: '#fca5a5', fontSize: '13px' }}>Couldn't work out harvesting: {error}</div>;
  if (!plan) return <div className="glass-panel" style={{ padding: '16px', color: 'var(--text-muted)', fontSize: '13px' }}>Checking your holdings…</div>;

  const usedPct = plan.exemption > 0 ? (plan.exemption_used / plan.exemption) * 100 : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-panel cc-summary ie-summary" style={{ marginBottom: 0 }}>
        <div className="cc-summary-main">
          <div className="cc-label">Tax-free long-term equity gains, FY {plan.financial_year}</div>
          <strong style={{ fontSize: '22px' }}>{inr(plan.exemption_left)} <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-secondary)' }}>left of {inr(plan.exemption)}</span></strong>
          <div className="cc-meter"><div style={{ width: `${Math.min(usedPct, 100)}%`, background: 'var(--accent)' }} /></div>
          <span className="cc-note">{inr(plan.exemption_used)} already used by sales this year</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Could use now</div>
          <strong>{inr(plan.gain_harvest_total)}</strong>
          <span className="cc-note">of gains, tax-free</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Tax avoided later</div>
          <strong>{inr(plan.future_tax_avoided)}</strong>
          <span className="cc-note">at {plan.rates.ltcg_pct}% on those gains</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">{plan.year_over ? 'Year ended' : 'Time left'}</div>
          <strong>{plan.year_over ? '—' : `${plan.days_left} day${plan.days_left === 1 ? '' : 's'}`}</strong>
          <span className="cc-note">until {longDate(plan.deadline)}</span>
        </div>
      </div>

      {plan.year_over && (
        <p className="cc-note" style={{ margin: 0 }}>This financial year has ended; harvesting for it is no longer possible. Switch to the current year above.</p>
      )}

      <Group title="Use your tax-free allowance"
        description="Sell these and buy them straight back: your investment stays the same, the gain is realised tax-free, and its cost resets higher so the gain isn't taxed later.">
        {plan.gain_harvest.length === 0 ? (
          <Row label={<span className="cc-note">{plan.holdings_considered === 0
            ? 'No stocks or mutual funds with purchase lots for this person. Add lots on Assets to get suggestions.'
            : plan.exemption_left <= 0 ? "This year's allowance is already used."
              : 'No long-term gains to harvest right now (holdings are short-term or below cost).'}</span>} />
        ) : plan.gain_harvest.map((s) => (
          <Row key={s.asset_id} label={<>Sell and buy back <strong>{units(s.units, s.category)}</strong> of {s.asset}</>}
            description={`About ${inr(s.sale_value)} at today's price (${units(s.units_held, s.category)} held) · long-term gain ${inr(s.gain)}, tax-free this year`}>
            <span className="ie-row-amount"><strong style={{ color: 'var(--success)' }}>{inr(s.future_tax_avoided)}</strong><span>tax avoided later</span></span>
          </Row>
        ))}
      </Group>

      <Group title="Losses you could book"
        description={`Selling a holding below its cost realises a loss: short-term losses offset short- or long-term gains (${plan.rates.stcg_pct}% / ${plan.rates.ltcg_pct}%), long-term losses offset long-term gains. Unused losses carry forward.`}>
        {plan.loss_harvest.length === 0 ? (
          <Row label={<span className="cc-note">No holdings are below their cost.</span>} />
        ) : plan.loss_harvest.map((s) => (
          <Row key={s.asset_id} label={<>Sell <strong>{units(s.units, s.category)}</strong> of {s.asset}: <strong>{inr(s.loss)}</strong> loss</>}
            description={[
              s.short_term_loss > 0 ? `${inr(s.short_term_loss)} short-term` : null,
              s.long_term_loss > 0 ? `${inr(s.long_term_loss)} long-term` : null,
              s.carried_forward > 0 ? `${inr(s.carried_forward)} would carry forward` : null,
            ].filter(Boolean).join(' · ')}>
            <span className="ie-row-amount">
              <strong style={{ color: s.tax_saved_this_year > 0 ? 'var(--success)' : 'var(--text-secondary)' }}>{inr(s.tax_saved_this_year)}</strong>
              <span>{s.tax_saved_this_year > 0 ? 'tax saved this year' : 'no taxable gains to offset yet'}</span>
            </span>
          </Row>
        ))}
      </Group>

      <ul className="cc-note" style={{ margin: 0, paddingLeft: '18px', lineHeight: 1.7 }}>
        {plan.notes.map((n) => <li key={n}>{n}</li>)}
      </ul>
    </div>
  );
};
