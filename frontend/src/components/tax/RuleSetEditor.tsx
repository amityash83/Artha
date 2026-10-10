import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Plus, Save, Trash2 } from 'lucide-react';
import { TaxRuleItem, TaxRuleSetChange, TaxRuleSetContent, TaxRuleSetMeta, TaxRuleSetSource, TaxVerification } from '../../types';
import { apiJson, EmptyState, ErrorBanner, Pill, Section, SubTabs, VERIFICATION_STYLES, VerificationBadge } from './taxUi';
import { humanize, Json, RuleValueEditor } from './RuleValueEditor';

const isItem = (v: unknown): v is TaxRuleItem => !!v && typeof v === 'object' && 'value' in (v as object) && 'verification' in (v as object);

function flatten(value: unknown, prefix = '', out: Record<string, string> = {}): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = JSON.stringify(value);
  }
  return out;
}

function localDiff(before: unknown, after: unknown): TaxRuleSetChange[] {
  const a = flatten(before);
  const b = flatten(after);
  return Array.from(new Set([...Object.keys(a), ...Object.keys(b)])).sort()
    .filter((p) => a[p] !== b[p])
    .map((p) => ({
      path: p,
      before: a[p] === undefined ? null : JSON.parse(a[p]),
      after: b[p] === undefined ? null : JSON.parse(b[p]),
      added: a[p] === undefined,
      removed: b[p] === undefined,
    }));
}

const showValue = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export const ChangeList: React.FC<{ changes: TaxRuleSetChange[]; empty: string }> = ({ changes, empty }) => (
  changes.length === 0 ? <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{empty}</span> : (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' }}>
      {changes.map((c) => (
        <li key={c.path} style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
          <code style={{ color: 'var(--accent-light)' }}>{c.path}</code>:{' '}
          {c.added ? <>added <strong>{showValue(c.after)}</strong></> : c.removed ? <>removed (was {showValue(c.before)})</>
            : <><span style={{ textDecoration: 'line-through', color: 'var(--text-muted)' }}>{showValue(c.before)}</span> → <strong style={{ color: 'var(--text-primary)' }}>{showValue(c.after)}</strong></>}
        </li>
      ))}
    </ul>
  )
);

const ItemEditor: React.FC<{
  path: string;
  item: TaxRuleItem;
  sources: TaxRuleSetSource[];
  readOnly: boolean;
  onChange: (item: TaxRuleItem) => void;
}> = ({ path, item, sources, readOnly, onChange }) => {
  const id = `rule-${path.replace(/\./g, '-')}`;
  const meta = (key: keyof TaxRuleItem, label: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      <label htmlFor={`${id}-${key}`} style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{label}</label>
      <input id={`${id}-${key}`} className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} readOnly={readOnly}
        value={(item[key] as string) ?? ''} onChange={(e) => onChange({ ...item, [key]: e.target.value || undefined })} />
    </div>
  );
  return (
    <div className="glass-card" style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{humanize(path.split('.').pop() ?? path)}</div>
          <code style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>{path}</code>
        </div>
        <VerificationBadge level={item.verification} />
      </div>
      <RuleValueEditor value={item.value as Json} readOnly={readOnly} label={humanize(path)} path={id}
        onChange={(value) => onChange({ ...item, value })} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label htmlFor={`${id}-verification`} style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Verification</label>
          <select id={`${id}-verification`} className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} disabled={readOnly}
            value={item.verification} onChange={(e) => onChange({ ...item, verification: e.target.value as TaxVerification })}>
            {(Object.keys(VERIFICATION_STYLES) as TaxVerification[]).map((v) => <option key={v} value={v}>{VERIFICATION_STYLES[v].label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <label htmlFor={`${id}-source`} style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Source</label>
          <select id={`${id}-source`} className="form-input" style={{ padding: '4px 8px', fontSize: '12px' }} disabled={readOnly}
            value={item.source ?? ''} onChange={(e) => onChange({ ...item, source: e.target.value || undefined })}>
            <option value="">None</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </div>
        {meta('legacy_section', 'Section (1961 Act)')}
        {meta('act_2025_section', 'Section (2025 Act)')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
        <label htmlFor={`${id}-note`} style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Note</label>
        <textarea id={`${id}-note`} className="form-input" rows={2} style={{ padding: '4px 8px', fontSize: '12px' }} readOnly={readOnly}
          value={item.note ?? ''} onChange={(e) => onChange({ ...item, note: e.target.value || undefined })} />
      </div>
    </div>
  );
};

interface RuleSetEditorProps {
  ruleSetId: string;
  onClose: () => void;
  onCopy: (meta: TaxRuleSetMeta) => void;
  onChanged: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

type EditorTab = 'general' | 'new' | 'old' | 'sources' | 'history';

export const RuleSetEditor: React.FC<RuleSetEditorProps> = ({ ruleSetId, onClose, onCopy, onChanged, showToast }) => {
  const [versions, setVersions] = useState<TaxRuleSetMeta[]>([]);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [meta, setMeta] = useState<TaxRuleSetMeta | null>(null);
  const [saved, setSaved] = useState<TaxRuleSetContent | null>(null);
  const [draft, setDraft] = useState<TaxRuleSetContent | null>(null);
  const [savedChanges, setSavedChanges] = useState<{ against: TaxRuleSetMeta | null; changes: TaxRuleSetChange[] } | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<EditorTab>('general');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (version: number | null) => {
    setError(null);
    try {
      const v = await apiJson<TaxRuleSetMeta[]>(`/api/tax/rule-sets/${encodeURIComponent(ruleSetId)}/versions`);
      setVersions(v);
      const q = version ? `?version=${version}` : '';
      const r = await apiJson<{ meta: TaxRuleSetMeta; content: TaxRuleSetContent }>(`/api/tax/rule-sets/${encodeURIComponent(ruleSetId)}${q}`);
      setMeta(r.meta);
      setSaved(r.content);
      setDraft(JSON.parse(JSON.stringify(r.content)));
      setSavedChanges(await apiJson(`/api/tax/rule-sets/${encodeURIComponent(ruleSetId)}/diff${q}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [ruleSetId]);

  useEffect(() => { load(viewVersion); }, [load, viewVersion]);

  const latest = versions[0]?.version;
  const readOnly = !meta || meta.source !== 'user' || meta.status !== 'active' || meta.version !== latest;
  const unsaved = useMemo(() => (saved && draft ? localDiff(saved, draft) : []), [saved, draft]);

  if (error && !draft) return <ErrorBanner message={error} />;
  if (!meta || !draft || !saved) return <EmptyState>Loading rule set…</EmptyState>;

  const setTop = (key: string, value: unknown) => setDraft({ ...draft, [key]: value } as TaxRuleSetContent);
  const setRegimeItem = (regime: 'old' | 'new', key: string, item: TaxRuleItem) =>
    setDraft({ ...draft, regimes: { ...draft.regimes, [regime]: { ...draft.regimes[regime], [key]: item } } });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await apiJson<TaxRuleSetMeta>(`/api/tax/rule-sets/${encodeURIComponent(ruleSetId)}`, {
        method: 'PUT',
        body: JSON.stringify({ content: draft, name: draft.name, note: changeNote || null }),
      });
      showToast?.(r.unchanged ? 'No changes to save' : `Saved as version ${r.version}`, r.unchanged ? 'info' : 'success');
      setChangeNote('');
      setViewVersion(null);
      await load(null);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const topItems = Object.entries(draft).filter(([, v]) => isItem(v)) as [string, TaxRuleItem][];
  const sources = draft.sources ?? [];

  const regimePanel = (regime: 'old' | 'new') => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '12px' }}>
      {Object.entries(draft.regimes[regime]).filter(([, v]) => isItem(v)).map(([key, item]) => (
        <ItemEditor key={key} path={`regimes.${regime}.${key}`} item={item as TaxRuleItem} sources={sources} readOnly={readOnly}
          onChange={(it) => setRegimeItem(regime, key, it)} />
      ))}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }} onClick={onClose}>
          <ArrowLeft size={13} /> All rule sets
        </button>
        <h2 style={{ fontSize: '16px', margin: 0, color: 'var(--text-primary)' }}>{meta.name}</h2>
        <Pill color={meta.source === 'shipped' ? '#60a5fa' : '#ec4899'}>{meta.source === 'shipped' ? 'Official (read-only)' : 'Your rule set'}</Pill>
        {meta.status === 'archived' && <Pill color="#94a3b8">Archived</Pill>}
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{meta.rule_set_id} · FY {meta.financial_year}</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
          {versions.length > 1 && (
            <select aria-label="Version" className="form-input" style={{ padding: '5px 8px', fontSize: '12px', width: 'auto' }}
              value={viewVersion ?? meta.version} onChange={(e) => setViewVersion(Number(e.target.value) === latest ? null : Number(e.target.value))}>
              {versions.map((v) => <option key={v.version} value={v.version}>v{v.version}{v.version === latest ? ' (latest)' : ''}</option>)}
            </select>
          )}
          <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }} onClick={() => onCopy(meta)}>
            <Copy size={13} /> Copy to edit
          </button>
        </span>
      </div>

      {readOnly && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          {meta.source === 'shipped' ? 'Official rule sets are read-only. Copy this one to make changes.'
            : meta.status === 'archived' ? 'Restore this rule set to edit it.' : 'You are viewing an older version; only the latest version can be edited.'}
        </div>
      )}
      {error && <ErrorBanner message={error} />}

      <SubTabs label="Rule set sections" active={tab} onChange={setTab} tabs={[
        { key: 'general', label: 'General & common rules' },
        { key: 'new', label: 'New regime' },
        { key: 'old', label: 'Old regime' },
        { key: 'sources', label: `Sources (${sources.length})` },
        { key: 'history', label: 'Changes & history' },
      ]} />

      {tab === 'general' && (
        <>
          <Section title="About this rule set">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px' }}>
              {(['name', 'act'] as const).map((k) => (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <label htmlFor={`rs-${k}`} className="form-label" style={{ fontSize: '12px' }}>{k === 'name' ? 'Name' : 'Governing Act'}</label>
                  <input id={`rs-${k}`} className="form-input" style={{ padding: '6px 10px', fontSize: '13px' }} readOnly={readOnly}
                    value={(draft[k] as string) ?? (k === 'name' ? meta.name : '')} onChange={(e) => setTop(k, e.target.value)} />
                </div>
              ))}
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingTop: '22px' }}>
                FY {draft.financial_year} · AY {draft.assessment_year} · {String(draft.effective_from ?? '')} to {String(draft.effective_to ?? '')}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label htmlFor="rs-status-note" className="form-label" style={{ fontSize: '12px' }}>Status note</label>
              <textarea id="rs-status-note" className="form-input" rows={3} style={{ padding: '6px 10px', fontSize: '12.5px' }} readOnly={readOnly}
                value={(draft.status_note as string) ?? ''} onChange={(e) => setTop('status_note', e.target.value)} />
            </div>
          </Section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '12px' }}>
            {topItems.map(([key, item]) => (
              <ItemEditor key={key} path={key} item={item} sources={sources} readOnly={readOnly} onChange={(it) => setTop(key, it)} />
            ))}
          </div>
        </>
      )}
      {tab === 'new' && regimePanel('new')}
      {tab === 'old' && regimePanel('old')}

      {tab === 'sources' && (
        <Section title="Sources" subtitle="Items reference these by id. Removing a source that an item still uses will be rejected on save.">
          {sources.map((s, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 90px 36px', gap: '8px', alignItems: 'center' }}>
              {(['id', 'title', 'url'] as const).map((k) => (
                <input key={k} aria-label={`Source ${i + 1} ${k}`} className="form-input" style={{ padding: '5px 8px', fontSize: '12px' }} readOnly={readOnly}
                  value={s[k] ?? ''} onChange={(e) => setTop('sources', sources.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
              ))}
              <label style={{ fontSize: '11.5px', color: 'var(--text-secondary)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                <input type="checkbox" checked={!!s.official} disabled={readOnly}
                  onChange={(e) => setTop('sources', sources.map((x, j) => (j === i ? { ...x, official: e.target.checked } : x)))} /> Official
              </label>
              {!readOnly && (
                <button className="btn btn-secondary" aria-label={`Remove source ${s.id}`} style={{ padding: '4px 6px' }}
                  onClick={() => setTop('sources', sources.filter((_, j) => j !== i))}><Trash2 size={12} /></button>
              )}
            </div>
          ))}
          {!readOnly && (
            <button className="btn btn-secondary" style={{ padding: '5px 12px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center', alignSelf: 'flex-start' }}
              onClick={() => setTop('sources', [...sources, { id: `source-${sources.length + 1}`, title: '', url: '', accessed: new Date().toISOString().slice(0, 10), official: false }])}>
              <Plus size={12} /> Add source
            </button>
          )}
        </Section>
      )}

      {tab === 'history' && (
        <>
          <Section title={`What changed in v${meta.version}`}
            subtitle={savedChanges?.against ? `Compared with ${savedChanges.against.rule_set_id} v${savedChanges.against.version}.` : 'Nothing to compare against.'}>
            <ChangeList changes={savedChanges?.changes ?? []} empty="No differences." />
          </Section>
          <Section title="Versions">
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {versions.map((v) => (
                <li key={v.version} style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text-primary)' }}>v{v.version}</strong>
                  {v.created_at && ` · ${v.created_at}`}{v.note && ` · ${v.note}`}
                  {v.based_on_rule_set_id && v.version === 1 && ` · copied from ${v.based_on_rule_set_id} v${v.based_on_version}`}
                </li>
              ))}
            </ul>
          </Section>
        </>
      )}

      {!readOnly && (
        <div className="glass-panel" style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px', position: 'sticky', bottom: '8px' }}>
          {/* Actions sit on the left: the app's toasts stack bottom-right and would cover them. */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px', display: 'flex', gap: '6px', alignItems: 'center' }}
              disabled={!unsaved.length || saving} onClick={save}>
              <Save size={13} /> Save as v{meta.version + 1}
            </button>
            <button className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} disabled={!unsaved.length || saving}
              onClick={() => setDraft(JSON.parse(JSON.stringify(saved)))}>Discard</button>
            <span style={{ fontSize: '12.5px', color: unsaved.length ? 'var(--warning)' : 'var(--text-muted)' }}>
              {unsaved.length ? `${unsaved.length} unsaved change${unsaved.length === 1 ? '' : 's'}` : 'No unsaved changes'}
            </span>
            <input aria-label="Change note" className="form-input" style={{ padding: '6px 10px', fontSize: '12.5px', flex: '1 1 260px', maxWidth: '520px' }}
              placeholder="What changed and why (e.g. Budget 2027 proposal)" value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
          </div>
          {unsaved.length > 0 && (
            <>
              <ChangeList changes={unsaved} empty="" />
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Changed values are saved as "User-entered rule" automatically, whatever verification is selected.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
