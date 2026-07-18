import React, { useState } from 'react';
import { Sparkles, Send, Loader2 } from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';

interface AskArthaProps {
  data: InitData;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface QAPair {
  question: string;
  answer: string;
}

export const AskArtha: React.FC<AskArthaProps> = ({ data, showToast }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QAPair[]>([]);

  const aiConfigured = data.ai_provider && data.ai_provider !== 'none';

  const handleAsk = async () => {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (res.ok) {
        setHistory((prev) => [{ question: q, answer: json.answer }, ...prev]);
        setQuestion('');
      } else {
        showToast?.(json.detail || 'AI request failed', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast?.('AI request failed — check your connection and AI settings.', 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ask Artha</h1>
        <p className="page-subtitle">Ask a question about your finances — answers use only data Artha has already computed.</p>
      </div>

      {!aiConfigured ? (
        <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Sparkles size={28} style={{ marginBottom: '12px', opacity: 0.5 }} />
          <p style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>AI Assistant is not set up</p>
          <p style={{ fontSize: '12px' }}>Configure a provider (local Ollama, OpenAI, or Anthropic) under Settings &gt; AI Assistant to ask questions here.</p>
        </div>
      ) : (
        <>
          <div className="glass-panel" style={{ padding: '18px', display: 'flex', gap: '10px', marginBottom: '24px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Can I afford to prepay my home loan this year?"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              style={{ flex: 1 }}
            />
            <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px' }} onClick={handleAsk} disabled={loading}>
              {loading ? <Loader2 size={14} style={{ animation: 'artha-spin 1s linear infinite' }} /> : <Send size={14} />}
              {loading ? 'Thinking...' : 'Ask'}
            </button>
          </div>

          {history.length === 0 ? (
            <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              Ask something like "What's my net worth trend?" or "Which of my loans should I prepay first?"
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {history.map((qa, i) => (
                <div key={i} className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>{qa.question}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{qa.answer}</div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '10px', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: '20px' }}>
            AI-generated answers based on data Artha has already computed — not financial advice. Each question is answered independently; there is no memory of prior questions.
          </div>
        </>
      )}
    </div>
  );
};
