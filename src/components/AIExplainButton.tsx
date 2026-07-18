import React, { useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useModalA11y } from '../hooks/useModalA11y';

interface AIExplainButtonProps {
  aiConfigured: boolean;
  ruleKey?: string;
  recommendationIndex?: number;
  contextNote?: string;
  size?: number;
}

// Sibling to InfoTooltip, not a variant of it — InfoTooltip is deliberately
// zero-network (resolves only against in-memory seeded articles); this button
// is the one place that calls out to a live AI provider, so it's kept as its
// own component rather than changing InfoTooltip's no-network contract.
export const AIExplainButton: React.FC<AIExplainButtonProps> = ({
  aiConfigured, ruleKey, recommendationIndex, contextNote, size = 14,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modalRef = useModalA11y(open, () => setOpen(false));

  const handleClick = async () => {
    if (!aiConfigured) return;
    setOpen(true);
    setLoading(true);
    setError(null);
    setExplanation(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/explain`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rule_key: ruleKey, recommendation_index: recommendationIndex, context_note: contextNote || '' }),
      });
      const json = await res.json();
      if (res.ok) {
        setExplanation(json.explanation);
      } else {
        setError(json.detail || 'AI request failed');
      }
    } catch (err) {
      console.error(err);
      setError('AI request failed — check your connection and AI settings.');
    } finally {
      setLoading(false);
    }
  };

  if (!aiConfigured) {
    return (
      <span title="Set up AI Assistant in Settings to enable this" style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.35 }}>
        <Sparkles size={size} />
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        aria-label="Ask AI to explain"
        onClick={handleClick}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', display: 'inline-flex', alignItems: 'center', color: 'var(--accent-light)' }}
      >
        <Sparkles size={size} />
      </button>

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: '480px' }}
            onClick={(e) => e.stopPropagation()}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-explain-title"
            tabIndex={-1}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
              <h3 id="ai-explain-title" style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Sparkles size={16} style={{ color: 'var(--accent-light)' }} /> AI Explanation
              </h3>
              <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                <X size={18} />
              </button>
            </div>

            {loading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '13px', padding: '20px 0' }}>
                <Loader2 size={16} style={{ animation: 'artha-spin 1s linear infinite' }} /> Thinking...
              </div>
            )}

            {!loading && error && (
              <div style={{ fontSize: '13px', color: '#ef4444', padding: '8px 0' }}>{error}</div>
            )}

            {!loading && explanation && (
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {explanation}
              </div>
            )}

            <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '16px', paddingTop: '10px', borderTop: '1px solid var(--border-glass)' }}>
              AI-generated explanation of numbers Artha already computed — not financial advice.
            </div>
          </div>
        </div>
      )}
    </span>
  );
};
