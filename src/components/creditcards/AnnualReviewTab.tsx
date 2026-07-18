import React, { useEffect, useState } from 'react';
import { CheckCircle2, XCircle, ArrowRightLeft } from 'lucide-react';
import { CreditCardAnnualReview } from '../../types';
import { API_BASE_URL } from '../../config';

interface AnnualReviewTabProps {
  onCompareAlternatives?: (liabilityId: number) => void;
}

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const VERDICT_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Keep: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', text: '#10b981' },
  'Upgrade-Candidate': { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)', text: '#60a5fa' },
  Downgrade: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)', text: '#f59e0b' },
  Close: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' },
};

export const AnnualReviewTab: React.FC<AnnualReviewTabProps> = ({ onCompareAlternatives }) => {
  const [reviews, setReviews] = useState<CreditCardAnnualReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/credit-cards/annual-review`)
      .then((r) => r.json())
      .then((data) => setReviews(data))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading annual review...</div>;
  }

  if (reviews.length === 0) {
    return <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>No registered credit cards to review yet.</div>;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '18px' }}>
      {reviews.map((r) => {
        const colors = VERDICT_COLORS[r.verdict] || VERDICT_COLORS.Keep;
        return (
          <div key={r.liability_id} className="glass-card" style={{ padding: '18px', border: `1px solid ${colors.border}`, background: colors.bg, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{r.name}</div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{r.issuer}</div>
              </div>
              <span className="badge" style={{ background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text, fontSize: '10px', padding: '4px 10px', borderRadius: '20px' }}>
                {r.verdict}
              </span>
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>{r.reason}</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
              {r.worth_the_fee ? <CheckCircle2 size={13} style={{ color: '#10b981' }} /> : <XCircle size={13} style={{ color: '#ef4444' }} />}
              <span style={{ color: 'var(--text-secondary)' }}>{r.worth_the_fee ? 'Worth the fee' : 'Not worth the fee'}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px', color: 'var(--text-secondary)' }}>
              <span>Annual Fee: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(r.annual_fee)}</strong></span>
              <span>Reward Value: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(r.reward_value)}</strong></span>
              <span>Net Value: <strong style={{ color: r.net_value >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(r.net_value)}</strong></span>
              {r.lounge_utilization !== null && (
                <span>Lounge Use: <strong style={{ color: '#e2e8f0' }}>{(r.lounge_utilization * 100).toFixed(0)}%</strong></span>
              )}
              {r.milestone_on_pace !== null && (
                <span>Milestone Pace: <strong style={{ color: r.milestone_on_pace ? '#10b981' : '#ef4444' }}>{r.milestone_on_pace ? 'On track' : 'Behind'}</strong></span>
              )}
              {r.next_review_date && <span>Next Review: <strong style={{ color: '#e2e8f0' }}>{r.next_review_date}</strong></span>}
            </div>

            {(r.verdict === 'Upgrade-Candidate' || r.verdict === 'Downgrade') && onCompareAlternatives && (
              <button
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', padding: '6px 12px', alignSelf: 'flex-start' }}
                onClick={() => onCompareAlternatives(r.liability_id)}
              >
                <ArrowRightLeft size={12} /> Compare Alternatives
              </button>
            )}

            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', borderTop: '1px solid var(--border-glass)', paddingTop: '8px', marginTop: '2px' }}>
              {r.caveat}
            </div>
          </div>
        );
      })}
    </div>
  );
};
