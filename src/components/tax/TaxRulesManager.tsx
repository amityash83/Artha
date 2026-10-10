import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Archive, ArchiveRestore, CheckCircle2, Copy, Download, FileUp, Pencil, Trash2 } from 'lucide-react';
import { TaxRuleSetContent, TaxRuleSetMeta } from '../../types';
import { apiJson, EmptyState, ErrorBanner, Pill, Section } from './taxUi';
import { RuleSetEditor } from './RuleSetEditor';

interface TaxRulesManagerProps {
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const btn: React.CSSProperties = { padding: '4px 9px', fontSize: '11.5px', display: 'flex', gap: '4px', alignItems: 'center' };

const nextFY = (fy: string) => {
  const start = parseInt(fy.slice(0, 4), 10) + 1;
  return `${start}-${String(start + 1).slice(2)}`;
};

export const TaxRulesManager: React.FC<TaxRulesManagerProps> = ({ showToast }) => {
  const [sets, setSets] = useState<TaxRuleSetMeta[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [copying, setCopying] = useState<TaxRuleSetMeta | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyFY, setCopyFY] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    apiJson<TaxRuleSetMeta[]>('/api/tax/rule-sets').then(setSets).catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const startCopy = (meta: TaxRuleSetMeta) => {
    setEditing(null);
    setCopying(meta);
    setCopyName(`My ${meta.financial_year} rules`);
    setCopyFY(meta.financial_year);
  };

  const doCopy = () => run(async () => {
    if (!copying) return;
    const created = await apiJson<TaxRuleSetMeta>('/api/tax/rule-sets', {
      method: 'POST',
      body: JSON.stringify({
        name: copyName, based_on_rule_set_id: copying.rule_set_id, based_on_version: copying.version,
        financial_year: copyFY !== copying.financial_year ? copyFY : null,
      }),
    });
    showToast?.(`Created ${created.name}`, 'success');
    setCopying(null);
    load();
    setEditing(created.rule_set_id);
  });

  const select = (fy: string, ruleSetId: string | null) => run(async () => {
    await apiJson(`/api/tax/rule-set-selection/${fy}`, { method: 'PUT', body: JSON.stringify({ rule_set_id: ruleSetId }) });
    showToast?.(ruleSetId ? `Now using this rule set for FY ${fy}` : `Using the official rules for FY ${fy}`, 'success');
    load();
  });

  const setStatus = (meta: TaxRuleSetMeta, action: 'archive' | 'restore') => run(async () => {
    await apiJson(`/api/tax/rule-sets/${encodeURIComponent(meta.rule_set_id)}/${action}`, { method: 'POST' });
    load();
  });

  const remove = (meta: TaxRuleSetMeta) => {
    if (!window.confirm(`Delete "${meta.name}" and all its versions? This can't be undone.`)) return;
    run(async () => {
      await apiJson(`/api/tax/rule-sets/${encodeURIComponent(meta.rule_set_id)}`, { method: 'DELETE' });
      showToast?.('Rule set deleted', 'success');
      load();
    });
  };

  const exportJson = (meta: TaxRuleSetMeta) => run(async () => {
    const r = await apiJson<{ content: TaxRuleSetContent }>(`/api/tax/rule-sets/${encodeURIComponent(meta.rule_set_id)}`);
    const blob = new Blob([JSON.stringify(r.content, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${meta.rule_set_id}-v${meta.version}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const importJson = (file: File) => run(async () => {
    let content: TaxRuleSetContent;
    try {
      content = JSON.parse(await file.text());
    } catch {
      throw new Error(`${file.name} is not valid JSON`);
    }
    const name = window.prompt('Name for the imported rule set', content.name || file.name.replace(/\.json$/i, ''));
    if (!name) return;
    const created = await apiJson<TaxRuleSetMeta>('/api/tax/rule-sets', { method: 'POST', body: JSON.stringify({ name, content }) });
    showToast?.(`Imported ${created.name} (FY ${created.financial_year})`, 'success');
    load();
  });

  if (editing) {
    return <RuleSetEditor ruleSetId={editing} onClose={() => { setEditing(null); load(); }} onCopy={startCopy} onChanged={load} showToast={showToast} />;
  }

  const years = sets ? Array.from(new Set(sets.map((s) => s.financial_year))).sort().reverse() : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        Official rule sets ship with the app and are read-only. To change a rule, or to draft next year's rules early, copy a rule set and edit the copy.
        Each save creates a new version. Changed values are marked as user-entered in every result that uses them, and saved scenarios keep the exact version they used.
      </div>
      {error && <ErrorBanner message={error} />}

      <div style={{ display: 'flex', gap: '8px' }}>
        <input ref={fileInput} type="file" accept="application/json,.json" style={{ display: 'none' }} aria-label="Import rule set JSON"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
        <button className="btn btn-secondary" style={{ ...btn, padding: '6px 12px', fontSize: '12px' }} onClick={() => fileInput.current?.click()} disabled={busy}>
          <FileUp size={13} /> Import JSON
        </button>
      </div>

      {copying && (
        <Section title={`Copy ${copying.name} (v${copying.version})`}
          subtitle="Choose a different financial year to draft that year's rules. Every value then starts as an assumption until you confirm or change it.">
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', flex: '1 1 240px' }}>
              <label htmlFor="copy-name" className="form-label" style={{ fontSize: '12px' }}>Name</label>
              <input id="copy-name" className="form-input" style={{ padding: '7px 10px', fontSize: '13px' }} value={copyName} onChange={(e) => setCopyName(e.target.value)} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <label htmlFor="copy-fy" className="form-label" style={{ fontSize: '12px' }}>Financial year</label>
              <select id="copy-fy" className="form-input" style={{ padding: '7px 10px', fontSize: '13px' }} value={copyFY} onChange={(e) => setCopyFY(e.target.value)}>
                <option value={copying.financial_year}>{copying.financial_year} (same year)</option>
                <option value={nextFY(copying.financial_year)}>{nextFY(copying.financial_year)} (draft next year)</option>
              </select>
            </div>
            <button className="btn btn-primary" style={{ padding: '7px 14px', fontSize: '12.5px' }} onClick={doCopy} disabled={busy || !copyName.trim()}>Create copy</button>
            <button className="btn btn-secondary" style={{ padding: '7px 14px', fontSize: '12.5px' }} onClick={() => setCopying(null)}>Cancel</button>
          </div>
        </Section>
      )}

      {!sets ? <EmptyState>Loading rule sets…</EmptyState> : years.map((fy) => (
        <Section key={fy} title={`FY ${fy}`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sets.filter((s) => s.financial_year === fy).map((s) => (
              <div key={s.rule_set_id} className="glass-card" style={{
                padding: '12px 14px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap',
                border: s.applies_to_fy ? '1px solid rgba(16, 185, 129, 0.35)' : undefined, opacity: s.status === 'archived' ? 0.6 : 1,
              }}>
                <div style={{ flex: '1 1 260px' }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{s.name}</strong>
                    <Pill color={s.source === 'shipped' ? '#60a5fa' : '#ec4899'}>{s.source === 'shipped' ? 'Official' : 'Yours'}</Pill>
                    {s.applies_to_fy && <Pill color="#10b981">In use for FY {fy}</Pill>}
                    {s.status === 'archived' && <Pill color="#94a3b8">Archived</Pill>}
                  </div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {s.rule_set_id} · v{s.version}{s.version_count && s.version_count > 1 ? ` of ${s.version_count}` : ''}
                    {s.based_on_rule_set_id && ` · copied from ${s.based_on_rule_set_id} v${s.based_on_version}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button className="btn btn-secondary" style={btn} onClick={() => setEditing(s.rule_set_id)}>
                    <Pencil size={12} /> {s.source === 'user' && s.status === 'active' ? 'Edit' : 'View'}
                  </button>
                  <button className="btn btn-secondary" style={btn} onClick={() => startCopy(s)} disabled={busy}><Copy size={12} /> Copy</button>
                  {!s.applies_to_fy && s.status === 'active' && (
                    <button className="btn btn-secondary" style={btn} disabled={busy}
                      onClick={() => select(fy, s.source === 'shipped' ? null : s.rule_set_id)}>
                      <CheckCircle2 size={12} /> Use for FY {fy}
                    </button>
                  )}
                  <button className="btn btn-secondary" style={btn} onClick={() => exportJson(s)} disabled={busy}><Download size={12} /> Export</button>
                  {s.source === 'user' && (s.status === 'active'
                    ? <button className="btn btn-secondary" style={btn} onClick={() => setStatus(s, 'archive')} disabled={busy}><Archive size={12} /> Archive</button>
                    : <button className="btn btn-secondary" style={btn} onClick={() => setStatus(s, 'restore')} disabled={busy}><ArchiveRestore size={12} /> Restore</button>)}
                  {s.source === 'user' && (
                    <button className="btn btn-secondary" style={btn} aria-label={`Delete ${s.name}`} onClick={() => remove(s)} disabled={busy}><Trash2 size={12} /></button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Section>
      ))}
    </div>
  );
};
