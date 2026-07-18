import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Edit2, X, BookOpen } from 'lucide-react';
import { CardVariant } from '../../types';
import { API_BASE_URL } from '../../config';

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
  try {
    return json ? JSON.parse(json) : [];
  } catch {
    return [];
  }
};

const formatCurrency = (val: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export const CardLibraryTab: React.FC<CardLibraryTabProps> = ({ cardVariants, onRefresh, showToast }) => {
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState<string>('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<CardVariant> | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const tiers = useMemo(() => ['All', ...Array.from(new Set(cardVariants.map((v) => v.card_tier)))], [cardVariants]);

  const filtered = useMemo(() => {
    return cardVariants.filter((v) => {
      const matchesSearch = !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.issuer.toLowerCase().includes(search.toLowerCase());
      const matchesTier = tierFilter === 'All' || v.card_tier === tierFilter;
      return matchesSearch && matchesTier;
    });
  }, [cardVariants, search, tierFilter]);

  const openAdd = () => {
    setEditing(emptyVariant());
    setModalOpen(true);
  };

  const openEdit = (v: CardVariant) => {
    setEditing({ ...v });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editing || !editing.name || !editing.issuer) {
      showToast?.('Name and Issuer are required', 'error');
      return;
    }
    try {
      const isNew = !editing.id;
      const url = isNew ? `${API_BASE_URL}/api/card-variants` : `${API_BASE_URL}/api/card-variants/${editing.id}`;
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      if (res.ok) {
        showToast?.(isNew ? 'Card added to library' : 'Card updated', 'success');
        setModalOpen(false);
        setEditing(null);
        onRefresh();
      } else {
        showToast?.('Failed to save card', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast?.('Error saving card', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${API_BASE_URL}/api/card-variants/${id}`, { method: 'DELETE' });
      showToast?.('Card removed from library', 'success');
      setDeletingId(null);
      onRefresh();
    } catch (err) {
      console.error(err);
      showToast?.('Failed to delete card', 'error');
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', flex: 1, minWidth: '260px' }}>
          <input
            type="text"
            className="form-control"
            placeholder="Search by name or issuer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '280px' }}
          />
          <select className="form-control" value={tierFilter} onChange={(e) => setTierFilter(e.target.value)} style={{ maxWidth: '160px' }}>
            {tiers.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px' }} onClick={openAdd}>
          <Plus size={14} /> Add Reference Card
        </button>
      </div>

      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <BookOpen size={12} />
        Indicative published terms only — Artha does not fetch live card data. Verify with the issuer before applying.
      </div>

      {filtered.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No cards match your search.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '18px' }}>
          {filtered.map((v) => {
            const pros = parseList(v.pros_json);
            const cons = parseList(v.cons_json);
            return (
              <div key={v.id} className="glass-card" style={{ padding: '18px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{v.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{v.issuer} &middot; {v.network} &middot; {v.card_tier}</div>
                  </div>
                  {!v.is_seeded && (
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px', minWidth: 'auto', borderRadius: '6px' }} onClick={() => openEdit(v)}>
                        <Edit2 size={11} style={{ color: 'var(--info)' }} />
                      </button>
                      {deletingId === v.id ? (
                        <>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '10px', color: '#ef4444' }} onClick={() => handleDelete(v.id)}>Confirm</button>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '10px' }} onClick={() => setDeletingId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-secondary" style={{ padding: '4px', minWidth: 'auto', borderRadius: '6px' }} onClick={() => setDeletingId(v.id)}>
                          <Trash2 size={11} style={{ color: '#ef4444' }} />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                  <span>Joining Fee: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(v.joining_fee)}</strong></span>
                  <span>Annual Fee: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(v.annual_fee)}</strong></span>
                  <span>Base Rate: <strong style={{ color: '#e2e8f0' }}>{v.base_points}pt/₹{v.base_spend}</strong></span>
                  <span>Point Value: <strong style={{ color: '#e2e8f0' }}>₹{v.point_value}</strong></span>
                  <span>Lounge (Dom/Intl): <strong style={{ color: '#e2e8f0' }}>{v.lounge_visits_domestic}/{v.lounge_visits_international}</strong></span>
                  {v.fee_waiver_spend > 0 && <span>Fee Waiver At: <strong style={{ color: '#e2e8f0' }}>{formatCurrency(v.fee_waiver_spend)}</strong></span>}
                </div>

                {v.eligibility_notes && (
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>{v.eligibility_notes}</div>
                )}

                {pros.length > 0 && (
                  <div style={{ fontSize: '11px' }}>
                    {pros.map((p, i) => (
                      <div key={i} style={{ color: '#10b981' }}>+ {p}</div>
                    ))}
                    {cons.map((c, i) => (
                      <div key={i} style={{ color: '#ef4444' }}>- {c}</div>
                    ))}
                  </div>
                )}

                <div style={{ fontSize: '10px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-glass)', paddingTop: '8px', marginTop: '4px' }}>
                  {v.is_seeded ? 'Starter Catalogue' : 'Your Entry'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && editing && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
            <button
              onClick={() => { setModalOpen(false); setEditing(null); }}
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>
            <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '18px', color: '#f8fafc' }}>
              {editing.id ? 'Edit Reference Card' : 'Add Reference Card'}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Card Name</label>
                <input className="form-control" value={editing.name || ''} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Issuer</label>
                <input className="form-control" value={editing.issuer || ''} onChange={(e) => setEditing({ ...editing, issuer: e.target.value })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Network</label>
                <input className="form-control" value={editing.network || ''} onChange={(e) => setEditing({ ...editing, network: e.target.value })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Tier</label>
                <input className="form-control" value={editing.card_tier || ''} onChange={(e) => setEditing({ ...editing, card_tier: e.target.value })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Joining Fee</label>
                <input type="number" className="form-control" value={editing.joining_fee ?? 0} onChange={(e) => setEditing({ ...editing, joining_fee: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Annual Fee</label>
                <input type="number" className="form-control" value={editing.annual_fee ?? 0} onChange={(e) => setEditing({ ...editing, annual_fee: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Fee Waiver Spend (0 = none)</label>
                <input type="number" className="form-control" value={editing.fee_waiver_spend ?? 0} onChange={(e) => setEditing({ ...editing, fee_waiver_spend: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Point Value (₹)</label>
                <input type="number" step="any" className="form-control" value={editing.point_value ?? 0.25} onChange={(e) => setEditing({ ...editing, point_value: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Base Points</label>
                <input type="number" step="any" className="form-control" value={editing.base_points ?? 1} onChange={(e) => setEditing({ ...editing, base_points: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Per Spend (₹)</label>
                <input type="number" step="any" className="form-control" value={editing.base_spend ?? 100} onChange={(e) => setEditing({ ...editing, base_spend: parseFloat(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Lounge (Domestic)</label>
                <input type="number" className="form-control" value={editing.lounge_visits_domestic ?? 0} onChange={(e) => setEditing({ ...editing, lounge_visits_domestic: parseInt(e.target.value) || 0 })} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Lounge (International)</label>
                <input type="number" className="form-control" value={editing.lounge_visits_international ?? 0} onChange={(e) => setEditing({ ...editing, lounge_visits_international: parseInt(e.target.value) || 0 })} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Eligibility Notes</label>
                <input className="form-control" value={editing.eligibility_notes || ''} onChange={(e) => setEditing({ ...editing, eligibility_notes: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pros (one per line)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={parseList(editing.pros_json).join('\n')}
                  onChange={(e) => setEditing({ ...editing, pros_json: JSON.stringify(e.target.value.split('\n').filter(Boolean)) })}
                />
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Cons (one per line)</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={parseList(editing.cons_json).join('\n')}
                  onChange={(e) => setEditing({ ...editing, cons_json: JSON.stringify(e.target.value.split('\n').filter(Boolean)) })}
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-primary" style={{ padding: '8px 20px' }} onClick={handleSave}>Save</button>
              <button className="btn btn-secondary" style={{ padding: '8px 20px' }} onClick={() => { setModalOpen(false); setEditing(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
