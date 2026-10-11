import React, { useEffect, useState } from 'react';
import { Liability, CardVariant, CardComparisonResult } from '../../types';
import { API_BASE_URL } from '../../config';
import { formatINR } from '../../format';
import { AmountInput, Group, Row } from '../settings/ui';

interface CompareCardsTabProps {
  ownedCards: Liability[];
  cardVariants: CardVariant[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  preselectLiabilityId?: number | null;
}

type SelectableItem = { key: string; id: number; source: 'owned' | 'library'; label: string };

const WEIGHT_KEYS = [
  { key: 'fee_tolerance', label: 'Low fees' },
  { key: 'reward_value', label: 'Reward value' },
  { key: 'lounge_access', label: 'Lounge access' },
  { key: 'milestone_ease', label: 'Easy milestones' },
  { key: 'simplicity', label: 'Simple to use' },
] as const;
const SCORE_KEYS: { key: keyof CardComparisonResult['cards'][number]['scores']; label: string }[] = [
  { key: 'fee', label: 'fees' }, { key: 'reward_value', label: 'rewards' }, { key: 'lounge_access', label: 'lounges' },
  { key: 'milestone_ease', label: 'milestones' }, { key: 'simplicity', label: 'simplicity' },
];
const DAY = 86400000;

/** Card spend logged in the last 12 months, scaled to a year when there's less history. */
async function yearlyCardSpend(): Promise<{ amount: number; note: string } | null> {
  const res = await fetch(`${API_BASE_URL}/api/entities/transactions`).catch(() => null);
  if (!res?.ok) return null;
  const since = Date.now() - 365 * DAY;
  const spends = (await res.json() as any[]).filter((t) => t.type === 'Spend' && new Date(`${t.transaction_date}T00:00:00`).getTime() >= since);
  if (!spends.length) return null;
  const total = spends.reduce((s, t) => s + (t.amount || 0), 0);
  const first = Math.min(...spends.map((t) => new Date(`${t.transaction_date}T00:00:00`).getTime()));
  const days = Math.max((Date.now() - first) / DAY, 30);
  if (days >= 330) return { amount: Math.round(total / 1000) * 1000, note: 'your card spend over the last 12 months' };
  return { amount: Math.round((total * 365) / days / 1000) * 1000, note: `your card spend so far (${Math.round(days)} days), scaled to a year` };
}

export const CompareCardsTab: React.FC<CompareCardsTabProps> = ({ ownedCards, cardVariants, showToast, preselectLiabilityId }) => {
  const items: SelectableItem[] = [
    ...ownedCards.map((c) => ({ key: `owned-${c.id}`, id: c.id, source: 'owned' as const, label: c.name })),
    ...cardVariants.map((v) => ({ key: `library-${v.id}`, id: v.id, source: 'library' as const, label: v.name })),
  ];
  const [selectedKeys, setSelectedKeys] = useState<string[]>(preselectLiabilityId ? [`owned-${preselectLiabilityId}`] : []);
  const [weights, setWeights] = useState<Record<string, number>>({ fee_tolerance: 20, reward_value: 40, lounge_access: 20, milestone_ease: 10, simplicity: 10 });
  const [spend, setSpend] = useState(0);
  const [spendNote, setSpendNote] = useState<string | null>(null);
  const [result, setResult] = useState<CardComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void yearlyCardSpend().then((s) => { if (s) { setSpend(s.amount); setSpendNote(s.note); } });
  }, []);

  const toggle = (key: string) => setSelectedKeys((prev) => {
    if (prev.includes(key)) return prev.filter((k) => k !== key);
    if (prev.length >= 5) { showToast?.('You can compare up to 5 cards at once', 'info'); return prev; }
    return [...prev, key];
  });

  const compare = async () => {
    setLoading(true);
    try {
      const selected = items.filter((i) => selectedKeys.includes(i.key));
      const res = await fetch(`${API_BASE_URL}/api/credit-cards/compare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owned_liability_ids: selected.filter((i) => i.source === 'owned').map((i) => i.id),
          library_variant_ids: selected.filter((i) => i.source === 'library').map((i) => i.id),
          weights, assumed_annual_spend: spend,
        }),
      });
      if (res.ok) setResult(await res.json());
      else showToast?.((await res.json().catch(() => ({})))?.detail || "Couldn't compare those cards", 'error');
    } catch {
      showToast?.("Couldn't compare those cards", 'error');
    } finally {
      setLoading(false);
    }
  };

  const ready = selectedKeys.length >= 2 && spend > 0;
  const ranked = result ? [...result.cards].sort((a, b) => b.weighted_total - a.weighted_total) : [];
  const isWinner = (c: CardComparisonResult['cards'][number]) => !!result && c.id === result.winner_id && c.source === result.winner_source;

  return (
    <div className="db-col">
      <div className="lp-grid">
        <Group title="Cards to compare" description="Pick 2 to 5: your own cards or any from the library.">
          {items.length === 0 ? <Row label={<span className="cc-note">Add a card, or a card to the library, first.</span>} /> : (
            <div className="df-check-grid cc-compare-picks">
              {items.map((it) => (
                <label key={it.key} className="df-check">
                  <input type="checkbox" checked={selectedKeys.includes(it.key)} onChange={() => toggle(it.key)} />
                  <span>{it.label}<small>{it.source === 'owned' ? 'your card' : 'library'}</small></span>
                </label>
              ))}
            </div>
          )}
        </Group>

        <Group title="What matters to you" description="Each card is scored on these; the sliders set how much each counts.">
          <Row label="Yearly card spend" description={spendNote ? `Starts from ${spendNote}.` : 'No card spending logged yet: enter roughly what you put on cards in a year.'} htmlFor="cc-spend">
            <AmountInput id="cc-spend" label="Yearly card spend" prefix="₹" width={120} value={spend} onChange={setSpend} />
          </Row>
          {WEIGHT_KEYS.map(({ key, label }) => (
            <Row key={key} label={<>{label} <strong className="cf-slider-value">{weights[key]}</strong></>} htmlFor={`cc-w-${key}`}>
              <input id={`cc-w-${key}`} type="range" min={0} max={100} value={weights[key]} className="cf-range"
                onChange={(e) => setWeights({ ...weights, [key]: parseInt(e.target.value) })} />
            </Row>
          ))}
        </Group>
      </div>

      <div className="tx-actions">
        <button className="btn btn-primary" onClick={compare} disabled={!ready || loading}>{loading ? 'Comparing…' : 'Compare'}</button>
        {!ready && <span className="cc-note">{selectedKeys.length < 2 ? 'Pick at least two cards.' : 'Enter your yearly card spend.'}</span>}
      </div>

      {result && (
        <section aria-label="Comparison">
          <div className="settings-group-head">
            <h3 className="settings-group-title">Best fit for you: {ranked[0]?.label}</h3>
            <span className="cc-note">Scores compare these cards with each other: on each point the best gets 100 and the weakest 0, then they're weighted by what matters to you.</span>
          </div>
          <div className="settings-group">
            {ranked.map((c) => (
              <div key={`${c.source}-${c.id}`} className={`ie-row fc-row${isWinner(c) ? ' cc-compare-win' : ''}`}>
                <span className="ie-row-text">
                  <strong>{c.label}</strong>
                  <span>{SCORE_KEYS.map((s) => `${s.label} ${c.scores[s.key]}`).join(' · ')}</span>
                  <span className="cc-meter cc-compare-bar"><span style={{ width: `${Math.min(c.weighted_total, 100)}%`, background: isWinner(c) ? 'var(--success)' : 'var(--accent)' }} /></span>
                </span>
                <span className="ie-row-amount">
                  <strong style={{ color: c.net_annual_value >= 0 ? 'var(--success)' : '#fca5a5' }}>{c.net_annual_value >= 0 ? '' : '−'}{formatINR(Math.abs(c.net_annual_value))}</strong>
                  <span>a year after fees · score {c.weighted_total}</span>
                </span>
              </div>
            ))}
          </div>
          {result.caveats.length > 0 && (
            <ul className="db-facts cc-compare-caveats">{result.caveats.map((c) => <li key={c} className="cc-note">{c}</li>)}</ul>
          )}
        </section>
      )}
    </div>
  );
};
