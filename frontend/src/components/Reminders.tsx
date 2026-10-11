import React, { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { formatDate, formatINR } from '../format';
import { isDesktop } from '../platform';
import { AmountInput, api, Group, Row, SaveStatus, SectionHeader, Switch, useAutoSave } from './settings/ui';

export interface Reminder {
  key: string;
  type: string;
  title: string;
  amount: number;
  date: string;
  days_left: number;
  details: string;
  page: string;
  done: boolean;
  warning: { account: string; balance: number; short_by: number } | null;
}

interface Preferences { enabled: boolean; desktop_notifications: boolean; lead_days: Record<string, number> }

const dueText = (days: number) => (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : `Due in ${days} days`);

/**
 * The bell in the top bar: payments from the Financial Calendar due within their reminder
 * window (Settings › Reminders), with a warning when the account an EMI comes from is short.
 * "Done" hides one until its next date. The desktop app also raises them as notifications.
 */
export const RemindersButton: React.FC<{
  refreshKey: unknown;
  /** Changes to open the list (a notification was clicked). */
  openNonce?: number;
  onNavigate: (page: string, opts?: { settingsSection?: string }) => void;
}> = ({ refreshKey, openNonce, onNavigate }) => {
  const [items, setItems] = useState<Reminder[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = () => { api<{ items: Reminder[] }>('/api/reminders').then((r) => setItems(r.items)).catch(() => setItems([])); };
  useEffect(load, [refreshKey]);
  useEffect(() => { if (openNonce) { load(); setOpen(true); } }, [openNonce]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);

  const done = async (key: string) => {
    setItems((list) => list.filter((i) => i.key !== key));
    await api('/api/reminders/done', { method: 'POST', body: JSON.stringify({ key }) }).catch(load);
  };
  const go = (page: string, opts?: { settingsSection?: string }) => { setOpen(false); onNavigate(page, opts); };
  const urgent = items.some((i) => i.days_left <= 1 || i.warning);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className={`topbar-bell${urgent ? ' topbar-bell--urgent' : ''}`} aria-haspopup="dialog" aria-expanded={open}
        aria-label={items.length ? `${items.length} payment${items.length === 1 ? '' : 's'} due soon` : 'Reminders'} onClick={() => setOpen(!open)}>
        <Bell size={15} />
        {items.length > 0 && <span className="topbar-bell-count">{items.length}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Due soon" className="topbar-menu rm-panel">
          <div className="rm-head">Due soon</div>
          {items.length === 0 && <div className="rm-empty">Nothing due in the next few days.</div>}
          {items.map((it) => (
            <div key={it.key} className="rm-item">
              <div className="rm-main">
                <button type="button" className="rm-title" onClick={() => go(it.page)}>{it.title}</button>
                <span className="rm-sub">
                  <span className={it.days_left <= 1 ? 'rm-soon' : undefined}>{dueText(it.days_left)}</span> · {formatDate(it.date)}{it.details ? ` · ${it.details}` : ''}
                </span>
                {it.warning && (
                  <span className="rm-warn">{it.warning.account} has {formatINR(it.warning.balance)}: add {formatINR(it.warning.short_by)} before then</span>
                )}
              </div>
              {it.amount > 0 && <span className="rm-amount">{formatINR(it.amount)}</span>}
              <button type="button" className="settings-link" onClick={() => void done(it.key)} title="Hide this one until its next date">Done</button>
            </div>
          ))}
          <div className="rm-foot">
            <button type="button" className="settings-link" onClick={() => go('financial-calendar')}>Open calendar</button>
            <button type="button" className="settings-link" onClick={() => go('settings', { settingsSection: 'reminders' })}>Reminder settings</button>
          </div>
        </div>
      )}
    </div>
  );
};

const KIND_LABELS: Record<string, { label: string; hint: string }> = {
  EMI: { label: 'Loan EMIs', hint: "Loans whose EMI debit day is set. Says if the paying account won't cover it." },
  'Credit Card': { label: 'Credit card bills', hint: 'From the statement and due dates on each card.' },
  Insurance: { label: 'Insurance premiums', hint: 'From the renewal date and frequency on each policy.' },
  Tax: { label: 'Advance tax and filing', hint: "From each person's saved Tax Planner plan." },
  SIP: { label: 'Goal contributions', hint: 'On the 1st, for goals with a monthly amount.' },
};

export const RemindersSection: React.FC = () => {
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [kinds, setKinds] = useState<string[]>([]);
  useEffect(() => {
    api<Preferences & { kinds: string[] }>('/api/settings/reminders').then((p) => { setPrefs(p); setKinds(p.kinds); }).catch(() => setPrefs(null));
  }, []);
  const save = useAutoSave(async (p: Preferences) => api('/api/settings/reminders', { method: 'POST', body: JSON.stringify(p) }));
  const change = (patch: Partial<Preferences>, immediate = false) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    save.schedule(next, immediate);
  };

  if (!prefs) return <SectionHeader title="Reminders" intro="Loading…" />;
  return (
    <>
      <SectionHeader title="Reminders" intro="Payments from the Financial Calendar, shown under the bell in the top bar a few days before they're due." />
      <Group title="Reminders" actions={<SaveStatus state={save.state} error={save.error} />}>
        <Row label="Remind me about payments due soon">
          <Switch label="Remind me about payments due soon" checked={prefs.enabled} onChange={(v) => change({ enabled: v }, true)} />
        </Row>
        <Row label="Desktop notifications" description={isDesktop() ? 'Once when a payment comes into its window, and again on the day.' : 'In the desktop app only.'}>
          <Switch label="Desktop notifications" checked={prefs.desktop_notifications} disabled={!prefs.enabled} onChange={(v) => change({ desktop_notifications: v }, true)} />
        </Row>
      </Group>
      <Group title="How many days before" description="0 turns that kind off.">
        {kinds.map((k) => (
          <Row key={k} label={KIND_LABELS[k]?.label ?? k} description={KIND_LABELS[k]?.hint} htmlFor={`rm-${k}`}>
            <AmountInput id={`rm-${k}`} label={`${KIND_LABELS[k]?.label ?? k}: days before`} suffix="days" width={50} value={prefs.lead_days[k] ?? 0}
              onChange={(v) => change({ lead_days: { ...prefs.lead_days, [k]: Math.max(0, Math.min(60, Math.round(v))) } })} />
          </Row>
        ))}
      </Group>
    </>
  );
};
