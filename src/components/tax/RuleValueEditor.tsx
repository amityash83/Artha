import React, { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';

// Generic editor for any rule-set value, dispatched on the value's shape rather than
// on known field names, so a new field added to a rule file is editable without UI
// changes. Shapes: number, boolean, string, null, string list, bracket table
// ([upper_bound|null, rate] pairs, as used by slabs and surcharge tiers), nested
// object. Anything else falls back to a raw JSON box.

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

interface EditorProps {
  value: Json;
  onChange: (value: Json) => void;
  readOnly: boolean;
  label: string;
  path: string;
}

export const humanize = (key: string) =>
  key.replace(/_/g, ' ').replace(/\bpct\b/g, '%').replace(/\bda\b/gi, 'DA').replace(/^\w/, (c) => c.toUpperCase());

const isBracketList = (v: Json): v is [number | null, number][] =>
  Array.isArray(v) && v.length > 0 &&
  v.every((row) => Array.isArray(row) && row.length === 2 && (row[0] === null || typeof row[0] === 'number') && typeof row[1] === 'number');

const isStringList = (v: Json): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

const small: React.CSSProperties = { padding: '5px 8px', fontSize: '12.5px' };

const BracketTable: React.FC<EditorProps & { value: [number | null, number][] }> = ({ value, onChange, readOnly, label, path }) => {
  // Surcharge tiers are [threshold, rate] with no open-ended row; slabs end with [null, rate].
  const openEnded = value[value.length - 1][0] === null;
  const set = (i: number, col: 0 | 1, raw: string) => {
    const next = value.map((r) => [...r] as [number | null, number]);
    const parsed = parseFloat(raw);
    next[i][col] = Number.isFinite(parsed) ? parsed : 0;
    onChange(next as Json);
  };
  const addRow = () => {
    const next = value.map((r) => [...r] as [number | null, number]);
    const insertAt = openEnded ? next.length - 1 : next.length;
    const prevBound = next[insertAt - 1]?.[0] ?? 0;
    next.splice(insertAt, 0, [(prevBound || 0) + 1, next[insertAt - 1]?.[1] ?? 0]);
    onChange(next as Json);
  };
  const removeRow = (i: number) => onChange(value.filter((_, j) => j !== i) as Json);
  return (
    <table style={{ borderCollapse: 'collapse', fontSize: '12.5px' }} aria-label={label}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: '11px' }}>{openEnded ? 'Income up to (₹)' : 'Above (₹)'}</th>
          <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-muted)', fontSize: '11px' }}>Rate %</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {value.map(([bound, rate], i) => (
          <tr key={i}>
            <td style={{ padding: '3px 8px' }}>
              {bound === null ? <span style={{ color: 'var(--text-muted)' }}>and above</span> : (
                <input aria-label={`${label} row ${i + 1} bound`} id={`${path}-${i}-b`} type="number" className="form-input" style={{ ...small, width: '140px' }}
                  value={bound} readOnly={readOnly} onChange={(e) => set(i, 0, e.target.value)} />
              )}
            </td>
            <td style={{ padding: '3px 8px' }}>
              <input aria-label={`${label} row ${i + 1} rate`} id={`${path}-${i}-r`} type="number" className="form-input" style={{ ...small, width: '90px' }}
                value={rate} readOnly={readOnly} onChange={(e) => set(i, 1, e.target.value)} />
            </td>
            <td>
              {!readOnly && bound !== null && value.length > 1 && (
                <button className="btn btn-secondary" style={{ padding: '3px 6px' }} aria-label={`Remove row ${i + 1}`} onClick={() => removeRow(i)}>
                  <Trash2 size={12} />
                </button>
              )}
            </td>
          </tr>
        ))}
        {!readOnly && (
          <tr>
            <td colSpan={3} style={{ padding: '4px 8px' }}>
              <button className="btn btn-secondary" style={{ padding: '3px 10px', fontSize: '11.5px', display: 'flex', gap: '4px', alignItems: 'center' }} onClick={addRow}>
                <Plus size={12} /> Add row
              </button>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
};

const StringList: React.FC<EditorProps & { value: string[] }> = ({ value, onChange, readOnly, label, path }) => {
  const [draft, setDraft] = useState('');
  const add = () => {
    const v = draft.trim();
    if (v && !value.includes(v)) onChange([...value, v]);
    setDraft('');
  };
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
      {value.map((s) => (
        <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 8px', borderRadius: '20px', fontSize: '12px', border: '1px solid var(--border-glass)', color: 'var(--text-secondary)' }}>
          {s}
          {!readOnly && (
            <button aria-label={`Remove ${s}`} onClick={() => onChange(value.filter((x) => x !== s))}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <X size={11} />
            </button>
          )}
        </span>
      ))}
      {!readOnly && (
        <input aria-label={`Add to ${label}`} id={`${path}-add`} className="form-input" style={{ ...small, width: '150px' }} placeholder="Add…" value={draft}
          onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} onBlur={add} />
      )}
    </div>
  );
};

const JsonBox: React.FC<EditorProps> = ({ value, onChange, readOnly, label, path }) => {
  const [text, setText] = useState(JSON.stringify(value, null, 2));
  const [bad, setBad] = useState(false);
  return (
    <div>
      <textarea aria-label={label} id={path} className="form-input" rows={4} style={{ ...small, width: '100%', fontFamily: 'monospace' }}
        value={text} readOnly={readOnly}
        onChange={(e) => {
          setText(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setBad(false);
          } catch {
            setBad(true);
          }
        }} />
      {bad && <div style={{ fontSize: '11px', color: 'var(--danger)' }}>Not valid JSON yet; this field keeps its last valid value.</div>}
    </div>
  );
};

export const RuleValueEditor: React.FC<EditorProps> = (props) => {
  const { value, onChange, readOnly, label, path } = props;
  if (typeof value === 'number') {
    return (
      <input aria-label={label} id={path} type="number" className="form-input" style={{ ...small, width: '160px' }} value={value} readOnly={readOnly}
        onChange={(e) => { const p = parseFloat(e.target.value); onChange(Number.isFinite(p) ? p : 0); }} />
    );
  }
  if (typeof value === 'boolean') {
    return <input aria-label={label} id={path} type="checkbox" checked={value} disabled={readOnly} onChange={(e) => onChange(e.target.checked)} />;
  }
  if (typeof value === 'string') {
    return <input aria-label={label} id={path} className="form-input" style={{ ...small, width: '100%', maxWidth: '420px' }} value={value} readOnly={readOnly} onChange={(e) => onChange(e.target.value)} />;
  }
  if (value === null) {
    return (
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        none {!readOnly && <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '11px', marginLeft: '6px' }} onClick={() => onChange(0)}>Set a number</button>}
      </span>
    );
  }
  if (isBracketList(value)) return <BracketTable {...props} value={value} />;
  if (isStringList(value)) return <StringList {...props} value={value} />;
  if (!Array.isArray(value)) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingLeft: '10px', borderLeft: '2px solid var(--border-glass)' }}>
        {Object.entries(value).map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: 'minmax(160px, 220px) 1fr', gap: '10px', alignItems: 'start' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', paddingTop: '5px' }}>{humanize(k)}</span>
            <RuleValueEditor value={v} readOnly={readOnly} label={`${label} ${humanize(k)}`} path={`${path}-${k}`}
              onChange={(nv) => onChange({ ...value, [k]: nv })} />
          </div>
        ))}
      </div>
    );
  }
  return <JsonBox {...props} />;
};

export type { Json };
