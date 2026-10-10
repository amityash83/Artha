import React, { useState } from 'react';
import { Scale, AlertTriangle } from 'lucide-react';
import { Liability, CardVariant, CardComparisonResult } from '../../types';
import { API_BASE_URL } from '../../config';

interface CompareCardsTabProps {
  ownedCards: Liability[];
  cardVariants: CardVariant[];
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  preselectLiabilityId?: number | null;
}

type SelectableItem = { key: string; id: number; source: 'owned' | 'library'; label: string };

const WEIGHT_KEYS = [
  { key: 'fee_tolerance', label: 'Fee Tolerance' },
  { key: 'reward_value', label: 'Reward Value' },
  { key: 'lounge_access', label: 'Lounge Access' },
  { key: 'milestone_ease', label: 'Milestone Ease' },
  { key: 'simplicity', label: 'Simplicity' },
] as const;

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export const CompareCardsTab: React.FC<CompareCardsTabProps> = ({ ownedCards, cardVariants, showToast, preselectLiabilityId }) => {
  const items: SelectableItem[] = [
    ...ownedCards.map((c) => ({ key: `owned-${c.id}`, id: c.id, source: 'owned' as const, label: `My Cards: ${c.name}` })),
    ...cardVariants.map((v) => ({ key: `library-${v.id}`, id: v.id, source: 'library' as const, label: `Card Library: ${v.name}` })),
  ];

  const [selectedKeys, setSelectedKeys] = useState<string[]>(
    preselectLiabilityId ? [`owned-${preselectLiabilityId}`] : []
  );
  const [weights, setWeights] = useState<Record<string, number>>({
    fee_tolerance: 20, reward_value: 40, lounge_access: 20, milestone_ease: 10, simplicity: 10,
  });
  const [assumedSpend, setAssumedSpend] = useState(600000);
  const [result, setResult] = useState<CardComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleSelection = (key: string) => {
    setSelectedKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      if (prev.length >= 5) {
        showToast?.('You can compare at most 5 cards at once', 'info');
        return prev;
      }
      return [...prev, key];
    });
  };

  const handleCompare = async () => {
    if (selectedKeys.length < 2) {
      showToast?.('Select at least 2 cards to compare', 'error');
      return;
    }
    setLoading(true);
    try {
      const selected = items.filter((i) => selectedKeys.includes(i.key));
      const owned_liability_ids = selected.filter((i) => i.source === 'owned').map((i) => i.id);
      const library_variant_ids = selected.filter((i) => i.source === 'library').map((i) => i.id);
      const res = await fetch(`${API_BASE_URL}/api/credit-cards/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owned_liability_ids, library_variant_ids, weights, assumed_annual_spend: assumedSpend }),
      });
      if (res.ok) {
        setResult(await res.json());
      } else {
        const err = await res.json();
        showToast?.(err.detail || 'Comparison failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast?.('Error running comparison', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>Select 2-5 Cards</h3>
        {items.length === 0 ? (
          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No cards available — register a card or add a Card Library entry first.</div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {items.map((item) => {
              const selected = selectedKeys.includes(item.key);
              return (
                <button
                  key={item.key}
                  onClick={() => toggleSelection(item.key)}
                  className="btn btn-secondary"
                  style={{
                    padding: '6px 14px', fontSize: '12px', borderRadius: '20px',
                    background: selected ? 'rgba(139, 92, 246, 0.2)' : undefined,
                    border: selected ? '1px solid rgba(139, 92, 246, 0.5)' : undefined,
                    color: selected ? '#c4b5fd' : undefined,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '20px' }}>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '12px' }}>Scoring Weights &amp; Assumptions</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px' }}>
          {WEIGHT_KEYS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{label}: {weights[key]}</label>
              <input
                type="range"
                min={0}
                max={100}
                value={weights[key]}
                onChange={(e) => setWeights({ ...weights, [key]: parseInt(e.target.value) })}
              />
            </div>
          ))}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Assumed Annual Spend</label>
            <input
              type="number"
              className="form-control"
              value={assumedSpend}
              onChange={(e) => setAssumedSpend(parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <button
          className="btn btn-primary"
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', marginTop: '18px' }}
          onClick={handleCompare}
          disabled={loading}
        >
          <Scale size={14} /> {loading ? 'Comparing...' : 'Compare'}
        </button>
      </div>

      {result && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '14px' }}>Comparison Result</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-glass)' }}>
                  <th style={{ padding: '8px' }}>Card</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Fee</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Reward</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Lounge</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Milestone</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Simplicity</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Weighted Total</th>
                  <th style={{ padding: '8px', textAlign: 'right' }}>Net Annual Value</th>
                </tr>
              </thead>
              <tbody>
                {result.cards
                  .slice()
                  .sort((a, b) => b.weighted_total - a.weighted_total)
                  .map((c) => (
                    <tr
                      key={`${c.source}-${c.id}`}
                      style={{
                        borderBottom: '1px solid rgba(255,255,255,0.02)',
                        background: c.id === result.winner_id && c.source === result.winner_source ? 'rgba(16,185,129,0.06)' : undefined,
                      }}
                    >
                      <td style={{ padding: '8px', color: '#e2e8f0' }}>
                        {c.label}
                        {c.id === result.winner_id && c.source === result.winner_source && (
                          <span className="badge badge-green" style={{ fontSize: '9px', marginLeft: '8px' }}>Best Fit</span>
                        )}
                      </td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{c.scores.fee}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{c.scores.reward_value}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{c.scores.lounge_access}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{c.scores.milestone_ease}</td>
                      <td style={{ padding: '8px', textAlign: 'right' }}>{c.scores.simplicity}</td>
                      <td style={{ padding: '8px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>{c.weighted_total}</td>
                      <td style={{ padding: '8px', textAlign: 'right', color: c.net_annual_value >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatCurrency(c.net_annual_value)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div style={{
            marginTop: '16px', padding: '10px 14px', borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.06)', border: '1px solid rgba(245, 158, 11, 0.2)',
            fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px',
          }}>
            {result.caveats.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                <AlertTriangle size={12} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '1px' }} />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
