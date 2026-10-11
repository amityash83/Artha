import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config';

// Building blocks shared by every Settings section, so each one looks and behaves the
// same: groups of "label + description | control" rows, switches, money/percent inputs,
// changes that save themselves, and a two-step confirm for anything destructive.

export async function api<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init?.headers : { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body && typeof body.detail === 'string' ? body.detail : `Request failed (${res.status})`);
  return body as T;
}

export const SectionHeader: React.FC<{ title: string; intro?: React.ReactNode }> = ({ title, intro }) => (
  <div>
    <h2 className="settings-section-title">{title}</h2>
    {intro && <p className="settings-section-intro">{intro}</p>}
  </div>
);

export const Group: React.FC<{ title?: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }> = ({ title, description, actions, children }) => (
  <section aria-label={title}>
    {(title || actions) && (
      <div className="settings-group-head">
        <div>
          {title && <h3 className="settings-group-title">{title}</h3>}
          {description && <p className="settings-group-desc">{description}</p>}
        </div>
        {actions && <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>{actions}</div>}
      </div>
    )}
    <div className="settings-group">{children}</div>
  </section>
);

export const Row: React.FC<{
  label: React.ReactNode;
  description?: React.ReactNode;
  htmlFor?: string;
  stacked?: boolean;
  children?: React.ReactNode;
}> = ({ label, description, htmlFor, stacked, children }) => (
  <div className={`settings-row${stacked ? ' settings-row--stacked' : ''}`}>
    <div className="settings-row-text">
      {htmlFor ? <label htmlFor={htmlFor} className="settings-row-label">{label}</label> : <div className="settings-row-label">{label}</div>}
      {description && <div className="settings-row-desc">{description}</div>}
    </div>
    {children !== undefined && <div className="settings-row-control">{children}</div>}
  </div>
);

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }> = ({ checked, onChange, label, disabled }) => (
  <button type="button" role="switch" aria-checked={checked} aria-label={label} className="settings-switch" disabled={disabled}
    onClick={() => onChange(!checked)} />
);

const groupIndian = (n: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);

/** A number with an optional ₹ prefix or %/days suffix; shows Indian digit grouping until focused. */
export const AmountInput: React.FC<{
  id?: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; label: string; width?: number;
}> = ({ id, value, onChange, prefix, suffix, label, width }) => {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { if (!focused) setDraft(String(value)); }, [value, focused]);
  return (
    <span className="settings-affix">
      {prefix && <span aria-hidden>{prefix}</span>}
      <input id={id} aria-label={label} inputMode="decimal" style={width ? { width } : undefined}
        value={focused ? draft : groupIndian(value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parseFloat(e.target.value.replace(/,/g, ''));
          if (Number.isFinite(n) && n >= 0) onChange(n);
        }} />
      {suffix && <span aria-hidden>{suffix}</span>}
    </span>
  );
};

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Saves after a short pause in typing (or at once), and reports how it went. */
export function useAutoSave<T>(save: (value: T) => Promise<unknown>, delay = 600) {
  const [state, setState] = useState<SaveState>('idle');
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const latest = useRef(save);
  latest.current = save;
  const run = useCallback(async (value: T) => {
    setState('saving');
    try {
      await latest.current(value);
      setState('saved');
      setError(null);
      window.setTimeout(() => setState((s) => (s === 'saved' ? 'idle' : s)), 1800);
    } catch (e) {
      setState('error');
      setError((e as Error).message);
    }
  }, []);
  const schedule = useCallback((value: T, immediate = false) => {
    window.clearTimeout(timer.current);
    if (immediate) void run(value);
    else timer.current = window.setTimeout(() => void run(value), delay);
  }, [delay, run]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { state, error, schedule };
}

export const SaveStatus: React.FC<{ state: SaveState; error?: string | null }> = ({ state, error }) => (
  <span role="status" aria-live="polite" className={`settings-saved${state === 'saved' ? ' settings-saved--saved' : state === 'error' ? ' settings-saved--error' : ''}`}>
    {state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? `Not saved: ${error ?? 'error'}` : ''}
  </span>
);

/** A quiet action that asks "Sure?" in place before doing something destructive. */
export const ConfirmAction: React.FC<{
  label: string; confirmLabel: string; question: string; onConfirm: () => void | Promise<void>; danger?: boolean; disabled?: boolean;
}> = ({ label, confirmLabel, question, onConfirm, danger, disabled }) => {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return <button type="button" className={`settings-link${danger ? ' settings-link--danger' : ''}`} disabled={disabled} onClick={() => setAsking(true)}>{label}</button>;
  }
  return (
    <span style={{ display: 'inline-flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
      {question}
      <button type="button" className={`settings-btn${danger ? ' settings-btn--danger' : ''}`} disabled={busy}
        onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); setAsking(false); } }}>
        {busy ? 'Working…' : confirmLabel}
      </button>
      <button type="button" className="settings-link" onClick={() => setAsking(false)}>Cancel</button>
    </span>
  );
};

export interface SectionProps {
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/** "/a/b/c/d/e/f" -> "/a/…/e/f" when longer than max: keeps where it starts and the folders nearest the file. */
export function shortPath(path: string, max = 52): string {
  if (path.length <= max) return path;
  const sep = path.includes('\\') ? '\\' : '/';
  const parts = path.split(sep);
  let tail = parts.slice(-2).join(sep);
  for (let i = parts.length - 3; i > 1 && `${parts[0]}${sep}${parts[1]}${sep}…${sep}${parts[i]}${sep}${tail}`.length <= max; i--) tail = `${parts[i]}${sep}${tail}`;
  return `${parts.slice(0, 2).join(sep)}${sep}…${sep}${tail}`;
}

/** "/Users/me/artha/data/finance.db" -> { name: "finance.db", folder: "~/artha/data" } */
export function splitPath(path: string): { name: string; folder: string } {
  const parts = path.split(/[\\/]/);
  const name = parts.pop() || path;
  const folder = parts.join(path.includes('\\') ? '\\' : '/').replace(/^\/Users\/[^/]+|^\/home\/[^/]+/, '~');
  return { name, folder };
}
