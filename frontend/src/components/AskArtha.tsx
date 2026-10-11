import React, { useState } from 'react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import type { NavigateOptions } from './TopBar';

interface AskArthaProps {
  data: InitData;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  onGo?: (page: string, opts?: NavigateOptions) => void;
}

interface QAPair {
  question: string;
  answer: string;
}

const SUGGESTIONS = [
  'Can I afford to prepay my home loan this year?',
  'Which of my loans should I pay off first?',
  'Is my emergency fund enough?',
  'Where could I save more each month?',
];

export const AskArtha: React.FC<AskArthaProps> = ({ data, showToast, onGo }) => {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<QAPair[]>([]);
  const aiConfigured = data.ai_provider && data.ai_provider !== 'none';

  const ask = async (text = question) => {
    const q = text.trim();
    if (!q || loading) return;
    setQuestion(q);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: q }),
      });
      const json = await res.json();
      if (res.ok) {
        setHistory((prev) => [{ question: q, answer: json.answer }, ...prev]);
        setQuestion('');
      } else {
        showToast?.(json.detail || "Couldn't get an answer", 'error');
      }
    } catch {
      showToast?.("Couldn't reach the AI assistant. Check your connection and Settings › AI assistant.", 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Ask Artha</h1>
          <p className="page-subtitle">Ask a question about your finances. Answers use only figures Artha has already worked out.</p>
        </div>
      </div>

      {!aiConfigured ? (
        <div className="settings-group"><div className="ie-empty">
          <p>The AI assistant isn't set up yet. Choose a provider (Ollama on this computer, OpenAI or Anthropic) to ask questions here.</p>
          <div><button type="button" className="settings-btn" onClick={() => onGo?.('settings', { settingsSection: 'ai' })}>Set up the AI assistant</button></div>
        </div></div>
      ) : (
        <>
          <form className="aa-ask" onSubmit={(e) => { e.preventDefault(); void ask(); }}>
            <input className="form-control" placeholder="e.g. Can I afford to prepay my home loan this year?" aria-label="Your question"
              value={question} onChange={(e) => setQuestion(e.target.value)} disabled={loading} />
            <button type="submit" className="btn btn-primary" disabled={loading || !question.trim()}>{loading ? 'Thinking…' : 'Ask'}</button>
          </form>

          {history.length === 0 && !loading && (
            <div className="aa-suggest">
              <span className="cc-note">Try:</span>
              {SUGGESTIONS.map((s) => <button key={s} type="button" className="settings-btn" onClick={() => void ask(s)}>{s}</button>)}
            </div>
          )}

          {history.length > 0 && (
            <div className="settings-group">
              {history.map((qa, i) => (
                <div key={i} className="settings-row settings-row--stacked aa-qa">
                  <div className="settings-row-label">{qa.question}</div>
                  <div className="aa-answer">{qa.answer}</div>
                </div>
              ))}
            </div>
          )}

          <p className="cc-note" style={{ margin: 0 }}>AI-written answers from figures Artha has already worked out; not financial advice. Each question is answered on its own, without memory of earlier ones.</p>
        </>
      )}
    </div>
  );
};
