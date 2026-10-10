import React from 'react';
import { API_BASE_URL } from '../../config';
import { TaxAuditLine, TaxVerification } from '../../types';

export const formatINR = (value: number | null | undefined, digits = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: digits, minimumFractionDigits: digits })
    .format(value || 0);

export const formatPct = (value: number | null | undefined) => `${(value ?? 0).toFixed(2)}%`;

/** fetch + JSON with the backend's {detail} surfaced as the thrown error message. */
export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return body as T;
}

// How much a figure can be trusted, shown wherever a rule-derived number appears.
export const VERIFICATION_STYLES: Record<TaxVerification, { label: string; color: string; title: string }> = {
  verified: { label: 'Verified', color: '#10b981', title: 'Confirmed against an official government source.' },
  secondary_source: { label: 'Secondary source', color: '#60a5fa', title: 'Consistent across reputable secondary sources; not yet confirmed against the official text.' },
  unverified: { label: 'Unverified', color: '#f59e0b', title: 'Could not be confirmed for this financial year. Treat with caution.' },
  assumption: { label: 'Assumption', color: '#f59e0b', title: 'An assumption (e.g. carried over from another year) until confirmed.' },
  user_entered: { label: 'User-entered rule', color: '#ec4899', title: 'Changed by you in your own rule set.' },
};

export const SOURCE_STYLES: Record<TaxAuditLine['source'], { label: string; color: string; title: string }> = {
  input: { label: 'Your input', color: '#a78bfa', title: 'A figure you entered.' },
  rule: { label: 'Tax rule', color: '#60a5fa', title: 'Computed from the selected rule set.' },
  derived: { label: 'Derived', color: '#94a3b8', title: 'Arithmetic on the figures above.' },
  assumption: { label: 'Assumption', color: '#f59e0b', title: 'An assumption the engine made.' },
  user_asserted: { label: 'Unchecked claim', color: '#f59e0b', title: 'Taken as you entered it; the engine cannot check eligibility.' },
};

const pillStyle = (color: string): React.CSSProperties => ({
  display: 'inline-block', fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px',
  color, border: `1px solid ${color}55`, background: `${color}14`, whiteSpace: 'nowrap',
});

export const Pill: React.FC<{ color: string; title?: string; children: React.ReactNode }> = ({ color, title, children }) => (
  <span style={pillStyle(color)} title={title}>{children}</span>
);

export const VerificationBadge: React.FC<{ level?: TaxVerification }> = ({ level }) => {
  if (!level) return null;
  const s = VERIFICATION_STYLES[level];
  return <Pill color={s.color} title={s.title}>{s.label}</Pill>;
};

export const SourceBadge: React.FC<{ source: TaxAuditLine['source'] }> = ({ source }) => {
  const s = SOURCE_STYLES[source];
  return <Pill color={s.color} title={s.title}>{s.label}</Pill>;
};

export const Section: React.FC<{ title: string; subtitle?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }> = (
  { title, subtitle, actions, children },
) => (
  <div className="glass-panel" style={{ padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
      <div>
        <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{title}</h3>
        {subtitle && <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px', lineHeight: 1.5 }}>{subtitle}</div>}
      </div>
      {actions}
    </div>
    {children}
  </div>
);

export const fieldGrid: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px',
};

const inputStyle: React.CSSProperties = { padding: '8px 10px', fontSize: '13px' };

interface NumberFieldProps {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
}

export const NumberField: React.FC<NumberFieldProps> = ({ id, label, value, onChange, help, min = 0, max, step, suffix }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label htmlFor={id} className="form-label" style={{ fontSize: '12px' }}>{label}{suffix ? ` (${suffix})` : ''}</label>
    <input
      id={id}
      type="number"
      className="form-input"
      style={inputStyle}
      value={Number.isFinite(value) ? value : 0}
      min={min}
      max={max}
      step={step}
      onChange={(e) => {
        const parsed = parseFloat(e.target.value);
        onChange(Number.isFinite(parsed) ? parsed : 0);
      }}
    />
    {help && <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{help}</span>}
  </div>
);

interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  help?: string;
}

export const SelectField: React.FC<SelectFieldProps> = ({ id, label, value, options, onChange, help }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
    <label htmlFor={id} className="form-label" style={{ fontSize: '12px' }}>{label}</label>
    <select id={id} className="form-input" style={inputStyle} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
    {help && <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{help}</span>}
  </div>
);

export const EmptyState: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>{children}</div>
);

export const ErrorBanner: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" style={{
    padding: '10px 14px', borderRadius: '10px', fontSize: '12.5px', lineHeight: 1.5,
    background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5',
  }}>{message}</div>
);

export const SubTabs = <T extends string>({ tabs, active, onChange, label }: {
  tabs: { key: T; label: string }[]; active: T; onChange: (key: T) => void; label: string;
}) => (
  <div role="tablist" aria-label={label} style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '18px' }}>
    {tabs.map((t) => (
      <button
        key={t.key}
        role="tab"
        aria-selected={active === t.key}
        onClick={() => onChange(t.key)}
        style={{
          padding: '6px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '20px', cursor: 'pointer',
          border: `1px solid ${active === t.key ? 'var(--border-glass-active)' : 'var(--border-glass)'}`,
          background: active === t.key ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
          color: active === t.key ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        {t.label}
      </button>
    ))}
  </div>
);

/** Dims content computed from older inputs while a fresh computation is pending. */
export const Freshness: React.FC<{ stale: boolean; children: React.ReactNode }> = ({ stale, children }) => (
  <div aria-busy={stale} style={{ opacity: stale ? 0.45 : 1, transition: 'opacity 120ms', position: 'relative' }}>
    {stale && (
      <span style={{ position: 'absolute', top: 6, right: 8, fontSize: '11px', color: 'var(--text-secondary)', zIndex: 1 }}>
        Updating…
      </span>
    )}
    {children}
  </div>
);
