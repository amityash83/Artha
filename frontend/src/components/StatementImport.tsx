import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Upload } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { formatDate, formatINR } from '../format';
import { InitData } from '../types';
import { ConfirmAction } from './settings/ui';

interface Line {
  line: number;
  date: string;
  description: string;
  reference: string | null;
  amount: number;
  direction: 'in' | 'out';
  balance: number | null;
  status: 'new' | 'duplicate' | 'probable_duplicate';
  match: string | null;
  counterpart: { type: string; id: number; reason?: string } | null;
  category_id: number | null;
}

interface Preview {
  lines: Line[];
  columns: Record<string, string>;
  skipped: number;
  account: { id: number; name: string; balance: number };
  statement_closing: { date: string; balance: number; artha_balance_then: number } | null;
  counts: Record<string, number>;
}

interface PastImport { id: number; account_name: string; file_name: string; imported_at: string; line_count: number; first_date: string; last_date: string; entries_left: number }

/** A line's "goes to" choice: '' (nothing), 'cat:<id>', or '<Account|Liability|Asset>:<id>'. */
const choiceOf = (l: Line) => (l.counterpart ? `${l.counterpart.type}:${l.counterpart.id}` : l.category_id ? `cat:${l.category_id}` : '');

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, init);
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.detail ?? `Request failed (${res.status})`);
  return body as T;
}

/**
 * Bank statement import: pick an account and the bank's CSV/Excel statement, review what's
 * new (lines Artha already has are unticked), say where each one goes, and post them as
 * ordinary ledger entries. Each import can be undone as a whole.
 */
export const StatementImport: React.FC<{
  data: InitData;
  onClose: () => void;
  onImported: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}> = ({ data, onClose, onImported, showToast }) => {
  const accounts = data.accounts.filter((a: any) => a.status !== 'Closed');
  const [accountId, setAccountId] = useState<number | ''>(accounts.length === 1 ? accounts[0].id : '');
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [choice, setChoice] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState<PastImport[]>([]);
  const [showAll, setShowAll] = useState(false);

  const loadPast = () => { call<PastImport[]>('/api/statements/imports').then(setPast).catch(() => setPast([])); };
  useEffect(loadPast, []);

  const read = async (file: File) => {
    if (!accountId) { setError('Choose the account this statement is for first'); return; }
    const form = new FormData();
    form.append('file', file);
    form.append('account_id', String(accountId));
    setBusy(true);
    setError(null);
    try {
      const p = await call<Preview>('/api/statements/preview', { method: 'POST', body: form });
      setPreview(p);
      setFileName(file.name);
      setPicked(Object.fromEntries(p.lines.map((l) => [l.line, l.status === 'new'])));
      setChoice(Object.fromEntries(p.lines.map((l) => [l.line, choiceOf(l)])));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const chosen = preview ? preview.lines.filter((l) => picked[l.line]) : [];
  const signed = (l: Line) => (l.direction === 'in' ? l.amount : -l.amount);
  const net = chosen.reduce((s, l) => s + signed(l), 0);
  // Artha's balance on the statement's last day once these lines are in, to check against the bank's.
  const close = preview?.statement_closing;
  const thenAfter = close ? close.artha_balance_then + chosen.filter((l) => l.date <= close.date).reduce((s, l) => s + signed(l), 0) : 0;
  const gap = close ? thenAfter - close.balance : 0;

  const post = async () => {
    if (!preview || !chosen.length) return;
    const lines = chosen.map((l) => {
      const c = choice[l.line] ?? '';
      const [kind, id] = c.split(':');
      return {
        date: l.date, amount: l.amount, direction: l.direction, description: l.description, reference: l.reference,
        category_id: kind === 'cat' ? Number(id) : null,
        counterpart: kind && kind !== 'cat' ? { type: kind, id: Number(id) } : null,
      };
    });
    setBusy(true);
    try {
      const out = await call<{ posted: number; balance: number }>('/api/statements/import', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_id: preview.account.id, file_name: fileName, lines }),
      });
      showToast?.(`Imported ${out.posted} line${out.posted === 1 ? '' : 's'}. ${preview.account.name} is now ${formatINR(out.balance)}.`, 'success');
      setPreview(null);
      loadPast();
      onImported();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const undo = async (imp: PastImport) => {
    try {
      const out = await call<{ removed: number }>(`/api/statements/imports/${imp.id}`, { method: 'DELETE' });
      showToast?.(`Removed ${out.removed} entr${out.removed === 1 ? 'y' : 'ies'} from ${imp.file_name || 'that import'}`, 'success');
      loadPast();
      onImported();
    } catch (e) {
      showToast?.((e as Error).message, 'error');
    }
  };

  const options = useMemo(() => {
    const byType = (t: string) => data.categories.filter((c) => c.entity_type === t);
    const cards = data.liabilities.filter((l: any) => l.category_name === 'Credit Card');
    const loans = data.liabilities.filter((l: any) => l.category_name !== 'Credit Card');
    return (dir: 'in' | 'out', self: number) => (
      <>
        <option value="">{dir === 'out' ? 'Money out (no category)' : 'Money in (no category)'}</option>
        <optgroup label={dir === 'out' ? 'Spent on' : 'Income'}>
          {byType(dir === 'out' ? 'Expense' : 'Income').map((c) => <option key={c.id} value={`cat:${c.id}`}>{c.name}</option>)}
        </optgroup>
        <optgroup label={dir === 'out' ? 'Moved to my account' : 'Moved from my account'}>
          {data.accounts.filter((a) => a.id !== self).map((a) => <option key={a.id} value={`Account:${a.id}`}>{a.name}</option>)}
        </optgroup>
        {dir === 'out' && cards.length > 0 && (
          <optgroup label="Card bill">{cards.map((l) => <option key={l.id} value={`Liability:${l.id}`}>{l.name}</option>)}</optgroup>
        )}
        {loans.length > 0 && (
          <optgroup label={dir === 'out' ? 'Loan EMI or prepayment' : 'Loan paid out to me'}>{loans.map((l) => <option key={l.id} value={`Liability:${l.id}`}>{l.name}</option>)}</optgroup>
        )}
        <optgroup label={dir === 'out' ? 'Invested in' : 'Redeemed from'}>
          {data.assets.map((a) => <option key={a.id} value={`Asset:${a.id}`}>{a.name}</option>)}
        </optgroup>
      </>
    );
  }, [data]);

  const statusText = (l: Line) => l.status === 'new' ? (l.counterpart?.reason ?? null) : l.match;
  const shownPast = showAll ? past : past.slice(0, 5);

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <button type="button" className="settings-link si-back" onClick={onClose}><ArrowLeft size={13} /> Transactions</button>
          <h1 className="page-title">Import a bank statement</h1>
          <p className="page-subtitle">Download the statement from your bank's website as CSV or Excel (.xlsx). Lines Artha already has are left out, and nothing is saved until you import.</p>
        </div>
      </div>

      {!preview && (
        <>
          <div className="settings-group si-pick">
            <div className="df-field">
              <label className="df-label" htmlFor="si-account">Account</label>
              <select id="si-account" className="form-control" value={accountId} onChange={(e) => setAccountId(e.target.value ? Number(e.target.value) : '')}>
                <option value="">Choose the account</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div className="df-field">
              <span className="df-label">Statement file</span>
              <input id="si-file" type="file" accept=".csv,.xlsx,.txt" style={{ display: 'none' }} disabled={busy}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
              <label htmlFor="si-file" className={`settings-btn${accountId ? '' : ' si-disabled'}`} aria-disabled={!accountId} style={{ cursor: 'pointer' }}><Upload size={13} /> {busy ? 'Reading…' : 'Choose file…'}</label>
            </div>
            {error && <p role="alert" className="si-error">{error}</p>}
          </div>
          {past.length > 0 && (
            <>
              <div className="settings-group-head"><h3 className="settings-group-title">Earlier imports</h3></div>
              <div className="settings-group">
                {shownPast.map((imp) => (
                  <div key={imp.id} className="ie-row si-past">
                    <span className="ie-row-text">
                      <strong>{imp.file_name || 'Statement'} · {imp.account_name ?? 'deleted account'}</strong>
                      <span>{formatDate(imp.first_date)} – {formatDate(imp.last_date)} · {imp.line_count} line{imp.line_count === 1 ? '' : 's'} · imported {formatDate(imp.imported_at.slice(0, 10))}
                        {imp.entries_left < imp.line_count ? ` · ${imp.entries_left} still in the ledger` : ''}</span>
                    </span>
                    <ConfirmAction label="Undo" confirmLabel="Remove them" danger question={`Remove the ${imp.entries_left} entries this import added?`} onConfirm={() => undo(imp)} />
                  </div>
                ))}
                {past.length > 5 && <div className="ie-row"><button type="button" className="settings-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${past.length}`}</button></div>}
              </div>
            </>
          )}
        </>
      )}

      {preview && (
        <>
          <div className="si-summary">
            <div><span className="cc-label">{fileName}</span><strong>{preview.lines.length} lines for {preview.account.name}</strong>
              <span className="cc-note">{preview.counts.new} new · {preview.counts.duplicate} already in Artha · {preview.counts.probable_duplicate} probably already in Artha{preview.skipped ? ` · ${preview.skipped} other rows skipped` : ''}</span></div>
            <div><span className="cc-label">{preview.account.name} after import</span><strong>{formatINR(preview.account.balance + net)}</strong>
              <span className="cc-note">{close
                ? (Math.abs(gap) <= 1 ? `Matches the bank's ${formatINR(close.balance)} on ${formatDate(close.date)}` : `On ${formatDate(close.date)}: bank ${formatINR(close.balance)}, Artha ${formatINR(thenAfter)}`)
                : 'The statement has no balance column to check against'}</span></div>
          </div>
          {close && Math.abs(gap) > 1 && (
            <p className="si-note">Artha would be {formatINR(Math.abs(gap))} {gap > 0 ? 'above' : 'below'} the bank on {formatDate(close.date)}. Usually the opening balance in Artha differs from the bank's, or some lines before this statement are missing. Check the account's opening balance.</p>
          )}
          <div className="settings-group si-table" role="table" aria-label="Statement lines">
            <div className="si-row si-row--head" role="row">
              <span role="columnheader"><input type="checkbox" aria-label="Select all"
                checked={chosen.length === preview.lines.length} onChange={(e) => setPicked(Object.fromEntries(preview.lines.map((l) => [l.line, e.target.checked])))} /></span>
              <span role="columnheader">Date</span><span role="columnheader">Description</span><span role="columnheader">Goes to</span><span role="columnheader" className="si-amt">Amount</span>
            </div>
            {preview.lines.map((l) => (
              <div key={l.line} role="row" className={`si-row${picked[l.line] ? '' : ' si-row--off'}`}>
                <span role="cell"><input type="checkbox" aria-label={`Import line ${l.line}`} checked={!!picked[l.line]} onChange={(e) => setPicked({ ...picked, [l.line]: e.target.checked })} /></span>
                <span role="cell" className="si-date">{formatDate(l.date)}</span>
                <span role="cell" className="si-desc">
                  <span title={l.description}>{l.description || '—'}</span>
                  {statusText(l) && <small className={l.status === 'new' ? 'si-hint' : 'si-dup'}>{statusText(l)}</small>}
                </span>
                <span role="cell">
                  <select className="form-control si-goes" aria-label={`Line ${l.line} goes to`} value={choice[l.line] ?? ''} onChange={(e) => setChoice({ ...choice, [l.line]: e.target.value })}>
                    {options(l.direction, preview.account.id)}
                  </select>
                </span>
                <span role="cell" className={`si-amt${l.direction === 'in' ? ' tl-in' : ''}`}>{l.direction === 'in' ? '+' : '−'}{formatINR(l.amount)}</span>
              </div>
            ))}
          </div>
          {error && <p role="alert" className="si-error">{error}</p>}
          <div className="tx-actions si-actions">
            <button type="button" className="btn btn-primary" disabled={busy || !chosen.length} onClick={() => void post()}>
              Import {chosen.length} line{chosen.length === 1 ? '' : 's'}
            </button>
            <button type="button" className="settings-link" onClick={() => { setPreview(null); setError(null); }}>Choose another file</button>
          </div>
        </>
      )}
    </div>
  );
};
