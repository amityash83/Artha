import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';

interface CalendarEvent {
  title: string;
  amount: number;
  type: 'EMI' | 'SIP' | 'Insurance' | 'Credit Card' | 'Tax';
  date: string;
  details: string;
}

const FILTERS: { id: string; label: string }[] = [
  { id: 'all', label: 'Everything' }, { id: 'EMI', label: 'EMIs' }, { id: 'SIP', label: 'SIPs' },
  { id: 'Insurance', label: 'Insurance' }, { id: 'Credit Card', label: 'Card bills' }, { id: 'Tax', label: 'Tax' },
];
const TYPE_TONE: Record<string, string> = { EMI: 'danger', SIP: 'success', Insurance: 'info', 'Credit Card': 'warning', Tax: 'accent' };

// "2026-10-15" as a local date (new Date("2026-10-15") is UTC midnight, which can land on
// the previous day west of UTC).
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`);
const daysFromToday = (iso: string) => Math.round((day(iso).getTime() - new Date(new Date().toDateString()).getTime()) / 86400000);

export const FinancialCalendar: React.FC = () => {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/calendar`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setEvents(Array.isArray(d) ? d : []))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  const shown = events.filter((e) => filter === 'all' || e.type === filter).sort((a, b) => a.date.localeCompare(b.date));
  const sum = (list: CalendarEvent[]) => list.reduce((s, e) => s + (e.amount || 0), 0);
  const next30 = shown.filter((e) => daysFromToday(e.date) <= 30);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const next = shown[0];

  const months: { key: string; items: CalendarEvent[] }[] = [];
  for (const e of shown) {
    const key = e.date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.items.push(e); else months.push({ key, items: [e] });
  }
  const monthLabel = (ym: string) => day(`${ym}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const when = (iso: string) => {
    const n = daysFromToday(iso);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 1 && n <= 14 ? `in ${n} days` : null;
  };

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Financial Calendar</h1>
          <p className="page-subtitle">Payments coming up in the next 12 months: EMIs, SIPs, premiums, card bills and advance tax.</p>
        </div>
      </div>

      <div className="glass-panel cc-summary db-summary">
        <div className="cc-summary-main">
          <div className="cc-label">Due in the next 30 days</div>
          <strong className="eg-figure db-networth">{formatINR(sum(next30))}</strong>
          <span className="cc-note">{next30.length} payment{next30.length === 1 ? '' : 's'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Next</div>
          <strong>{next ? formatINR(next.amount) : '—'}</strong>
          <span className="cc-note">{next ? `${next.title}, ${day(next.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}` : 'nothing due'}</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">This month</div>
          <strong>{formatINR(sum(shown.filter((e) => e.date.startsWith(thisMonth))))}</strong>
          <span className="cc-note">still to pay</span>
        </div>
        <div className="cc-summary-stat">
          <div className="cc-label">Next 12 months</div>
          <strong>{formatINR(sum(shown))}</strong>
          <span className="cc-note">{shown.length} payments</span>
        </div>
      </div>

      <div role="tablist" aria-label="Kinds of payment" className="cc-views">
        {FILTERS.map((f) => (
          <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className="cc-view" onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {loading ? <p className="cc-note">Loading…</p> : months.length === 0 ? (
        <div className="settings-group"><div className="ie-empty">
          <p>{filter === 'all'
            ? 'Nothing scheduled. Loans with an EMI, SIPs, insurance renewals, card due dates and saved tax plans show up here.'
            : 'Nothing of this kind in the next 12 months.'}</p>
        </div></div>
      ) : (
        <div className="eg-groups">
          {months.map((m) => (
            <section key={m.key} aria-label={monthLabel(m.key)}>
              <div className="settings-group-head">
                <h3 className="settings-group-title">{monthLabel(m.key)}</h3>
                <span className="eg-group-total">{formatINR(sum(m.items))}</span>
              </div>
              <div className="settings-group">
                {m.items.map((e, i) => {
                  const d = day(e.date);
                  const soon = when(e.date);
                  return (
                    <div key={`${e.date}-${e.title}-${i}`} className="ie-row fc-row">
                      <span className="fc-date"><strong>{d.getDate()}</strong><span>{d.toLocaleDateString('en-IN', { weekday: 'short' })}</span></span>
                      <span className="ie-row-text">
                        <strong>{e.title}</strong>
                        <span>{[e.details, soon].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className={`fc-type fc-type--${TYPE_TONE[e.type] || 'accent'}`}>{e.type === 'Credit Card' ? 'Card bill' : e.type}</span>
                      <span className="ie-row-amount"><strong>{formatINR(e.amount)}</strong></span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};
