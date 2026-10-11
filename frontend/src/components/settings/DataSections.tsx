import React, { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Plus, Upload } from 'lucide-react';
import { isDesktop, selectDatabaseFile, selectFolder } from '../../platform';
import { AmountInput, api, ConfirmAction, Group, Row, SaveStatus, SectionHeader, SectionProps, shortPath, splitPath, Switch, useAutoSave } from './ui';

interface DbSettings {
  active_path: string;
  default_path: string;
  recent_databases: string[];
  backup_on_open?: boolean;
  backup_on_close?: boolean;
  backup_count_limit?: number;
  custom_backup_dir?: string;
}

const useDbSettings = () => {
  const [db, setDb] = useState<DbSettings | null>(null);
  const load = useCallback(() => { api<DbSettings>('/api/settings/database').then(setDb).catch(() => setDb(null)); }, []);
  useEffect(load, [load]);
  return { db, reload: load };
};

const PathText: React.FC<{ path: string }> = ({ path }) => {
  const { name, folder } = splitPath(path);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: '13.5px', color: 'var(--text-primary)', fontWeight: 500 }}>{name}</div>
      <div className="settings-mono" title={path}>{shortPath(folder)}</div>
    </div>
  );
};

// ---------------------------------------------------------------------------

export const DatabaseSection: React.FC<SectionProps> = ({ onRefresh, showToast }) => {
  const { db, reload } = useDbSettings();
  const desktop = isDesktop();

  const switchTo = async (path: string) => {
    try {
      await api('/api/settings/database', { method: 'POST', body: JSON.stringify({ path }) });
      showToast?.(`Now using ${splitPath(path).name}`, 'success');
      onRefresh();
      reload();
    } catch (e) {
      showToast?.(`Couldn't switch: ${(e as Error).message}`, 'error');
    }
  };
  const pick = async (mode: 'open' | 'create') => {
    const path = await selectDatabaseFile(mode).catch(() => null);
    if (path) await switchTo(path);
  };

  if (!db) return <SectionHeader title="Database" intro="Loading…" />;
  const others = db.recent_databases.filter((p) => p !== db.active_path);
  return (
    <>
      <SectionHeader title="Database" intro="All of Artha's data lives in one file on this computer. You can keep separate files (for example one per household) and switch between them." />
      <Group title="In use">
        <Row label={<PathText path={db.active_path} />}>
          {desktop ? (
            <>
              <button type="button" className="settings-btn" onClick={() => pick('open')}><FolderOpen size={13} /> Open another…</button>
              <button type="button" className="settings-btn" onClick={() => pick('create')}><Plus size={13} /> New database…</button>
            </>
          ) : <span className="settings-note">Switching files is available in the desktop app.</span>}
        </Row>
      </Group>
      {others.length > 0 && (
        <Group title="Recently used" description="Switching opens that file and brings it up to date; your current file stays as it is.">
          {others.map((p) => (
            <Row key={p} label={<PathText path={p} />}>
              <ConfirmAction label="Switch" confirmLabel="Switch" question="Use this file?" onConfirm={() => switchTo(p)} />
            </Row>
          ))}
        </Group>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------

interface BackupInfo { name: string; size: number; modified: string }

const KIND: [RegExp, string][] = [
  [/^auto_open_/, 'when Artha opened'],
  [/^auto_close_/, 'when Artha closed'],
  [/^pre_restore_/, 'before a restore'],
  [/^backup_/, 'made by you'],
];
const kindOf = (name: string) => KIND.find(([re]) => re.test(name))?.[1] ?? 'other copy';
const sizeOf = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
function whenOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 86400000);
  const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Today, ${time}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}, ${time}`;
}

interface MirrorStatus { folder: string; last_copied_at?: string | null; last_error?: string | null; last_error_at?: string | null }

/**
 * The second copy: every backup is also copied to a folder off this machine (a cloud-synced
 * folder or an external disk), so a lost or broken computer doesn't take the backups with it.
 */
const SecondCopyGroup: React.FC<{ mirror: MirrorStatus | undefined; onChanged: () => void; showToast?: SectionProps['showToast'] }> = ({ mirror, onChanged, showToast }) => {
  const desktop = isDesktop();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setFolder = async (folder: string) => {
    setBusy(true);
    try {
      const out = await api<MirrorStatus & { copied: string[] }>('/api/settings/backup-mirror', { method: 'POST', body: JSON.stringify({ folder }) });
      setError(null);
      setDraft('');
      showToast?.(folder ? `Backups will also be copied to ${splitPath(folder.replace(/[\\/]+$/, '')).name}${out.copied.length ? ` (${out.copied.length} copied now)` : ''}` : 'Stopped copying backups elsewhere', 'success');
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choose = async () => {
    const folder = await selectFolder('Choose a folder for the second copy of your backups').catch(() => null);
    if (folder) await setFolder(folder);
  };
  const copyNow = async () => {
    setBusy(true);
    try {
      const out = await api<{ status: string; message?: string; copied: string[] }>('/api/backup/mirror', { method: 'POST' });
      if (out.status === 'success') showToast?.(out.copied.length ? `Copied ${out.copied.length} backup${out.copied.length === 1 ? '' : 's'}` : 'Already up to date', 'success');
      else showToast?.(out.message ?? "Couldn't copy the backups", 'error');
    } catch (e) {
      showToast?.((e as Error).message, 'error');
    } finally {
      setBusy(false);
      onChanged();
    }
  };

  const folder = mirror?.folder ?? '';
  const failing = !!mirror?.last_error;
  return (
    <Group title="Second copy elsewhere"
      description="Backups next to the database are lost with this computer. Choose a folder somewhere else, such as an iCloud Drive, Google Drive or OneDrive folder, or an external disk, and every backup is copied there too.">
      {folder ? (
        <>
          <Row label={<PathText path={folder.replace(/[\\/]+$/, '')} />}
            description={failing
              ? <span style={{ color: '#fca5a5' }}>{mirror?.last_error}</span>
              : mirror?.last_copied_at ? `Up to date as of ${whenOf(mirror.last_copied_at)}` : 'Not copied yet'}>
            <button type="button" className="settings-btn" disabled={busy} onClick={() => void copyNow()}>{failing ? 'Try again' : 'Copy now'}</button>
            <ConfirmAction label="Stop" confirmLabel="Stop copying" question="Stop copying backups to this folder? Copies already there are kept." onConfirm={() => setFolder('')} />
          </Row>
          {failing && <Row label={<span className="settings-note">Backups still go to the usual folder. Whatever this folder is missing is copied the next time it's available.</span>} />}
        </>
      ) : (
        <Row label="Copy every backup to" description={desktop ? 'Older automatic copies there are deleted just like here; ones you make yourself are kept.' : 'The full path of a folder the Artha server can write to.'}>
          {desktop
            ? <button type="button" className="settings-btn" disabled={busy} onClick={() => void choose()}><FolderOpen size={13} /> Choose folder…</button>
            : <>
                <input className="settings-input" style={{ width: '220px' }} aria-label="Folder for the second copy" placeholder="/path/to/folder" value={draft} onChange={(e) => setDraft(e.target.value)} />
                <button type="button" className="settings-btn" disabled={busy || !draft.trim()} onClick={() => void setFolder(draft.trim())}>Use</button>
              </>}
        </Row>
      )}
      {error && <Row label={<span role="alert" style={{ fontSize: '12.5px', color: '#fca5a5' }}>{error}</span>} />}
      <Row label={<span className="settings-note">On a new computer: install Artha, set this folder as the backup folder above, and restore the newest backup.</span>} />
    </Group>
  );
};

export const BackupsSection: React.FC<SectionProps> = ({ onRefresh, showToast }) => {
  const { db } = useDbSettings();
  const [prefs, setPrefs] = useState<{ open: boolean; close: boolean; keep: number; folder: string } | null>(null);
  const [list, setList] = useState<{ folder: string; backups: BackupInfo[]; mirror?: MirrorStatus } | null>(null);
  const [showAll, setShowAll] = useState(false);
  const loadList = useCallback(() => { api<{ folder: string; backups: BackupInfo[]; mirror?: MirrorStatus }>('/api/backup/details').then(setList).catch(() => setList(null)); }, []);
  useEffect(loadList, [loadList]);
  useEffect(() => {
    if (db && !prefs) setPrefs({ open: db.backup_on_open ?? true, close: db.backup_on_close ?? true, keep: db.backup_count_limit ?? 10, folder: db.custom_backup_dir ?? '' });
  }, [db, prefs]);

  const save = useAutoSave(async (p: NonNullable<typeof prefs>) => {
    await api('/api/settings/backup', { method: 'POST', body: JSON.stringify({ backup_on_open: p.open, backup_on_close: p.close, backup_count_limit: p.keep, custom_backup_dir: p.folder }) });
    loadList();
  });
  const change = (patch: Partial<NonNullable<typeof prefs>>, immediate = false) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    save.schedule(next, immediate);
  };

  const backupNow = async () => {
    try {
      const out = await api<{ mirror?: { status: string; message?: string } | null }>('/api/backup/create', { method: 'POST' });
      if (out.mirror?.status === 'error') showToast?.(`Backup saved here, but not copied to the second folder: ${out.mirror.message}`, 'error');
      else showToast?.(out.mirror ? 'Backup saved and copied to the second folder' : 'Backup saved', 'success');
      loadList();
    } catch (e) {
      showToast?.(`Backup failed: ${(e as Error).message}`, 'error');
    }
  };
  const restore = async (name: string) => {
    const form = new FormData();
    form.append('backup_name', name);
    try {
      const out = await api<{ previous_saved_as?: string }>('/api/backup/restore', { method: 'POST', body: form });
      showToast?.(`Restored. Your previous data was saved as a backup${out.previous_saved_as ? ` (${out.previous_saved_as})` : ''}.`, 'success');
      onRefresh();
      loadList();
    } catch (e) {
      showToast?.(`Restore failed: ${(e as Error).message}`, 'error');
    }
  };

  const backups = list?.backups ?? [];
  const shown = showAll ? backups : backups.slice(0, 8);
  return (
    <>
      <SectionHeader title="Backups" intro="Copies of your database, made automatically and whenever you ask. Restoring one saves your current data first, so it can be undone." />
      {prefs && (
        <Group title="Automatic backups" actions={<SaveStatus state={save.state} error={save.error} />}>
          <Row label="Back up when Artha opens" description="Skipped when nothing has changed since the last backup.">
            <Switch label="Back up when Artha opens" checked={prefs.open} onChange={(v) => change({ open: v }, true)} />
          </Row>
          <Row label="Back up when Artha closes" description="Desktop app only.">
            <Switch label="Back up when Artha closes" checked={prefs.close} onChange={(v) => change({ close: v }, true)} />
          </Row>
          <Row label="Automatic backups to keep" description="Older automatic backups are deleted. Backups you make yourself are always kept." htmlFor="bk-keep">
            <AmountInput id="bk-keep" label="Automatic backups to keep" value={prefs.keep} width={60} onChange={(v) => change({ keep: Math.max(1, Math.round(v)) })} />
          </Row>
          <Row label="Backup folder" htmlFor="bk-folder"
            description={prefs.folder ? 'Used when the folder exists; otherwise backups go next to the database.' : 'Leave empty to keep backups next to the database.'}>
            <input id="bk-folder" className="settings-input" style={{ width: '240px' }} placeholder="Default (next to the database)"
              value={prefs.folder} onChange={(e) => change({ folder: e.target.value })} />
          </Row>
        </Group>
      )}
      {list && <SecondCopyGroup mirror={list.mirror} onChanged={loadList} showToast={showToast} />}
      <Group title="Saved backups" description={list ? <>In <span className="settings-mono" title={list.folder}>{shortPath(splitPath(list.folder + '/x').folder)}</span></> : undefined}
        actions={<button type="button" className="settings-btn settings-btn--primary" onClick={backupNow}>Back up now</button>}>
        {backups.length === 0 && <Row label={<span className="settings-note">No backups yet.</span>} />}
        {shown.map((b) => (
          <Row key={b.name} label={whenOf(b.modified)} description={<>{kindOf(b.name)} · {sizeOf(b.size)}</>}>
            <ConfirmAction label="Restore" confirmLabel="Restore" question="Replace your current data with this backup?" onConfirm={() => restore(b.name)} />
          </Row>
        ))}
        {backups.length > 8 && (
          <Row label={<button type="button" className="settings-link" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show fewer' : `Show all ${backups.length}`}</button>} />
        )}
      </Group>
    </>
  );
};

// ---------------------------------------------------------------------------

export const ImportSection: React.FC<SectionProps> = ({ onRefresh }) => {
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const importMmex = async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    setStatus({ text: 'Importing…', ok: true });
    try {
      const out = await api<{ imported: number }>('/api/import/mmex', { method: 'POST', body: form });
      setStatus({ text: `Imported ${out.imported} account${out.imported === 1 ? '' : 's'}.`, ok: true });
      onRefresh();
    } catch (e) {
      setStatus({ text: `Import failed: ${(e as Error).message}`, ok: false });
    }
  };
  return (
    <>
      <SectionHeader title="Import" intro="Bring data in from other apps. Payslips are imported from the Tax Planner (Salary & CTC, month by month)." />
      <Group title="Money Manager Ex">
        <Row label="Accounts list (CSV)" description="Export the accounts list from MMEX as CSV. Accounts are matched by name and their balances updated.">
          <input id="mmex-file" type="file" accept=".csv" style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void importMmex(f); e.target.value = ''; }} />
          <label htmlFor="mmex-file" className="settings-btn" style={{ cursor: 'pointer' }}><Upload size={13} /> Choose file…</label>
        </Row>
        {status && <Row label={<span role="status" style={{ fontSize: '12.5px', color: status.ok ? 'var(--success)' : '#fca5a5' }}>{status.text}</span>} />}
      </Group>
    </>
  );
};
