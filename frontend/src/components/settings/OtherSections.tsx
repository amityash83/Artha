import React, { useEffect, useState } from 'react';
import { ArthaMark } from '../branding/ArthaMark';
import { useBranding } from '../branding/useBranding';
import { ACCENT_PRESETS, MARK_DESCRIPTIONS, MARK_LABELS, MARK_VARIANTS } from '../branding/presets';
import { AmountInput, api, Group, Row, SectionHeader, SectionProps } from './ui';

// ---------------------------------------------------------------------------
// AI assistant: an explicit Save here (unlike the rest of Settings), since half-typed
// credentials shouldn't be saved as you type.
// ---------------------------------------------------------------------------

type Provider = 'none' | 'ollama' | 'openai' | 'anthropic';
interface AiSettings { provider: Provider; endpoint: string; model: string; max_tokens: number; api_key_set: boolean }

const PROVIDERS: { id: Provider; label: string; hint: string }[] = [
  { id: 'none', label: 'Off', hint: 'No network requests of any kind.' },
  { id: 'ollama', label: 'Ollama (on this computer)', hint: 'Runs a local model; nothing leaves your machine.' },
  { id: 'openai', label: 'OpenAI or compatible', hint: 'Sends the figures being explained to the provider.' },
  { id: 'anthropic', label: 'Anthropic (Claude)', hint: 'Sends the figures being explained to the provider.' },
];

export const AiSection: React.FC<SectionProps> = ({ onRefresh }) => {
  const [s, setS] = useState<AiSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Partial<AiSettings>>('/api/ai/settings')
      .then((d) => setS({ provider: d.provider || 'none', endpoint: d.endpoint || '', model: d.model || '', max_tokens: d.max_tokens || 500, api_key_set: !!d.api_key_set }))
      .catch(() => setS({ provider: 'none', endpoint: '', model: '', max_tokens: 500, api_key_set: false }));
  }, []);
  if (!s) return <SectionHeader title="AI assistant" intro="Loading…" />;
  const set = (patch: Partial<AiSettings>) => setS({ ...s, ...patch });
  const remote = s.provider === 'openai' || s.provider === 'anthropic';

  const save = async () => {
    setBusy(true);
    try {
      await api('/api/ai/settings', { method: 'PUT', body: JSON.stringify({ provider: s.provider, endpoint: s.endpoint, api_key: apiKey, model: s.model, max_tokens: s.max_tokens }) });
      if (apiKey) { set({ api_key_set: true }); setApiKey(''); }
      setStatus({ text: 'Saved.', ok: true });
      onRefresh();
    } catch (e) {
      setStatus({ text: `Not saved: ${(e as Error).message}`, ok: false });
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setStatus({ text: 'Testing…', ok: true });
    try {
      const out = await api<{ reply: string }>('/api/ai/test', { method: 'POST' });
      setStatus({ text: `Connected. The model replied: “${out.reply}”`, ok: true });
    } catch (e) {
      setStatus({ text: `Connection failed: ${(e as Error).message}`, ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionHeader title="AI assistant" intro="Optional. The assistant only explains numbers Artha has already calculated; it never computes or changes anything." />
      <Group title="Provider">
        <Row label="Use" htmlFor="ai-provider" description={PROVIDERS.find((p) => p.id === s.provider)?.hint}>
          <select id="ai-provider" className="settings-input" value={s.provider} onChange={(e) => set({ provider: e.target.value as Provider })}>
            {PROVIDERS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
        </Row>
        {s.provider === 'ollama' && (
          <Row label="Ollama address" htmlFor="ai-endpoint">
            <input id="ai-endpoint" className="settings-input" style={{ width: '260px' }} placeholder="http://localhost:11434" value={s.endpoint} onChange={(e) => set({ endpoint: e.target.value })} />
          </Row>
        )}
        {remote && (
          <Row label="API key" htmlFor="ai-key" description={s.api_key_set ? 'A key is saved. Leave blank to keep it.' : 'Stored on this computer only.'}>
            <input id="ai-key" type="password" autoComplete="off" className="settings-input" style={{ width: '260px' }}
              placeholder={s.api_key_set ? '••••••••  (saved)' : 'Paste your key'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </Row>
        )}
        {s.provider === 'openai' && (
          <Row label="Base URL" htmlFor="ai-base" description="Only for OpenAI-compatible services; leave blank for OpenAI.">
            <input id="ai-base" className="settings-input" style={{ width: '260px' }} placeholder="https://api.openai.com/v1" value={s.endpoint} onChange={(e) => set({ endpoint: e.target.value })} />
          </Row>
        )}
        {s.provider !== 'none' && (
          <>
            <Row label="Model" htmlFor="ai-model">
              <input id="ai-model" className="settings-input" style={{ width: '260px' }} value={s.model} onChange={(e) => set({ model: e.target.value })}
                placeholder={s.provider === 'ollama' ? 'llama3.1' : s.provider === 'openai' ? 'gpt-4o-mini' : 'claude-haiku-4-5'} />
            </Row>
            <Row label="Longest answer" htmlFor="ai-tokens" description="In tokens (roughly ¾ of a word each).">
              <AmountInput id="ai-tokens" label="Longest answer in tokens" value={s.max_tokens} width={70} onChange={(v) => set({ max_tokens: Math.max(50, Math.round(v)) })} />
            </Row>
          </>
        )}
        <Row label={status ? <span role="status" style={{ fontSize: '12.5px', color: status.ok ? 'var(--text-secondary)' : '#fca5a5' }}>{status.text}</span> : ''}>
          {s.provider !== 'none' && <button type="button" className="settings-btn" disabled={busy} onClick={test}>Test connection</button>}
          <button type="button" className="settings-btn settings-btn--primary" disabled={busy} onClick={save}>Save</button>
        </Row>
      </Group>
    </>
  );
};

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

export const AppearanceSection: React.FC = () => {
  const { variant, accentId, accentColor, setVariant, setAccentId } = useBranding();
  return (
    <>
      <SectionHeader title="Appearance" intro="The mark and accent colour in the sidebar. Saved on this computer; the app icon itself doesn't change." />
      <Group title="Mark">
        <Row stacked label="" >
          <div role="radiogroup" aria-label="Mark" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', width: '100%' }}>
            {MARK_VARIANTS.map((v) => (
              <button key={v} type="button" role="radio" aria-checked={variant === v} onClick={() => setVariant(v)}
                style={{
                  display: 'flex', gap: '12px', alignItems: 'center', textAlign: 'left', padding: '12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  background: variant === v ? 'rgba(139,92,246,0.10)' : 'transparent',
                  border: `1px solid ${variant === v ? accentColor : 'var(--border-glass)'}`, color: 'var(--text-primary)',
                }}>
                <span style={{ flexShrink: 0, display: 'inline-flex' }}><ArthaMark variant={v} color={variant === v ? accentColor : 'var(--text-secondary)'} size={30} /></span>
                <span>
                  <span style={{ display: 'block', fontSize: '13px', fontWeight: 600 }}>{MARK_LABELS[v]}</span>
                  <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{MARK_DESCRIPTIONS[v]}</span>
                </span>
              </button>
            ))}
          </div>
        </Row>
      </Group>
      <Group title="Accent colour">
        <Row label={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '10px' }}>
            <ArthaMark variant={variant} color={accentColor} size={20} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '16px' }}>Artha</span>
            <span className="settings-note">preview</span>
          </span>}>
          <div role="radiogroup" aria-label="Accent colour" style={{ display: 'flex', gap: '8px' }}>
            {ACCENT_PRESETS.map((p) => (
              <button key={p.id} type="button" role="radio" aria-checked={accentId === p.id} aria-label={p.name} title={p.name} onClick={() => setAccentId(p.id)}
                style={{ width: '26px', height: '26px', borderRadius: '50%', cursor: 'pointer', background: p.accent,
                  border: accentId === p.id ? '2px solid #f8fafc' : '2px solid transparent', boxShadow: accentId === p.id ? '0 0 0 2px rgba(255,255,255,0.15)' : 'none' }} />
            ))}
          </div>
        </Row>
      </Group>
    </>
  );
};
