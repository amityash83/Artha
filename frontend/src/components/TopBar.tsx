import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Database, Plus, Search } from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { isDesktop } from '../platform';
import { AppCommand, NAV_ITEMS, NEW_ITEMS } from '../navigation';
import { SETTINGS_SECTIONS } from './Settings';
import { useModalA11y } from '../hooks/useModalA11y';
import { RemindersButton } from './Reminders';

export interface NavigateOptions { search?: string; settingsSection?: string }

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const GOTO_SHORTCUT = isMac ? '⌘K' : 'Ctrl K';

function sinceText(iso: string | null): string {
  if (!iso) return 'no backup yet';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'backed up just now';
  if (mins < 60) return `backed up ${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `backed up ${hours} h ago`;
  const days = Math.round(hours / 24);
  return `backed up ${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * The slim bar above every page: "Go to" search, "+ New" for the common additions, and
 * which database is open and when it was last backed up. The desktop menu triggers the
 * same commands (App.runCommand), so the two can't drift apart.
 */
export const TopBar: React.FC<{
  data: InitData;
  /** Bumped after a backup so the "backed up …" status refreshes. */
  refreshKey?: number;
  onCommand: (c: AppCommand) => void;
  onNavigate: (page: string, opts?: NavigateOptions) => void;
  /** Changes to open the reminders list (a desktop notification was clicked). */
  remindersNonce?: number;
}> = ({ data, refreshKey, onCommand, onNavigate, remindersNonce }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [db, setDb] = useState<{ name: string; path: string; lastBackup: string | null } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/api/settings/database`).then((r) => r.json()),
      fetch(`${API_BASE_URL}/api/backup/details`).then((r) => r.json()).catch(() => null),
    ]).then(([s, b]) => {
      const path: string = s.active_path || '';
      setDb({ name: path.split(/[\\/]/).pop() || path, path, lastBackup: b?.backups?.[0]?.modified ?? null });
    }).catch(() => setDb(null));
  }, [data, refreshKey]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [menuOpen]);

  return (
    <div className="topbar" role="banner">
      <button type="button" className="topbar-search" onClick={() => onCommand('goto')} aria-label={`Search or go to (${GOTO_SHORTCUT})`}>
        <Search size={14} />
        <span>Search or go to…</span>
        <kbd>{GOTO_SHORTCUT}</kbd>
      </button>
      <div style={{ flex: 1 }} />
      <RemindersButton refreshKey={data} openNonce={remindersNonce} onNavigate={onNavigate} />
      {db && (
        <button type="button" className="topbar-chip" title={`${db.path}\nOpen backup settings`} onClick={() => onNavigate('settings', { settingsSection: 'backups' })}>
          <Database size={13} />
          <span className="topbar-chip-name">{db.name}</span>
          <span className="topbar-chip-sub">· {sinceText(db.lastBackup)}</span>
        </button>
      )}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button type="button" className="topbar-new" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
          <Plus size={14} /> New <ChevronDown size={13} />
        </button>
        {menuOpen && (
          <div role="menu" className="topbar-menu">
            {NEW_ITEMS.map((it) => (
              <button key={it.command} type="button" role="menuitem" className="topbar-menu-item"
                onClick={() => { setMenuOpen(false); onCommand(it.command); }}>
                {it.label}
                {it.command === 'new-transaction' && isDesktop() && <kbd>{isMac ? '⌘N' : 'Ctrl N'}</kbd>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Go to / search (Ctrl/Cmd+K)
// ---------------------------------------------------------------------------

interface PaletteEntry { key: string; label: string; hint: string; haystack: string; run: () => void }

export const CommandPalette: React.FC<{
  data: InitData;
  onClose: () => void;
  onCommand: (c: AppCommand) => void;
  onNavigate: (page: string, opts?: NavigateOptions) => void;
}> = ({ data, onClose, onCommand, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const modalRef = useModalA11y(true, onClose);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  const entries = useMemo<PaletteEntry[]>(() => {
    const go = (page: string, opts?: NavigateOptions) => () => { onClose(); onNavigate(page, opts); };
    const record = (page: string, kind: string) => (r: { name: string; category_name?: string }) => ({
      key: `${page}-${r.name}`, label: r.name, hint: `${kind}${r.category_name ? ` · ${r.category_name}` : ''}`,
      haystack: `${r.name} ${r.category_name ?? ''} ${kind}`.toLowerCase(), run: go(page, { search: r.name }),
    });
    const cards = data.liabilities.filter((l) => l.category_name === 'Credit Card');
    return [
      ...NAV_ITEMS.map((n) => ({ key: `page-${n.id}`, label: n.label, hint: 'Page', haystack: `${n.label} ${n.keywords ?? ''}`.toLowerCase(), run: go(n.id) })),
      ...NEW_ITEMS.map((n) => ({ key: n.command, label: `New ${n.label.toLowerCase()}`, hint: 'Action', haystack: `new add ${n.label}`.toLowerCase(), run: () => { onClose(); onCommand(n.command); } })),
      { key: 'backup-now', label: 'Back up now', hint: 'Action', haystack: 'back up backup now save copy', run: () => { onClose(); onCommand('backup-now'); } },
      ...SETTINGS_SECTIONS.map((s) => ({ key: `settings-${s.id}`, label: `Settings › ${s.label}`, hint: 'Settings', haystack: `settings ${s.label} ${s.keywords}`.toLowerCase(), run: go('settings', { settingsSection: s.id }) })),
      ...data.accounts.map(record('accounts', 'Account')),
      ...data.assets.map(record('assets', 'Asset')),
      ...data.liabilities.filter((l) => l.category_name !== 'Credit Card').map(record('liabilities', 'Loan')),
      ...cards.map(record('credit-cards', 'Credit card')),
      ...data.goals.map(record('goals', 'Goal')),
      ...(data.income ?? []).map(record('income-expenses', 'Income')),
      ...(data.expenses ?? []).map(record('income-expenses', 'Expense')),
    ];
  }, [data, onClose, onCommand, onNavigate]);

  const results = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return entries.filter((e) => e.hint === 'Page' || e.hint === 'Action').slice(0, 40);
    // Matches at the start of a word before ones inside a word ("EMI" finds "EMI calculator"
    // before "Reminders"), then earlier matches first (a name beats a late keyword); ties keep
    // the list's order.
    const hits = entries.filter((e) => words.every((w) => e.haystack.includes(w)));
    const startsWord = new RegExp(`(^|[^a-z0-9])${words[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    const at = (e: (typeof entries)[number]) => {
      const m = startsWord.exec(e.haystack);
      return m ? m.index : e.haystack.length + e.haystack.indexOf(words[0]);
    };
    return hits.map((e, i) => ({ e, i, pos: at(e) })).sort((a, b) => a.pos - b.pos || a.i - b.i).map((x) => x.e).slice(0, 40);
  }, [entries, query]);
  useEffect(() => setActive(0), [query]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); results[active].run(); }
  };

  return (
    <div className="modal-overlay palette-overlay" onClick={onClose}>
      <div ref={modalRef} className="palette" role="dialog" aria-modal="true" aria-label="Search or go to" onClick={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="palette-input">
          <Search size={16} />
          <input ref={inputRef} aria-label="Search pages, actions and records" placeholder="Search pages, actions, accounts, assets…" value={query}
            onChange={(e) => setQuery(e.target.value)} role="combobox" aria-expanded aria-controls="palette-results"
            aria-activedescendant={results[active] ? `palette-${active}` : undefined} />
          <kbd>Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="palette-results">
          {results.map((r, i) => (
            <li key={r.key} id={`palette-${i}`} role="option" aria-selected={i === active} className="palette-item"
              onMouseEnter={() => setActive(i)} onClick={() => r.run()}>
              <span>{r.label}</span>
              <span className="palette-hint">{r.hint}</span>
            </li>
          ))}
          {results.length === 0 && <li className="palette-empty">Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
};
