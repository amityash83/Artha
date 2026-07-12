import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, 
  ArrowRightLeft, Save, Info, RefreshCw, X
} from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';

interface TransactionsLedgerProps {
  data: InitData;
  onRefresh: () => void;
}

interface Transaction {
  id: number;
  account_id: number;
  type: string; // Credit, Debit, Transfer, Investment, Redemption, EMI, Prepayment
  amount: number;
  transaction_date: string;
  category_id?: number;
  notes?: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

export const TransactionsLedger: React.FC<TransactionsLedgerProps> = ({ data, onRefresh }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form State
  const [type, setType] = useState<string>('Debit');
  const [accountId, setAccountId] = useState<string>('');
  const [counterpartId, setCounterpartId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions`);
      if (res.ok) {
        const d = await res.json();
        // Sort transactions by date descending
        d.sort((a: any, b: any) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
        setTransactions(d);
      }
    } catch (err) {
      console.error("Failed to load transactions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTransactions();
    // Default form date to today
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
  }, []);

  // Pre-fill default account if available
  useEffect(() => {
    if (data.accounts.length > 0 && !accountId) {
      setAccountId(data.accounts[0].id.toString());
    }
  }, [data.accounts, accountId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountId || !amount || !date) {
      alert("Please fill in all required fields.");
      return;
    }

    // Map counterpart details depending on selected type
    let relatedEntityType: string | null = null;
    let relatedEntityId: number | null = null;
    let categoryId: number | null = null;

    const parsedCounterpartId = parseInt(counterpartId);

    if (type === 'Transfer') {
      relatedEntityType = 'Account';
      relatedEntityId = parsedCounterpartId;
    } else if (type === 'Investment' || type === 'Redemption') {
      relatedEntityType = 'Asset';
      relatedEntityId = parsedCounterpartId;
    } else if (type === 'EMI' || type === 'Prepayment') {
      relatedEntityType = 'Liability';
      relatedEntityId = parsedCounterpartId;
    } else if (type === 'Debit') {
      categoryId = parsedCounterpartId;
    } else if (type === 'Credit') {
      categoryId = parsedCounterpartId;
    }

    const payload = {
      account_id: parseInt(accountId),
      type,
      amount: parseFloat(amount),
      transaction_date: date,
      notes,
      category_id: categoryId,
      related_entity_type: relatedEntityType,
      related_entity_id: relatedEntityId
    };

    try {
      const isEdit = editingId !== null;
      const url = isEdit 
        ? `${API_BASE_URL}/api/entities/transactions/${editingId}`
        : `${API_BASE_URL}/api/entities/transactions`;

      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setModalOpen(false);
        setEditingId(null);
        setAmount('');
        setNotes('');
        setCounterpartId('');
        fetchTransactions();
        onRefresh();
      } else {
        const err = await res.json();
        alert("Failed to save transaction: " + (err.detail || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("Error saving transaction details");
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setType(tx.type);
    setAccountId(tx.account_id.toString());
    setAmount(tx.amount.toString());
    setDate(tx.transaction_date);
    setNotes(tx.notes || '');

    // Prefill counterpart select depending on type
    if (tx.type === 'Transfer' || tx.type === 'Investment' || tx.type === 'Redemption' || tx.type === 'EMI' || tx.type === 'Prepayment') {
      setCounterpartId(tx.related_entity_id?.toString() || '');
    } else {
      setCounterpartId(tx.category_id?.toString() || '');
    }

    setModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this transaction? Balance adjustments will be reverted!")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTransactions();
        onRefresh();
      } else {
        alert("Failed to delete transaction");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Helper resolvers for displaying names
  const getAccountName = (id: number) => {
    const acc = data.accounts.find(a => a.id === id);
    return acc ? `${acc.name} (${acc.institution_name || 'Bank'})` : `Account #${id}`;
  };

  const getCounterpartText = (tx: Transaction) => {
    if (tx.type === 'Transfer') {
      return tx.related_entity_id ? `→ ${getAccountName(tx.related_entity_id)}` : 'Destination Account';
    }
    if (tx.type === 'Investment' || tx.type === 'Redemption') {
      const asset = data.assets.find(a => a.id === tx.related_entity_id);
      const symbol = tx.type === 'Investment' ? '→' : '←';
      return asset ? `${symbol} Asset: ${asset.name}` : `Asset #${tx.related_entity_id}`;
    }
    if (tx.type === 'EMI' || tx.type === 'Prepayment') {
      const liab = data.liabilities.find(l => l.id === tx.related_entity_id);
      return liab ? `→ Debt: ${liab.name}` : `Debt #${tx.related_entity_id}`;
    }
    if (tx.category_id) {
      const cat = data.categories.find(c => c.id === tx.category_id);
      return cat ? `Category: ${cat.name}` : `Category #${tx.category_id}`;
    }
    return '-';
  };

  const getTypeIcon = (typeStr: string) => {
    switch (typeStr) {
      case 'Credit':
      case 'Redemption':
        return <ArrowDownRight size={16} style={{ color: 'var(--success)' }} />;
      case 'Debit':
      case 'Investment':
      case 'EMI':
      case 'Prepayment':
        return <ArrowUpRight size={16} style={{ color: 'var(--danger)' }} />;
      case 'Transfer':
        return <ArrowRightLeft size={16} style={{ color: 'var(--info)' }} />;
      default:
        return <Info size={16} style={{ color: 'var(--text-muted)' }} />;
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Lists for counterpart choices depending on type
  const targetAccountsList = data.accounts.filter(a => a.id.toString() !== accountId);
  const targetAssetsList = data.assets;
  const targetLiabilitiesList = data.liabilities;
  const categoriesList = data.categories.filter(c => {
    if (type === 'Debit') return c.entity_type === 'Expense';
    if (type === 'Credit') return c.entity_type === 'Income';
    return false;
  });

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Transactions Ledger</h1>
          <p className="page-subtitle">Track historical flows. All transaction postings automatically trigger double-entry adjustments.</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn btn-secondary" onClick={fetchTransactions} title="Refresh list">
            <RefreshCw size={16} />
          </button>
          <button className="btn btn-primary" onClick={() => {
            setEditingId(null);
            setType('Debit');
            setAmount('');
            setNotes('');
            setCounterpartId('');
            setModalOpen(true);
          }}>
            <Plus size={16} /> Log Transaction
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '48px', textTransform: 'uppercase', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading Transactions Ledger...
        </div>
      ) : transactions.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Info size={40} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
          <h3>No Transactions Logged</h3>
          <p style={{ maxWidth: '400px', margin: '8px auto 20px auto', fontSize: '13px' }}>
            Post your first transaction above. Changes will dynamically adjust balances in your dashboard.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="entity-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Date</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Type</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Primary Account</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Post / Counterpart</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Amount</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Notes</th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid var(--border-glass)' }}>
                  <td style={{ padding: '14px 20px', fontSize: '13px' }}>{tx.transaction_date}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {getTypeIcon(tx.type)}
                      <span>{tx.type}</span>
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 500 }}>{getAccountName(tx.account_id)}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: '#cbd5e1' }}>{getCounterpartText(tx)}</td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', fontWeight: 600, color: (tx.type === 'Credit' || tx.type === 'Redemption') ? 'var(--success-light)' : '#f1f5f9' }}>
                    {formatCurrency(tx.amount)}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', color: 'var(--text-muted)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tx.notes || '-'}
                  </td>
                  <td style={{ padding: '14px 20px', fontSize: '13px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleEdit(tx)}>
                        <Edit2 size={12} />
                      </button>
                      <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => handleDelete(tx.id)}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Double-Entry Transaction Form Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '480px', padding: '28px', border: '1px solid var(--border-glass)', position: 'relative' }}>
            <button 
              onClick={() => setModalOpen(false)} 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: '#f1f5f9' }}>
              {editingId ? 'Edit Transaction' : 'Log New Transaction'}
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              <div className="form-group">
                <label className="form-label">Transaction Type</label>
                <select className="form-input" value={type} onChange={e => {
                  setType(e.target.value);
                  setCounterpartId('');
                }}>
                  <option value="Debit">Debit (Expense Payment)</option>
                  <option value="Credit">Credit (Income Deposit)</option>
                  <option value="Transfer">Account Transfer</option>
                  <option value="Investment">Asset Investment</option>
                  <option value="Redemption">Asset Redemption</option>
                  <option value="EMI">EMI Payment (Liability)</option>
                  <option value="Prepayment">Prepayment (Liability)</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Primary Account</label>
                <select className="form-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
                  {data.accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name} (Bal: {formatCurrency(acc.current_balance)})</option>
                  ))}
                </select>
              </div>

              {/* Dynamic counterpart target list */}
              {type === 'Transfer' && (
                <div className="form-group">
                  <label className="form-label">Destination Account</label>
                  <select className="form-input" required value={counterpartId} onChange={e => setCounterpartId(e.target.value)}>
                    <option value="">-- Select Target Account --</option>
                    {targetAccountsList.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name} (Bal: {formatCurrency(acc.current_balance)})</option>
                    ))}
                  </select>
                </div>
              )}

              {(type === 'Investment' || type === 'Redemption') && (
                <div className="form-group">
                  <label className="form-label">Target Asset Entity</label>
                  <select className="form-input" required value={counterpartId} onChange={e => setCounterpartId(e.target.value)}>
                    <option value="">-- Select Asset --</option>
                    {targetAssetsList.map(a => (
                      <option key={a.id} value={a.id}>{a.name} (Val: {formatCurrency(a.current_value)})</option>
                    ))}
                  </select>
                </div>
              )}

              {(type === 'EMI' || type === 'Prepayment') && (
                <div className="form-group">
                  <label className="form-label">Target Debt / Liability</label>
                  <select className="form-input" required value={counterpartId} onChange={e => setCounterpartId(e.target.value)}>
                    <option value="">-- Select Liability --</option>
                    {targetLiabilitiesList.map(l => (
                      <option key={l.id} value={l.id}>{l.name} (O/S: {formatCurrency(l.outstanding)})</option>
                    ))}
                  </select>
                </div>
              )}

              {(type === 'Debit' || type === 'Credit') && (
                <div className="form-group">
                  <label className="form-label">Budget Category</label>
                  <select className="form-input" required value={counterpartId} onChange={e => setCounterpartId(e.target.value)}>
                    <option value="">-- Select Category --</option>
                    {categoriesList.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Amount (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  required 
                  value={amount} 
                  onChange={e => setAmount(e.target.value)} 
                  placeholder="e.g. 15000"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Transaction Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  required 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                />
              </div>

              <div className="form-group">
                <label className="form-label">Notes</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={notes} 
                  onChange={e => setNotes(e.target.value)} 
                  placeholder="Additional context..."
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="button" className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                  <Save size={14} /> Save Posting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
