import React, { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { HoldingLot, KnowledgeArticle } from '../types';
import { InfoTooltip } from './InfoTooltip';
import { API_BASE_URL } from '../config';

interface HoldingLotsEditorProps {
  lots: HoldingLot[];
  onChange: (lots: HoldingLot[]) => void;
  xirr?: number;
}

export const HoldingLotsEditor: React.FC<HoldingLotsEditorProps> = ({ lots, onChange, xirr }) => {
  // Self-fetched (same pattern as DocumentsEditor.tsx) rather than prop-drilled through
  // EntityGrid -> DynamicForm, since neither currently carries InitData/knowledge_articles.
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/knowledge-articles`)
      .then((r) => r.json())
      .then(setKnowledgeArticles)
      .catch(() => setKnowledgeArticles([]));
  }, []);

  const addLot = () => {
    onChange([...lots, { purchase_date: new Date().toISOString().slice(0, 10), quantity: 0, price_per_unit: 0, notes: '' }]);
  };

  const updateLot = (index: number, key: keyof HoldingLot, value: any) => {
    const next = lots.map((lot, i) => (i === index ? { ...lot, [key]: value } : lot));
    onChange(next);
  };

  const removeLot = (index: number) => {
    onChange(lots.filter((_, i) => i !== index));
  };

  const totalQuantity = lots.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  const totalCost = lots.reduce((sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.price_per_unit) || 0), 0);

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Purchase Lots</label>
        <button type="button" className="btn btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', padding: '4px 10px' }} onClick={addLot}>
          <Plus size={12} /> Add Lot
        </button>
      </div>

      {lots.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px 0' }}>
          No lots recorded yet. Add a lot to track quantity and purchase price.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {lots.map((lot, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
              <input
                type="date"
                className="form-control"
                value={lot.purchase_date}
                onChange={(e) => updateLot(i, 'purchase_date', e.target.value)}
              />
              <input
                type="number"
                step="any"
                placeholder="Quantity"
                className="form-control"
                value={lot.quantity}
                onChange={(e) => updateLot(i, 'quantity', parseFloat(e.target.value) || 0)}
              />
              <input
                type="number"
                step="any"
                placeholder="Price / Unit"
                className="form-control"
                value={lot.price_per_unit}
                onChange={(e) => updateLot(i, 'price_per_unit', parseFloat(e.target.value) || 0)}
              />
              <input
                type="text"
                placeholder="Notes"
                className="form-control"
                value={lot.notes || ''}
                onChange={(e) => updateLot(i, 'notes', e.target.value)}
              />
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                onClick={() => removeLot(i)}
              >
                <Trash2 size={13} style={{ color: '#ef4444' }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {lots.length > 0 && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Total Quantity: {totalQuantity.toLocaleString('en-IN')} &middot; Avg Cost/Unit: ₹{(totalQuantity > 0 ? totalCost / totalQuantity : 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
          {typeof xirr === 'number' && (
            <>
              {' '}&middot; XIRR (as of last save): <span style={{ color: xirr >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>{xirr.toFixed(2)}%</span>
              <InfoTooltip articles={knowledgeArticles} slug="xirr-explained" />
            </>
          )}
        </div>
      )}
    </div>
  );
};
