import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { KnowledgeArticle } from '../../types';
import { InfoTooltip } from '../InfoTooltip';
import { AmountInput, api, ConfirmAction, Group, Row, SaveStatus, SectionHeader, SectionProps, Switch, useAutoSave } from './ui';

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface Rule { rule_key: string; rule_name: string; description: string | null; value: number; category: string; is_enabled: number }

// Taxation keys superseded by the versioned tax rule sets carry this marker (backend/db.py).
const SUPERSEDED = /^\[Not used/;

function unitOf(name: string): { label: string; prefix?: string; suffix?: string } {
  if (/\(%\)|percentage/i.test(name)) return { label: name.replace(/\s*\(%\)/, ''), suffix: '%' };
  if (/\bdays?\b/i.test(name)) return { label: name, suffix: 'days' };
  return { label: name, prefix: '₹' };
}

const RuleRow: React.FC<{ rule: Rule; articles: KnowledgeArticle[]; onSaved: () => void }> = ({ rule, articles, onSaved }) => {
  const [value, setValue] = useState(rule.value);
  const [enabled, setEnabled] = useState(!!rule.is_enabled);
  const save = useAutoSave(async (r: { value: number; enabled: boolean }) => {
    await api('/api/rules', { method: 'PUT', body: JSON.stringify({ rule_key: rule.rule_key, value: r.value, is_enabled: r.enabled }) });
    onSaved();
  });
  const unit = unitOf(rule.rule_name);
  return (
    <Row htmlFor={`rule-${rule.rule_key}`}
      label={<>{unit.label} <InfoTooltip articles={articles} ruleKey={rule.rule_key} /></>}
      description={<>{rule.description}{save.state !== 'idle' && <> · <SaveStatus state={save.state} error={save.error} /></>}</>}>
      <span style={{ opacity: enabled ? 1 : 0.45 }}>
        <AmountInput id={`rule-${rule.rule_key}`} label={unit.label} value={value} prefix={unit.prefix} suffix={unit.suffix}
          onChange={(v) => { setValue(v); save.schedule({ value: v, enabled }); }} />
      </span>
      <Switch label={`Use ${unit.label}`} checked={enabled} onChange={(v) => { setEnabled(v); save.schedule({ value, enabled: v }, true); }} />
    </Row>
  );
};

export const RulesSection: React.FC<SectionProps> = ({ onRefresh }) => {
  const [rules, setRules] = useState<Rule[]>([]);
  const [articles, setArticles] = useState<KnowledgeArticle[]>([]);
  useEffect(() => {
    api<Rule[]>('/api/metadata/financial_rules').then(setRules).catch(() => setRules([]));
    api<KnowledgeArticle[]>('/api/knowledge-articles').then(setArticles).catch(() => setArticles([]));
  }, []);
  const active = rules.filter((r) => !SUPERSEDED.test(r.description ?? ''));
  const hidden = rules.length - active.length;
  const groups = Array.from(new Set(active.map((r) => r.category)));
  return (
    <>
      <SectionHeader title="Planning rules" intro="The thresholds Artha's recommendations use. Changes save as you type. A rule switched off falls back to Artha's built-in default value." />
      {groups.map((g) => (
        <Group key={g} title={g}>
          {active.filter((r) => r.category === g).map((r) => <RuleRow key={r.rule_key} rule={r} articles={articles} onSaved={onRefresh} />)}
        </Group>
      ))}
      {hidden > 0 && (
        <p className="settings-note">
          {hidden} older income-tax settings are no longer used and aren't shown: tax figures now come from each year&apos;s rule set
          (Taxation → Tax Rules).
        </p>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

interface Category { id: number; name: string; entity_type: string; fields_definition: string | null }
interface Field { name: string; label: string; type: 'text' | 'number' | 'date' }

const ENTITY_TYPES = ['Account', 'Asset', 'Liability', 'Income', 'Expense'] as const;
const PLURAL: Record<string, string> = { Account: 'Accounts', Asset: 'Assets', Liability: 'Liabilities', Income: 'Income', Expense: 'Expenses' };
const TEMPLATES: Record<string, Field[]> = {
  'Mutual fund': [{ name: 'units', label: 'Units', type: 'number' }, { name: 'nav', label: 'NAV', type: 'number' }],
  'Demat account': [{ name: 'broker_name', label: 'Broker Name', type: 'text' }, { name: 'dp_id', label: 'DP ID', type: 'text' }],
  'Insurance policy': [
    { name: 'policy_number', label: 'Policy Number', type: 'text' }, { name: 'coverage', label: 'Coverage Amount', type: 'number' },
    { name: 'premium', label: 'Premium Amount', type: 'number' }, { name: 'renewal_date', label: 'Renewal Date', type: 'date' },
  ],
};
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, '_');

function fieldsOf(cat: Category): Field[] {
  if (!cat.fields_definition) return [];
  try {
    const parsed = typeof cat.fields_definition === 'string' ? JSON.parse(cat.fields_definition) : cat.fields_definition;
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      return Object.entries(parsed).map(([k, t]) => ({ name: k, label: k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' '), type: (t as Field['type']) || 'text' }));
    }
  } catch { /* shown as no custom fields */ }
  return [];
}

const CategoryEditor: React.FC<{ initial: Category | null; type: string; onDone: (saved: boolean) => void }> = ({ initial, type, onDone }) => {
  const [name, setName] = useState(initial?.name ?? '');
  const [entityType, setEntityType] = useState(initial?.entity_type ?? type);
  const [fields, setFields] = useState<Field[]>(initial ? fieldsOf(initial) : []);
  const [error, setError] = useState<string | null>(null);
  const setField = (i: number, patch: Partial<Field>) => setFields((fs) => fs.map((f, j) => {
    if (j !== i) return f;
    const next = { ...f, ...patch };
    if (patch.label !== undefined && (!f.name || f.name === slug(f.label))) next.name = slug(patch.label);
    return next;
  }));
  const save = async () => {
    const clean = fields.filter((f) => f.name.trim()).map((f) => ({ name: f.name.trim(), label: f.label.trim() || f.name.trim(), type: f.type }));
    try {
      await api(initial ? `/api/metadata/categories/${initial.id}` : '/api/metadata/categories', {
        method: initial ? 'PUT' : 'POST',
        body: JSON.stringify({ entity_type: entityType, name: name.trim(), fields_definition: clean.length ? JSON.stringify(clean) : null }),
      });
      onDone(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Group title={initial ? `Edit “${initial.name}”` : 'New category'}>
      <Row label="Name" htmlFor="cat-name">
        <input id="cat-name" className="settings-input" style={{ width: '240px' }} value={name} placeholder="e.g. Sovereign Gold Bond" onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="Used for" htmlFor="cat-type" description={initial ? "A category's type can't change once created." : undefined}>
        <select id="cat-type" className="settings-input" value={entityType} disabled={!!initial} onChange={(e) => setEntityType(e.target.value)}>
          {ENTITY_TYPES.map((t) => <option key={t} value={t}>{PLURAL[t]}</option>)}
        </select>
      </Row>
      <Row stacked label="Extra fields" description="Shown on this category's form, in addition to the standard ones.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input aria-label={`Field ${i + 1} label`} className="settings-input" style={{ flex: 1 }} placeholder="Label (e.g. Units)" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
              <input aria-label={`Field ${i + 1} key`} className="settings-input settings-mono" style={{ width: '150px' }} placeholder="key" value={f.name} onChange={(e) => setField(i, { name: e.target.value })} />
              <select aria-label={`Field ${i + 1} type`} className="settings-input" value={f.type} onChange={(e) => setField(i, { type: e.target.value as Field['type'] })}>
                <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
              </select>
              <button type="button" className="settings-link settings-link--danger" aria-label={`Remove field ${i + 1}`} onClick={() => setFields((fs) => fs.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button type="button" className="settings-btn" onClick={() => setFields((fs) => [...fs, { name: '', label: '', type: 'text' }])}><Plus size={13} /> Add field</button>
            <select aria-label="Start from a template" className="settings-input" value="" onChange={(e) => { if (e.target.value) setFields(TEMPLATES[e.target.value]); }}>
              <option value="">Start from a template…</option>
              {Object.keys(TEMPLATES).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>
      </Row>
      <Row label={error ? <span style={{ color: '#fca5a5', fontSize: '12.5px' }}>{error}</span> : ''}>
        <button type="button" className="settings-btn" onClick={() => onDone(false)}>Cancel</button>
        <button type="button" className="settings-btn settings-btn--primary" disabled={!name.trim()} onClick={save}>{initial ? 'Save changes' : 'Add category'}</button>
      </Row>
    </Group>
  );
};

export const CategoriesSection: React.FC<SectionProps> = ({ onRefresh, showToast }) => {
  const [cats, setCats] = useState<Category[]>([]);
  const [editing, setEditing] = useState<{ cat: Category | null; type: string } | null>(null);
  const load = useCallback(() => { api<Category[]>('/api/metadata/categories').then(setCats).catch(() => setCats([])); }, []);
  useEffect(load, [load]);
  const remove = async (c: Category) => {
    try {
      await api(`/api/metadata/categories/${c.id}`, { method: 'DELETE' });
      showToast?.(`Deleted “${c.name}”`, 'success');
      load();
      onRefresh();
    } catch {
      showToast?.(`Couldn't delete “${c.name}”: it's still used by an account, asset, loan or entry.`, 'error');
    }
  };
  return (
    <>
      <SectionHeader title="Categories" intro="The kinds of accounts, assets, loans, income and expenses you track, and any extra fields each one needs." />
      {editing && (
        <CategoryEditor initial={editing.cat} type={editing.type} onDone={(saved) => {
          setEditing(null);
          if (saved) { load(); onRefresh(); showToast?.('Category saved', 'success'); }
        }} />
      )}
      {ENTITY_TYPES.map((t) => {
        const list = cats.filter((c) => c.entity_type === t);
        return (
          <Group key={t} title={PLURAL[t]}
            actions={<button type="button" className="settings-link" onClick={() => setEditing({ cat: null, type: t })}><Plus size={12} style={{ verticalAlign: '-2px' }} /> Add</button>}>
            {list.length === 0 && <Row label={<span className="settings-note">None yet.</span>} />}
            {list.map((c) => {
              const fields = fieldsOf(c);
              return (
                <Row key={c.id} label={c.name} description={fields.length ? fields.map((f) => f.label).join(' · ') : 'Standard fields only'}>
                  <button type="button" className="settings-link" onClick={() => setEditing({ cat: c, type: t })}>Edit</button>
                  <ConfirmAction label="Delete" confirmLabel="Delete" question="Delete this category?" danger onConfirm={() => remove(c)} />
                </Row>
              );
            })}
          </Group>
        );
      })}
    </>
  );
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

interface Person { id: number; name: string; role: string; risk_tolerance: string }
const ROLES = ['Primary Owner', 'Spouse', 'Dependent'];
const RISKS = ['Conservative', 'Moderate', 'Aggressive'];

const PersonFields: React.FC<{ value: Omit<Person, 'id'>; onChange: (p: Omit<Person, 'id'>) => void; idPrefix: string }> = ({ value, onChange, idPrefix }) => (
  <>
    <input aria-label="Name" id={`${idPrefix}-name`} className="settings-input" style={{ width: '170px' }} placeholder="Name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
    <select aria-label="Role" className="settings-input" value={value.role} onChange={(e) => onChange({ ...value, role: e.target.value })}>
      {ROLES.map((r) => <option key={r}>{r}</option>)}
    </select>
    <select aria-label="Risk tolerance" className="settings-input" value={value.risk_tolerance} onChange={(e) => onChange({ ...value, risk_tolerance: e.target.value })}>
      {RISKS.map((r) => <option key={r}>{r}</option>)}
    </select>
  </>
);

export const PeopleSection: React.FC<SectionProps> = ({ onRefresh, showToast }) => {
  const [people, setPeople] = useState<Person[]>([]);
  const [editing, setEditing] = useState<Person | null>(null);
  const [draft, setDraft] = useState<Omit<Person, 'id'>>({ name: '', role: 'Spouse', risk_tolerance: 'Moderate' });
  const load = useCallback(() => { api<Person[]>('/api/metadata/people').then((p) => setPeople([...p].sort((a, b) => a.name.localeCompare(b.name)))).catch(() => setPeople([])); }, []);
  useEffect(load, [load]);
  const call = async (path: string, method: string, body?: object, done?: string) => {
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      if (done) showToast?.(done, 'success');
      load();
      onRefresh();
      return true;
    } catch (e) {
      showToast?.(method === 'DELETE' ? "Couldn't remove this person: they still own accounts, assets or loans." : (e as Error).message, 'error');
      return false;
    }
  };
  return (
    <>
      <SectionHeader title="People" intro="Whose money this is. Accounts, assets, loans and income each belong to a person; the Tax Planner keeps a plan per person." />
      <Group title="Household">
        {people.map((p) => (editing?.id === p.id ? (
          <Row key={p.id} label={<PersonFields idPrefix={`person-${p.id}`} value={editing} onChange={(v) => setEditing({ ...editing, ...v })} />}>
            <button type="button" className="settings-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="settings-btn settings-btn--primary" disabled={!editing.name.trim()}
              onClick={async () => { if (await call(`/api/metadata/people/${p.id}`, 'PUT', { name: editing.name.trim(), role: editing.role, risk_tolerance: editing.risk_tolerance })) setEditing(null); }}>Save</button>
          </Row>
        ) : (
          <Row key={p.id} label={p.name} description={`${p.role} · ${p.risk_tolerance} risk`}>
            <button type="button" className="settings-link" onClick={() => setEditing({ ...p, risk_tolerance: p.risk_tolerance || 'Moderate' })}>Edit</button>
            <ConfirmAction label="Remove" confirmLabel="Remove" question={`Remove ${p.name}?`} danger onConfirm={() => { void call(`/api/metadata/people/${p.id}`, 'DELETE', undefined, `Removed ${p.name}`); }} />
          </Row>
        )))}
        <Row label={<PersonFields idPrefix="person-new" value={draft} onChange={setDraft} />}>
          <button type="button" className="settings-btn" disabled={!draft.name.trim()}
            onClick={async () => { if (await call('/api/metadata/people', 'POST', { ...draft, name: draft.name.trim() }, `Added ${draft.name.trim()}`)) setDraft({ name: '', role: 'Spouse', risk_tolerance: 'Moderate' }); }}>
            <Plus size={13} /> Add person
          </button>
        </Row>
      </Group>
    </>
  );
};

// ---------------------------------------------------------------------------
// Institutions
// ---------------------------------------------------------------------------

interface Institution { id: number; name: string }

export const InstitutionsSection: React.FC<SectionProps> = ({ onRefresh, showToast }) => {
  const [items, setItems] = useState<Institution[]>([]);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: number; name: string } | null>(null);
  const [newName, setNewName] = useState('');
  const load = useCallback(() => { api<Institution[]>('/api/metadata/institutions').then((d) => setItems([...d].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })))).catch(() => setItems([])); }, []);
  useEffect(load, [load]);
  const shown = useMemo(() => items.filter((i) => i.name.toLowerCase().includes(query.toLowerCase())), [items, query]);
  const call = async (path: string, method: string, body?: object) => {
    try {
      await api(path, { method, body: body ? JSON.stringify(body) : undefined });
      load();
      onRefresh();
      return true;
    } catch (e) {
      showToast?.(method === 'DELETE' ? "Couldn't delete: it's still used by an account, asset or loan." : (e as Error).message, 'error');
      return false;
    }
  };
  return (
    <>
      <SectionHeader title="Banks & institutions" intro="Banks, brokers, insurers and lenders you pick from when adding accounts, assets and loans." />
      <Group title={`${items.length} institutions`}
        actions={<input aria-label="Search institutions" className="settings-input" style={{ width: '200px' }} placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />}>
        <Row label={<input aria-label="New institution name" className="settings-input" style={{ width: '260px' }} placeholder="Add a bank, broker or insurer…" value={newName}
          onChange={(e) => setNewName(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && newName.trim() && await call('/api/metadata/institutions', 'POST', { name: newName.trim() })) setNewName(''); }} />}>
          <button type="button" className="settings-btn" disabled={!newName.trim()}
            onClick={async () => { if (await call('/api/metadata/institutions', 'POST', { name: newName.trim() })) setNewName(''); }}><Plus size={13} /> Add</button>
        </Row>
        {shown.map((i) => (editing?.id === i.id ? (
          <Row key={i.id} label={<input aria-label="Institution name" autoFocus className="settings-input" style={{ width: '260px' }} value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            onKeyDown={async (e) => { if (e.key === 'Enter' && await call(`/api/metadata/institutions/${i.id}`, 'PUT', { name: editing.name.trim() })) setEditing(null); if (e.key === 'Escape') setEditing(null); }} />}>
            <button type="button" className="settings-btn" onClick={() => setEditing(null)}>Cancel</button>
            <button type="button" className="settings-btn settings-btn--primary" disabled={!editing.name.trim()}
              onClick={async () => { if (await call(`/api/metadata/institutions/${i.id}`, 'PUT', { name: editing.name.trim() })) setEditing(null); }}>Save</button>
          </Row>
        ) : (
          <Row key={i.id} label={i.name}>
            <button type="button" className="settings-link" onClick={() => setEditing({ id: i.id, name: i.name })}>Rename</button>
            <ConfirmAction label="Delete" confirmLabel="Delete" question="Delete?" danger onConfirm={() => { void call(`/api/metadata/institutions/${i.id}`, 'DELETE'); }} />
          </Row>
        )))}
        {shown.length === 0 && query && <Row label={<span className="settings-note">No match for “{query}”.</span>} />}
      </Group>
    </>
  );
};
