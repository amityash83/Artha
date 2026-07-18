import React, { useState } from 'react';
import { Info, X } from 'lucide-react';
import { KnowledgeArticle } from '../types';

interface InfoTooltipProps {
  articles: KnowledgeArticle[];
  slug?: string;
  ruleKey?: string;
  size?: number;
}

// The first component in Artha to render a "learn more" affordance — no prior
// tooltip/help pattern exists anywhere in the app to reuse, so this invents it.
// Resolves entirely against the in-memory `articles` array (already loaded via
// InitData) so it never issues its own network request; if no matching article
// exists yet, it renders nothing rather than showing a broken/empty hint.
export const InfoTooltip: React.FC<InfoTooltipProps> = ({ articles, slug, ruleKey, size = 14 }) => {
  const [hovering, setHovering] = useState(false);
  const [modalArticle, setModalArticle] = useState<KnowledgeArticle | null>(null);

  const article = articles.find((a) => (slug && a.slug === slug) || (ruleKey && a.related_rule_key === ruleKey));

  if (!article) return null;

  const paragraphs = article.body.split(/\n\s*\n/).filter(Boolean);

  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        aria-label="Learn more"
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
        onClick={() => setModalArticle(article)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer', padding: '2px',
          display: 'inline-flex', alignItems: 'center', color: 'var(--text-muted)',
        }}
      >
        <Info size={size} />
      </button>

      {hovering && (
        <div
          style={{
            position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)',
            marginBottom: '8px', width: '240px', padding: '10px 12px', borderRadius: '10px',
            background: 'var(--bg-secondary)', border: '1px solid var(--border-glass-active)',
            boxShadow: 'var(--shadow-lg)', zIndex: 50, fontSize: '11.5px', lineHeight: 1.4,
            color: 'var(--text-secondary)', pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 700, color: '#f8fafc', marginBottom: '4px' }}>{article.title}</div>
          <div>{article.summary}</div>
          <div style={{ marginTop: '6px', color: 'var(--accent-light)', fontWeight: 600 }}>Learn more &rarr;</div>
        </div>
      )}

      {modalArticle && (
        <div className="modal-overlay" onClick={() => setModalArticle(null)}>
          <div className="modal-content" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
              <div>
                <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--accent-light)', fontWeight: 700 }}>
                  {modalArticle.topic}
                </span>
                <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: '4px 0 0 0' }}>{modalArticle.title}</h3>
              </div>
              <button
                onClick={() => setModalArticle(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {paragraphs.map((p, i) => (
                <p key={i} style={{ margin: 0 }}>{p}</p>
              ))}
            </div>

            {modalArticle.see_also.length > 0 && (
              <div style={{ marginTop: '18px', paddingTop: '14px', borderTop: '1px solid var(--border-glass)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>See also</span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {modalArticle.see_also.map((relatedSlug) => {
                    const related = articles.find((a) => a.slug === relatedSlug);
                    if (!related) return null;
                    return (
                      <button
                        key={relatedSlug}
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: '11px' }}
                        onClick={() => setModalArticle(related)}
                      >
                        {related.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
};
