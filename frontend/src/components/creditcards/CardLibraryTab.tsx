import React, { useMemo, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { CardVariant } from '../../types';
import { API_BASE_URL } from '../../config';
import { formatINR } from '../../format';
import { useModalA11y } from '../../hooks/useModalA11y';
import { AmountInput, ConfirmAction } from '../settings/ui';

interface CardLibraryTabProps {
  cardVariants: CardVariant[];
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

const emptyVariant = (): Partial<CardVariant> => ({
  name: '', issuer: '', network: 'Visa', card_tier: 'Premium',
  joining_fee: 0, annual_fee: 0, fee_waiver_spend: 0,
  base_points: 1, base_spend: 100, point_value: 0.25,
  lounge_visits_domestic: 0, lounge_visits_international: 0,
  eligibility_notes: '', category_rules_json: '[]', milestone_rules_json: '[]',
  redemption_partners_json: '[]', pros_json: '[]', cons_json: '[]', source_notes: '',
});

const parseList = (json: string | undefined): string[] => {
  try { return json ? JSON.parse(json) : []; } catch { return []; }
};
/** Base reward as % of spend: points per ₹ spent, times what a point is worth. */
const baseRate = (v: Partial<CardVariant>) =>
  (v.base_spend || 0) > 0 ? ((v.base_points || 0) / (v.base_spend || 1)) * (v.point_value || 0) * 100 : 0;
const pct = (n: number) => `${n.toFixed(n < 1 ? 2 : 1).replace(/\.?0+$/, '')}%`;

/** Reference cards (published terms) to compare against your own. */
export const CardLibraryTab: React.FC<CardLibraryTabProps> = ({ cardVariants, onRefresh, showToast }) => {
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('All');
  const [editing, setEditing] = useState<Partial<CardVariant> | null>(null);
  const close = () => setEditing(null);
  const modalRef = useModalA11y(!!editing, close);

  const tiers = useMemo(() => ['All', ...Array.from(new Set(cardVariants.map((v) => v.card_tier).filter(Boolean)))], [cardVariants]);
  const q = search.trim().toLowerCase();
  const shown = cardVariants
    .filter((v) => (tier === 'All' || v.card_tier === tier) && (!q || `${v.name} ${v.issuer}`.toLowerCase().includes(q)))
    .sort((a, b) => a.issuer.localeCompare(b.issuer) || a.name.localeCompare(b.name));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing?.name || !editing.issuer) { showToast?.('A name and issuer are needed', 'error'); return; }
    const isNew = !editing.id;
    const res = await fetch(isNew ? `${API_BASE_URL}/api/card-variants` : `${API_BASE_URL}/api/card-variants/${editing.id}`, {
      method: isNew ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editing),
    }).catch(() => null);
    if (res?.ok) { showToast?.(isNew ? 'Added to the library' : 'Saved', 'success'); close(); onRefresh(); }
    else showToast?.("Couldn't save the card", 'error');
  };
  const remove = async (id: number) => {
    const res = await fetch(`${API_BASE_URL}/api/card-variants/${id}`, { method: 'DELETE' }).catch(() => null);
    if (res?.ok) { showToast?.('Removed from the library', 'success'); close(); onRefresh(); }
    else showToast?.("Couldn't remove the card", 'error');
  };

  const set = (patch: Partial<CardVariant>) => setEditing((v) => (v ? { ...v, ...patch } : v));
  const text = (key: keyof CardVariant, label: string, wide = false) => (
    <div className={`df-field${wide ? ' df-wide' : ''}`}>
      <label htmlFor={`cl-${String(key)}`} className="df-label">{label}</label>
      <input id={`cl-${String(key)}`} className="form-control" value={String(editing?.[key] ?? '')} onChange={(e) => set({ [key]: e.target.value } as Partial<CardVariant>)} />
    </div>
  );
  const num = (key: keyof CardVariant, label: string, opts: { prefix?: string; suffix?: string; hint?: string } = {}) => (
    <div className="df-field">
      <label htmlFor={`cl-${String(key)}`} className="df-label">{label}</label>
      <AmountInput id={`cl-${String(key)}`} label={label} prefix={opts.prefix} suffix={opts.suffix} value={Number(editing?.[key]) || 0}
        onChange={(v) => set({ [key]: v } as Partial<CardVariant>)} />
      {opts.hint && <span className="df-hint">{opts.hint}</span>}
    </div>
  );
  const list = (key: 'pros_json' | 'cons_json', label: string) => (
    <div className="df-field df-wide">
      <label htmlFor={`cl-${key}`} className="df-label">{label}</label>
      <textarea id={`cl-${key}`} className="form-control" rows={2} value={parseList(editing?.[key]).join('\n')}
        onChange={(e) => set({ [key]: JSON.stringify(e.target.value.split('\n').filter(Boolean)) })} />
    </div>
  );

  return (
    <div className="db-col">
      <div className="tl-filters">
        <div className="eg-search">
          <Search size={14} />
          <input type="search" className="form-control" placeholder="Search name or issuer" aria-label="Search the library" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="form-control" aria-label="Tier" value={tier} onChange={(e) => setTier(e.target.value)}>
          {tiers.map((t) => <option key={t} value={t}>{t === 'All' ? 'All tiers' : t}</option>)}
        </select>
        <button type="button" className="settings-btn" onClick={() => setEditing(emptyVariant())}><Plus size={12} /> Add a card</button>
        <span className="tl-totals">Published terms as entered; Artha doesn't fetch live card data. Check with the issuer before applying.</span>
      </div>

      <div className="settings-group">
        {shown.length === 0 ? (
          <div className="ie-empty"><p>{cardVariants.length ? 'No cards match.' : 'The library is empty. Add cards you are considering to compare them with yours.'}</p></div>
        ) : shown.map((v) => {
          const pros = parseList(v.pros_json);
          return (
            <button key={v.id} type="button" className="ie-row" onClick={() => setEditing({ ...v })}>
              <span className="ie-row-text">
                <strong>{v.name}</strong>
                <span>{[v.issuer, v.network, v.card_tier, `${pct(baseRate(v))} base reward`,
                  v.lounge_visits_domestic || v.lounge_visits_international ? `lounges ${v.lounge_visits_domestic} domestic / ${v.lounge_visits_international} international` : null,
                  v.is_seeded ? null : 'your entry'].filter(Boolean).join(' · ')}</span>
                {pros.length > 0 && <span className="cl-pros">{pros.slice(0, 2).join(' · ')}</span>}
              </span>
              <span className="ie-row-amount">
                <strong>{v.annual_fee > 0 ? `${formatINR(v.annual_fee)}` : 'No fee'}{v.annual_fee > 0 && <small>/yr</small>}</strong>
                <span>{v.fee_waiver_spend > 0 ? `waived at ${formatINR(v.fee_waiver_spend)} spend` : v.joining_fee > 0 ? `joining ${formatINR(v.joining_fee)}` : ''}</span>
              </span>
            </button>
          );
        })}
      </div>

      {editing && (
        <div className="db-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-label={editing.id ? `Edit ${editing.name}` : 'Add a card'} tabIndex={-1} className="db-modal-body" style={{ maxWidth: '620px' }}>
            <form className="glass-panel df-form" onSubmit={save}>
              <div className="df-head"><h3>{editing.id ? `Edit ${editing.name}` : 'Add a card to the library'}</h3></div>
              <div className="df-body">
                <div className="df-grid">
                  {text('name', 'Card name', true)}
                  {text('issuer', 'Issuer')}
                  {text('network', 'Network')}
                  {text('card_tier', 'Tier')}
                </div>
                <section className="df-section" aria-label="Fees">
                  <h4>Fees</h4>
                  <div className="df-grid">
                    {num('joining_fee', 'Joining fee', { prefix: '₹' })}
                    {num('annual_fee', 'Annual fee', { prefix: '₹' })}
                    {num('fee_waiver_spend', 'Fee waived at yearly spend of', { prefix: '₹', hint: '0 if it is never waived.' })}
                  </div>
                </section>
                <section className="df-section" aria-label="Rewards">
                  <h4>Rewards</h4>
                  <div className="df-grid">
                    {num('base_points', 'Points earned')}
                    {num('base_spend', '…for every', { prefix: '₹' })}
                    {num('point_value', 'A point is worth', { prefix: '₹' })}
                    <div className="df-field"><span className="df-label">Base reward</span><span className="cl-rate">{pct(baseRate(editing))} of spend</span></div>
                    {num('lounge_visits_domestic', 'Lounge visits, domestic', { suffix: 'a year' })}
                    {num('lounge_visits_international', 'Lounge visits, international', { suffix: 'a year' })}
                  </div>
                </section>
                <div className="df-grid">
                  {text('eligibility_notes', 'Eligibility', true)}
                  {list('pros_json', 'Pros (one per line)')}
                  {list('cons_json', 'Cons (one per line)')}
                </div>
              </div>
              <div className="df-foot">
                <div>{editing.id ? <ConfirmAction label="Remove from library" confirmLabel="Remove" danger question={`Remove ${editing.name}?`} onConfirm={() => remove(editing.id!)} /> : null}</div>
                <div className="df-actions">
                  <button type="button" className="btn btn-secondary" onClick={close}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editing.id ? 'Save changes' : 'Add'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
