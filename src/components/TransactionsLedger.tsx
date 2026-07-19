import React, { useState, useEffect } from 'react';
import { 
  Plus, Edit2, Trash2, ArrowUpRight, ArrowDownRight, 
  ArrowRightLeft, Save, Info, RefreshCw, X
} from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { useModalA11y } from '../hooks/useModalA11y';

interface TransactionsLedgerProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
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

export const TransactionsLedger: React.FC<TransactionsLedgerProps> = ({ data, onRefresh, showToast }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const modalRef = useModalA11y(modalOpen, () => setModalOpen(false));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [deletingTxId, setDeletingTxId] = useState<number | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Sorting states
  const [sortColumn, setSortColumn] = useState<string>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize] = useState<number>(10);

  // Form State
  const [type, setType] = useState<string>('Debit');
  const [accountId, setAccountId] = useState<string>('');
  const [counterpartId, setCounterpartId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // The API stores double-entry rows (source_ref_type/source_ref_id/dest_ref_type/
  // dest_ref_id, with Buy/Sell types); this ledger's form and display work in the
  // legacy view-model (account_id + related_entity, Investment/Redemption types).
  // Map each row back — the backend performs the inverse mapping on POST/PUT
  // (normalize_legacy_transaction_payload in main.py).
  const toLedgerView = (t: any): Transaction => {
    let account_id: number = 0;
    let related_entity_type: string | undefined;
    let related_entity_id: number | undefined;
    let displayType: string = t.type;

    switch (t.type) {
      case 'Credit':
        account_id = t.dest_ref_id;
        break;
      case 'Debit':
        account_id = t.source_ref_id;
        break;
      case 'Transfer':
        account_id = t.source_ref_id;
        related_entity_type = 'Account';
        related_entity_id = t.dest_ref_id;
        break;
      case 'Buy':
      case 'Investment':
        displayType = 'Investment';
        account_id = t.source_ref_id;
        related_entity_type = 'Asset';
        related_entity_id = t.dest_ref_id;
        break;
      case 'Sell':
      case 'Redemption':
        displayType = 'Redemption';
        account_id = t.dest_ref_id;
        related_entity_type = 'Asset';
        related_entity_id = t.source_ref_id;
        break;
      case 'EMI':
      case 'Prepayment':
        account_id = t.source_ref_id;
        related_entity_type = 'Liability';
        related_entity_id = t.dest_ref_id;
        break;
    }

    return {
      id: t.id,
      account_id,
      type: displayType,
      amount: t.amount,
      transaction_date: t.transaction_date,
      notes: t.notes,
      related_entity_type,
      related_entity_id,
    };
  };

  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions`);
      if (res.ok) {
        const d = await res.json();
        // Sort transactions by date descending
        d.sort((a: any, b: any) => new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime());
        setTransactions(d.map(toLedgerView));
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
      if (showToast) showToast("Please fill in all required fields.", "error");
      else alert("Please fill in all required fields.");
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
        if (showToast) showToast("Transaction saved successfully!", "success");
      } else {
        const err = await res.json();
        const msg = "Failed to save transaction: " + (err.detail || "Unknown error");
        if (showToast) showToast(msg, "error");
        else alert(msg);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error saving transaction details", "error");
      else alert("Error saving transaction details");
    }
  };

  const handleEdit = (tx: Transaction) => {
    setEditingId(tx.id);
    setType(tx.type);
    setAccountId(tx.account_id != null ? tx.account_id.toString() : '');
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
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchTransactions();
        onRefresh();
        if (showToast) showToast("Transaction deleted successfully!", "success");
      } else {
        if (showToast) showToast("Failed to delete transaction", "error");
        else alert("Failed to delete transaction");
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

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortOrder('asc');
    }
  };

  const filteredTransactions = transactions.filter(tx => {
    const notesMatch = tx.notes ? tx.notes.toLowerCase().includes(searchQuery.toLowerCase()) : false;
    const accountMatch = getAccountName(tx.account_id).toLowerCase().includes(searchQuery.toLowerCase());
    const counterpartMatch = getCounterpartText(tx).toLowerCase().includes(searchQuery.toLowerCase());
    const typeMatch = tx.type.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesSearch = searchQuery === '' || notesMatch || accountMatch || counterpartMatch || typeMatch;
    const matchesType = filterType === 'All' || tx.type === filterType;

    const txDate = new Date(tx.transaction_date).getTime();
    const matchesStart = startDate === '' || txDate >= new Date(startDate).getTime();
    const matchesEnd = endDate === '' || txDate <= new Date(endDate).getTime();

    return matchesSearch && matchesType && matchesStart && matchesEnd;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    let valA: any = a.transaction_date;
    let valB: any = b.transaction_date;

    if (sortColumn === 'date') {
      valA = new Date(a.transaction_date).getTime();
      valB = new Date(b.transaction_date).getTime();
    } else if (sortColumn === 'type') {
      valA = a.type;
      valB = b.type;
    } else if (sortColumn === 'account') {
      valA = getAccountName(a.account_id);
      valB = getAccountName(b.account_id);
    } else if (sortColumn === 'counterpart') {
      valA = getCounterpartText(a);
      valB = getCounterpartText(b);
    } else if (sortColumn === 'amount') {
      valA = a.amount;
      valB = b.amount;
    } else if (sortColumn === 'notes') {
      valA = a.notes || '';
      valB = b.notes || '';
    }

    if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
    if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
    return 0;
  });

  const totalItems = sortedTransactions.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedTransactions = sortedTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);

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

      {!loading && (
        <div className="glass-panel" style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 1.2fr 1.2fr auto', gap: '16px', padding: '16px', marginBottom: '20px', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Search Notes / Accounts / Counterpart</label>
            <input 
              type="text" 
              className="form-input" 
              style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff' }}
              placeholder="Search..." 
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>Type</label>
            <select 
              className="form-input" 
              style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff' }}
              value={filterType} 
              onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
            >
              <option value="All">All Types</option>
              <option value="Debit">Debit</option>
              <option value="Credit">Credit</option>
              <option value="Transfer">Transfer</option>
              <option value="Investment">Investment</option>
              <option value="Redemption">Redemption</option>
              <option value="EMI">EMI</option>
              <option value="Prepayment">Prepayment</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>From Date</label>
            <input 
              type="date" 
              className="form-input" 
              style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff' }}
              value={startDate}
              onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <label style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>To Date</label>
            <input 
              type="date" 
              className="form-input" 
              style={{ padding: '8px 12px', fontSize: '13px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px', color: '#fff' }}
              value={endDate}
              onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
            />
          </div>
          <button 
            className="btn btn-secondary" 
            style={{ height: '38px', fontSize: '12px', padding: '0 16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
            onClick={() => {
              setSearchQuery('');
              setFilterType('All');
              setStartDate('');
              setEndDate('');
              setCurrentPage(1);
            }}
          >
            Clear Filters
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '48px', textTransform: 'uppercase', textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading Transactions Ledger...
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="glass-panel" style={{ padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <Info size={40} style={{ margin: '0 auto 16px auto', opacity: 0.5 }} />
          <h3>No Matching Transactions</h3>
          <p style={{ maxWidth: '400px', margin: '8px auto 20px auto', fontSize: '13px' }}>
            No transaction records matched your search query or filters. Try adjusting your parameters.
          </p>
        </div>
      ) : (
        <div className="glass-panel" style={{ overflowX: 'auto', padding: 0 }}>
          <table className="entity-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-glass)', textAlign: 'left' }}>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('date')}
                >
                  Date {sortColumn === 'date' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('type')}
                >
                  Type {sortColumn === 'type' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('account')}
                >
                  Primary Account {sortColumn === 'account' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('counterpart')}
                >
                  Post / Counterpart {sortColumn === 'counterpart' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('amount')}
                >
                  Amount {sortColumn === 'amount' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th 
                  style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => handleSort('notes')}
                >
                  Notes {sortColumn === 'notes' ? (sortOrder === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
                <th style={{ padding: '14px 20px', fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.map(tx => (
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
                    {deletingTxId === tx.id ? (
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        <span style={{ color: 'var(--danger-light)', fontSize: '11px', fontWeight: 500 }}>Confirm?</span>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '3px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                          onClick={() => {
                            handleDelete(tx.id);
                            setDeletingTxId(null);
                          }}
                        >
                          Yes
                        </button>
                        <button 
                          className="btn btn-secondary" 
                          style={{ padding: '3px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                          onClick={() => setDeletingTxId(null)}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'inline-flex', gap: '8px' }}>
                        <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={() => handleEdit(tx)}>
                          <Edit2 size={12} />
                        </button>
                        <button className="btn btn-danger" style={{ padding: '4px 8px' }} onClick={() => setDeletingTxId(tx.id)}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderTop: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.01)' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} entries
              </span>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                >
                  Previous
                </button>
                <button 
                  className="btn btn-secondary" 
                  style={{ padding: '4px 10px', fontSize: '12px' }}
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Double-Entry Transaction Form Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
        }}>
          <div
            className="glass-panel"
            style={{ width: '100%', maxWidth: '480px', padding: '28px', border: '1px solid var(--border-glass)', position: 'relative' }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="txn-modal-title"
            tabIndex={-1}
          >
            <button
              onClick={() => setModalOpen(false)}
              aria-label="Close"
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>

            <h3 id="txn-modal-title" style={{ fontSize: '18px', fontWeight: 600, marginBottom: '20px', color: '#f1f5f9' }}>
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
