import React from 'react';
import { ChevronDown } from 'lucide-react';
import { CreditCardAnnualReview } from '../../types';
import { ConfirmAction } from '../settings/ui';

// "My cards": a summary of every card, then one compact row per card that expands to
// show everything about it in one place (balance, rewards, fee waiver, lounges and
// whether it's worth its fee), instead of spreading one card across several tabs.

export const inr = (v: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(v || 0);
const shortDate = (d: Date) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
export const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

/** The next calendar date (today or later) falling on the given day of the month. */
export function nextOnDay(day: number, from = new Date()): Date {
  const today = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let add = 0; add < 2; add++) {
    const y = today.getFullYear();
    const m = today.getMonth() + add;
    const last = new Date(y, m + 1, 0).getDate();
    const d = new Date(y, m, Math.min(day, last));
    if (d >= today) return d;
  }
  return today;
}

const VERDICT_LABEL: Record<string, { label: string; color: string }> = {
  Keep: { label: 'Worth keeping', color: '#10b981' },
  'Upgrade-Candidate': { label: 'Consider upgrading', color: '#60a5fa' },
  Downgrade: { label: 'Consider downgrading', color: '#f59e0b' },
  Close: { label: 'Consider closing', color: '#f87171' },
};

const NETWORK: [RegExp, string][] = [[/visa/i, 'VISA'], [/master|mc/i, 'MC'], [/rupay/i, 'RuPay'], [/amex|american/i, 'AMEX'], [/diner/i, 'Diners']];
const networkShort = (n: string) => NETWORK.find(([re]) => re.test(n || ''))?.[1] ?? (n || '').slice(0, 5);

const Meter: React.FC<{ pct: number; label: string }> = ({ pct, label }) => (
  <div className="cc-meter" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
    <div style={{ width: `${Math.min(Math.max(pct, 0), 100)}%`, background: pct > 50 ? 'var(--danger)' : pct > 30 ? 'var(--warning)' : 'var(--success)' }} />
  </div>
);

// ---------------------------------------------------------------------------

export const CardsSummary: React.FC<{ cards: any[] }> = ({ cards }) => {
  const limit = cards.reduce((t, c) => t + Number(c.credit_limit || 0), 0);
  const owed = cards.reduce((t, c) => t + Number(c.outstanding || 0), 0);
  const rewards = cards.reduce((t, c) => t + Number(c.reward_points || 0) * Number(c.point_value || 0.25), 0);
  const fees = cards.reduce((t, c) => t + Number(c.annual_fee || 0), 0);
  const pct = limit > 0 ? (owed / limit) * 100 : 0;
  const dues = cards
    .filter((c) => Number(c.outstanding || 0) > 0)
    .map((c) => ({ card: c, date: nextOnDay(Number(c.due_date || 5)), billed: Number(c.statement_balance || 0) > 0, amount: Number(c.statement_balance || 0) || Number(c.outstanding || 0) }))
    .sort((a, b) => a.date.getTime() - b.date.getTime());
  const next = dues[0];
  return (
    <div className="glass-panel cc-summary">
      <div className="cc-summary-main">
        <div className="cc-label">Limit used</div>
        <div className="cc-summary-figure">
          <strong>{inr(owed)}</strong> <span>of {inr(limit)}</span> <span className="cc-pct">{pct.toFixed(0)}%</span>
        </div>
        <Meter pct={pct} label="Share of your total credit limit in use" />
        <div className="cc-note">{pct > 30 ? 'Above 30% of your limit; keeping it lower helps your credit score.' : 'Under 30% of your limit.'}</div>
      </div>
      <div className="cc-summary-stat">
        <div className="cc-label">Next payment</div>
        <strong>{next ? inr(next.amount) : '—'}</strong>
        <span className="cc-note">{next ? `${next.card.name} · by ${shortDate(next.date)}${next.billed ? '' : ' · whole balance (no statement amount entered)'}` : 'Nothing due'}</span>
      </div>
      <div className="cc-summary-stat">
        <div className="cc-label">Rewards you hold</div>
        <strong>{inr(rewards)}</strong>
        <span className="cc-note">At each card's point value</span>
      </div>
      <div className="cc-summary-stat">
        <div className="cc-label">Annual fees</div>
        <strong>{inr(fees)}</strong>
        <span className="cc-note">{cards.length} card{cards.length === 1 ? '' : 's'}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

const Fact: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="cc-fact">
    <span title={hint}>{label}</span>
    <strong>{value}</strong>
  </div>
);

export const CardRow: React.FC<{
  card: any;
  bank: string;
  review?: CreditCardAnnualReview;
  expanded: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRemove: () => Promise<void> | void;
  onCompare: () => void;
}> = ({ card, bank, review, expanded, onToggle, onEdit, onRemove, onCompare }) => {
  const limit = Number(card.credit_limit || 0);
  const owed = Number(card.outstanding || 0);
  const billed = Math.min(Number(card.statement_balance || 0), owed);
  const pct = limit > 0 ? (owed / limit) * 100 : 0;
  const points = Number(card.reward_points || 0);
  const pointValue = Number(card.point_value || 0.25);
  const rewardValue = points * pointValue;
  const fee = Number(card.annual_fee || 0);
  const cycleSpend = Number(card.has_spend_transactions ? card.real_cycle_spend_total : (card.current_statement_spend || 0));
  const due = nextOnDay(Number(card.due_date || 5));
  const target = Number(card.milestone_spend_target || 0);
  const spentTowards = Number(card.milestone_spend_current || 0);
  const waiverPct = target > 0 ? Math.min((spentTowards / target) * 100, 100) : 0;
  const domLimit = Number(card.lounge_visits_limit || 0);
  const domUsed = Number(card.lounge_visits_used || 0);
  const intLimit = Number(card.lounge_int_limit || 0);
  const intUsed = Number(card.lounge_int_used || 0);
  const verdict = review ? VERDICT_LABEL[review.verdict] ?? { label: review.verdict, color: 'var(--text-secondary)' } : null;

  let waiverNeed = '';
  if (target > 0 && spentTowards < target) {
    const left = target - spentTowards;
    if (!card.renewal_date) waiverNeed = `${inr(left)} still to spend. Add the renewal date to see the pace needed.`;
    else {
      const renewal = new Date(`${card.renewal_date}T00:00:00`);
      const months = (renewal.getTime() - Date.now()) / (30.44 * 86400000);
      waiverNeed = months > 0
        ? `${inr(left)} still to spend: about ${inr(left / Math.max(months, 1))} a month until ${longDate(card.renewal_date)}.`
        : `The renewal date (${longDate(card.renewal_date)}) has passed. Edit the card to set the next one.`;
    }
  }

  return (
    <div className={`cc-card${expanded ? ' cc-card--open' : ''}`}>
      <button type="button" className="cc-card-head" aria-expanded={expanded} onClick={onToggle}>
        <span className="cc-thumb" aria-hidden>{networkShort(card.network)}</span>
        <span className="cc-card-title">
          <strong>{card.name}</strong>
          <span>{[bank, card.network, card.owner_name].filter(Boolean).join(' · ')}</span>
        </span>
        <span className="cc-card-balance">
          <span><strong>{inr(owed)}</strong> of {inr(limit)}</span>
          <Meter pct={pct} label={`${card.name}: share of limit in use`} />
        </span>
        <ChevronDown size={16} className="cc-chevron" />
      </button>
      <div className="cc-chips">
        <span>{owed > 0 ? `Due ${shortDate(due)}` : 'Nothing to pay'}</span>
        <span>Rewards {inr(rewardValue)}</span>
        {target > 0 && <span>Fee waiver {waiverPct.toFixed(0)}%</span>}
        {verdict && <span style={{ color: verdict.color }}>{verdict.label}</span>}
      </div>

      {expanded && (
        <div className="cc-detail">
          <section>
            <h4>Balance</h4>
            <Fact label="On your last statement" value={inr(billed)} hint="What the last bill asked you to pay" />
            <Fact label="Spent since (not yet billed)" value={inr(Math.max(owed - billed, 0))} />
            <Fact label="Spent this billing cycle" value={inr(cycleSpend)} hint="Charges logged since the last statement date" />
            <Fact label="Still available" value={inr(Math.max(limit - owed, 0))} />
            <p className="cc-note">Statement on the {ordinal(Number(card.statement_date || 15))} · payment due on the {ordinal(Number(card.due_date || 5))}</p>
          </section>
          <section>
            <h4>Rewards &amp; fee</h4>
            <Fact label="Points" value={`${points.toLocaleString('en-IN')} × ${inr(pointValue).replace('.00', '')}`} />
            <Fact label="Worth" value={inr(rewardValue)} />
            <Fact label="Annual fee" value={inr(fee)} />
            <Fact label="Rewards minus fee" value={<span style={{ color: rewardValue - fee >= 0 ? 'var(--success)' : '#f87171' }}>{inr(rewardValue - fee)}</span>} />
            {review && <p className="cc-note"><strong style={{ color: verdict?.color }}>{verdict?.label}.</strong> {review.reason}</p>}
          </section>
          {target > 0 && (
            <section>
              <h4>Fee waiver</h4>
              <Fact label="Spent towards it" value={`${inr(spentTowards)} of ${inr(target)}`} />
              <Meter pct={waiverPct} label="Fee waiver progress" />
              <p className="cc-note">{spentTowards >= target ? 'Reached: the next annual fee should be waived.' : waiverNeed}{card.milestone_reward_desc ? ` ${card.milestone_reward_desc}` : ''}</p>
            </section>
          )}
          {(domLimit > 0 || intLimit > 0) && (
            <section>
              <h4>Lounge visits left</h4>
              {domLimit > 0 && <Fact label="In India" value={domLimit >= 99 ? 'Unlimited' : `${Math.max(domLimit - domUsed, 0)} of ${domLimit}`} />}
              {intLimit > 0 && <Fact label="Abroad" value={intLimit >= 99 ? 'Unlimited' : `${Math.max(intLimit - intUsed, 0)} of ${intLimit}`} />}
            </section>
          )}
          {card.remarks && <p className="cc-note cc-remarks">{card.remarks}</p>}
          <div className="cc-actions">
            <button type="button" className="settings-btn" onClick={onEdit}>Edit card</button>
            <button type="button" className="settings-btn" onClick={onCompare}>Compare with other cards</button>
            <span style={{ flex: 1 }} />
            <ConfirmAction label="Remove" confirmLabel="Remove" question="Remove this card from Artha?" danger onConfirm={onRemove} />
          </div>
        </div>
      )}
    </div>
  );
};

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
