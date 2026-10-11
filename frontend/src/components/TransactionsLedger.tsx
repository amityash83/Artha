import React, { useState, useEffect } from 'react';
import { formatDate } from '../format';
import { Plus, Search } from 'lucide-react';
import { formatINR } from '../format';
import { AmountInput, ConfirmAction } from './settings/ui';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { useModalA11y } from '../hooks/useModalA11y';

interface TransactionsLedgerProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Open the "Log transaction" form (from "+ New", Go-to search or the desktop menu). */
  addRequest?: number;
}

interface Transaction {
  id: number;
  account_id: number;
  type: string; // Credit, Debit, Transfer, Investment, Redemption, EMI, Prepayment, Spend
  amount: number;
  transaction_date: string;
  category_id?: number;
  notes?: string;
  related_entity_type?: string;
  related_entity_id?: number;
}

export const TransactionsLedger: React.FC<TransactionsLedgerProps> = ({ data, onRefresh, showToast, addRequest }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const modalRef = useModalA11y(modalOpen, () => setModalOpen(false));
  const [editingId, setEditingId] = useState<number | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('All');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // How many rows to show; "Show more" raises it.
  const [shown, setShown] = useState<number>(60);

  // Form State
  const [type, setType] = useState<string>('Debit');
  const [accountId, setAccountId] = useState<string>('');
  const [counterpartId, setCounterpartId] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [date, setDate] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  // Spend needs BOTH a target card AND a category simultaneously — unlike every
  // other type, which needs at most one "other thing" besides amount/date (the
  // single counterpartId field already means "target card" for Spend, so
  // category needs its own state).
  const [spendCategoryId, setSpendCategoryId] = useState<string>('');

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
      case 'Spend':
        // No account is involved (source_ref_type='None') — a card charge isn't
        // paid from a cash account at the moment it's made.
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
      category_id: t.category_id,
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
    // Spend has no account (a card charge doesn't touch a cash account) — every
    // other type still requires one.
    if ((type !== 'Spend' && !accountId) || !amount || !date) {
      if (showToast) showToast("Please fill in all required fields.", "error");
      else alert("Please fill in all required fields.");
      return;
    }
    if (type === 'Spend' && !counterpartId) {
      if (showToast) showToast("Please select a card.", "error");
      else alert("Please select a card.");
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
    } else if (type === 'Spend') {
      relatedEntityType = 'Liability';
      relatedEntityId = parsedCounterpartId;
      categoryId = spendCategoryId ? parseInt(spendCategoryId) : null;
    } else if (type === 'Debit' || type === 'Credit') {
      // Category is optional for Debit/Credit — empty selection stays null (NaN
      // from parseInt('') would otherwise serialize as null anyway, but be explicit).
      categoryId = counterpartId ? parsedCounterpartId : null;
    }

    const payload = {
      account_id: type === 'Spend' ? null : parseInt(accountId),
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
        setSpendCategoryId('');
        fetchTransactions();
        onRefresh();
        if (showToast) showToast("Transaction saved", "success");
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
    if (tx.type === 'Spend') {
      setCounterpartId(tx.related_entity_id?.toString() || '');
      setSpendCategoryId(tx.category_id?.toString() || '');
    } else if (tx.type === 'Transfer' || tx.type === 'Investment' || tx.type === 'Redemption' || tx.type === 'EMI' || tx.type === 'Prepayment') {
      setCounterpartId(tx.related_entity_id?.toString() || '');
    } else {
      setCounterpartId(tx.category_id?.toString() || '');
    }

    setModalOpen(true);
  };

  const openNew = () => {
    setEditingId(null);
    setType('Debit');
    setAmount('');
    setNotes('');
    setCounterpartId('');
    setSpendCategoryId('');
    setDate(new Date().toISOString().split('T')[0]); // not the date of whatever was edited last
    setModalOpen(true);
  };
  useEffect(() => {
    if (addRequest) openNew();
  }, [addRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/transactions/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setModalOpen(false);
        setEditingId(null);
        fetchTransactions();
        onRefresh();
        if (showToast) showToast("Transaction deleted", "success");
      } else {
        if (showToast) showToast("Failed to delete transaction", "error");
        else alert("Failed to delete transaction");
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Plain names for the ledger's types, in the form and the filter.
  const TYPE_LABELS: Record<string, string> = {
    Debit: 'Money out', Credit: 'Money in', Transfer: 'Transfer between accounts', Investment: 'Invest in an asset',
    Redemption: 'Sell or redeem an asset', EMI: 'Loan EMI', Prepayment: 'Loan prepayment or card bill', Spend: 'Card spend',
  };
  const MONEY_IN = ['Credit', 'Redemption'];
  const NEUTRAL = ['Transfer'];

  const accountName = (id: number) => data.accounts.find((a) => a.id === id)?.name;
  const categoryName = (id?: number) => (id ? data.categories.find((c) => c.id === id)?.name : undefined);

  /** What the entry was, in words: the line a bank statement would show. */
  const describe = (tx: Transaction): string => {
    const asset = () => data.assets.find((a) => a.id === tx.related_entity_id)?.name ?? 'an asset';
    const debt = () => data.liabilities.find((l) => l.id === tx.related_entity_id)?.name ?? 'a loan';
    switch (tx.type) {
      case 'Transfer': return `Transfer to ${accountName(tx.related_entity_id ?? 0) ?? 'another account'}`;
      case 'Investment': return `Invested in ${asset()}`;
      case 'Redemption': return `Redeemed from ${asset()}`;
      case 'EMI': return `EMI: ${debt()}`;
      case 'Prepayment': return `Paid off ${debt()}`;
      case 'Spend': return categoryName(tx.category_id) ?? 'Card spend';
      default: return categoryName(tx.category_id) ?? tx.notes ?? (tx.type === 'Credit' ? 'Money in' : 'Money out');
    }
  };
  /** Which account (or card) it touched. */
  const where = (tx: Transaction) => (tx.type === 'Spend'
    ? data.liabilities.find((l) => l.id === tx.related_entity_id)?.name ?? 'A card'
    : accountName(tx.account_id) ?? 'An account');

  const q = searchQuery.trim().toLowerCase();
  const filtered = transactions.filter((tx) => {
    if (filterType !== 'All' && tx.type !== filterType) return false;
    if (startDate && tx.transaction_date < startDate) return false;
    if (endDate && tx.transaction_date > endDate) return false;
    return !q || [describe(tx), where(tx), tx.notes || '', TYPE_LABELS[tx.type] || tx.type].some((t) => t.toLowerCase().includes(q));
  }).sort((a, b) => b.transaction_date.localeCompare(a.transaction_date) || b.id - a.id);

  const totalIn = filtered.filter((t) => MONEY_IN.includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const totalOut = filtered.filter((t) => !MONEY_IN.includes(t.type) && !NEUTRAL.includes(t.type)).reduce((s, t) => s + t.amount, 0);
  const visible = filtered.slice(0, shown);
  const months: { key: string; rows: Transaction[] }[] = [];
  for (const tx of visible) {
    const key = tx.transaction_date.slice(0, 7);
    const last = months[months.length - 1];
    if (last && last.key === key) last.rows.push(tx); else months.push({ key, rows: [tx] });
  }
  const monthLabel = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  const filtering = !!(q || filterType !== 'All' || startDate || endDate);

  // Choices for the form, by type.
  const targetAccountsList = data.accounts.filter((a) => a.id.toString() !== accountId);
  const categoriesList = data.categories.filter((c) => {
    if (type === 'Debit' || type === 'Spend') return c.entity_type === 'Expense';
    if (type === 'Credit') return c.entity_type === 'Income';
    return false;
  });
  const cards = data.liabilities.filter((l: any) => l.category_name === 'Credit Card');
  const opt = (label: string) => <option value="">{label}</option>;

  return (
    <div className="db-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">Transactions Ledger</h1>
          <p className="page-subtitle">Every payment, transfer and purchase. Account balances are worked out from these entries.</p>
        </div>
        <button className="btn btn-primary eg-add" onClick={openNew}><Plus size={15} /> Log a transaction</button>
      </div>

      <div className="tl-filters">
        <div className="eg-search">
          <Search size={14} />
          <input type="search" className="form-control" placeholder="Search" aria-label="Search transactions" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
        <select className="form-control" aria-label="Type" value={filterType} onChange={(e) => setFilterType(e.target.value)}>
          <option value="All">All types</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className="tl-date"><span>From</span><input type="date" className="form-control" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label className="tl-date"><span>To</span><input type="date" className="form-control" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
        {filtering && <button type="button" className="settings-link" onClick={() => { setSearchQuery(''); setFilterType('All'); setStartDate(''); setEndDate(''); }}>Clear</button>}
        {!loading && filtered.length > 0 && (
          <span className="tl-totals">{filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'} · <span className="tl-in">in {formatINR(totalIn)}</span> · out {formatINR(totalOut)}</span>
        )}
      </div>

      {loading ? <p className="cc-note">Loading…</p> : transactions.length === 0 ? (
        <div className="settings-group"><div className="ie-empty">
          <p>No transactions yet. Log money coming in and going out, and your account balances will follow.</p>
          <div><button type="button" className="settings-btn" onClick={openNew}><Plus size={12} /> Log a transaction</button></div>
        </div></div>
      ) : filtered.length === 0 ? (
        <div className="settings-group"><div className="ie-empty"><p>Nothing matches these filters.</p></div></div>
      ) : (
        <div className="eg-groups">
          {months.map((m) => {
            const mIn = m.rows.filter((t) => MONEY_IN.includes(t.type)).reduce((s, t) => s + t.amount, 0);
            const mOut = m.rows.filter((t) => !MONEY_IN.includes(t.type) && !NEUTRAL.includes(t.type)).reduce((s, t) => s + t.amount, 0);
            return (
              <section key={m.key} aria-label={monthLabel(m.key)}>
                <div className="settings-group-head">
                  <h3 className="settings-group-title">{monthLabel(m.key)}</h3>
                  <span className="eg-group-total"><span className="tl-in">in {formatINR(mIn)}</span> · out {formatINR(mOut)}</span>
                </div>
                <div className="settings-group">
                  {m.rows.map((tx) => {
                    const sign = MONEY_IN.includes(tx.type) ? '+' : NEUTRAL.includes(tx.type) ? '' : '−';
                    return (
                      <button key={tx.id} type="button" className="ie-row" onClick={() => handleEdit(tx)}>
                        <span className="ie-row-text">
                          <strong>{describe(tx)}</strong>
                          <span>{[formatDate(tx.transaction_date), where(tx), tx.type === 'Debit' || tx.type === 'Credit' ? null : TYPE_LABELS[tx.type], tx.notes && tx.notes !== describe(tx) ? tx.notes : null].filter(Boolean).join(' · ')}</span>
                        </span>
                        <span className="ie-row-amount">
                          <strong className={sign === '+' ? 'tl-in' : undefined}>{sign}{formatINR(tx.amount)}</strong>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {filtered.length > shown && (
            <button type="button" className="settings-btn" style={{ alignSelf: 'center' }} onClick={() => setShown((n) => n + 60)}>
              Show more ({filtered.length - shown} older)
            </button>
          )}
        </div>
      )}

      {modalOpen && (
        <div className="db-modal" onMouseDown={(e) => { if (e.target === e.currentTarget) setModalOpen(false); }}>
          <div ref={modalRef} role="dialog" aria-modal="true" aria-label={editingId ? 'Edit transaction' : 'Log a transaction'} tabIndex={-1} className="db-modal-body" style={{ maxWidth: '560px' }}>
            <form className="glass-panel df-form" onSubmit={handleSubmit}>
              <div className="df-head"><h3>{editingId ? 'Edit transaction' : 'Log a transaction'}</h3></div>
              <div className="df-body">
                <div className="df-grid">
                  <div className="df-field df-wide">
                    <label htmlFor="tx-type" className="df-label">What happened</label>
                    <select id="tx-type" className="form-control" value={type} onChange={(e) => { setType(e.target.value); setCounterpartId(''); setSpendCategoryId(''); }}>
                      {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>

                  {type !== 'Spend' && (
                    <div className="df-field">
                      <label htmlFor="tx-account" className="df-label">{type === 'Credit' || type === 'Redemption' ? 'Into account' : 'From account'}</label>
                      <select id="tx-account" className="form-control" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                        {data.accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.name} ({formatINR(acc.current_balance)})</option>)}
                      </select>
                    </div>
                  )}

                  {type === 'Transfer' && (
                    <div className="df-field">
                      <label htmlFor="tx-to" className="df-label">To account</label>
                      <select id="tx-to" className="form-control" required value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}>
                        {opt('Choose an account')}
                        {targetAccountsList.map((acc) => <option key={acc.id} value={acc.id}>{acc.name} ({formatINR(acc.current_balance)})</option>)}
                      </select>
                    </div>
                  )}

                  {(type === 'Investment' || type === 'Redemption') && (
                    <div className="df-field">
                      <label htmlFor="tx-asset" className="df-label">Asset</label>
                      <select id="tx-asset" className="form-control" required value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}>
                        {opt('Choose an asset')}
                        {data.assets.map((a) => <option key={a.id} value={a.id}>{a.name} ({formatINR(a.current_value)})</option>)}
                      </select>
                    </div>
                  )}

                  {(type === 'EMI' || type === 'Prepayment') && (
                    <div className="df-field">
                      <label htmlFor="tx-debt" className="df-label">Loan or card</label>
                      <select id="tx-debt" className="form-control" required value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}>
                        {opt('Choose one')}
                        {data.liabilities.map((l) => <option key={l.id} value={l.id}>{l.name} ({formatINR(l.outstanding)} owed)</option>)}
                      </select>
                    </div>
                  )}

                  {type === 'Spend' && (
                    <div className="df-field">
                      <label htmlFor="tx-card" className="df-label">Card</label>
                      <select id="tx-card" className="form-control" required value={counterpartId} onChange={(e) => setCounterpartId(e.target.value)}>
                        {opt('Choose a card')}
                        {cards.map((l) => <option key={l.id} value={l.id}>{l.name} ({formatINR(l.outstanding)} owed)</option>)}
                      </select>
                    </div>
                  )}

                  {(type === 'Debit' || type === 'Credit' || type === 'Spend') && (
                    <div className="df-field">
                      <label htmlFor="tx-cat" className="df-label">{type === 'Spend' ? 'Category' : 'Category (optional)'}</label>
                      {/* Optional for money in/out: rows like opening-balance credits have no clean
                          category. Required for card spend: the categories double as the reward
                          engine's vocabulary, and an uncategorised charge can't match a reward rule. */}
                      <select id="tx-cat" className="form-control" required={type === 'Spend'}
                        value={type === 'Spend' ? spendCategoryId : counterpartId}
                        onChange={(e) => (type === 'Spend' ? setSpendCategoryId(e.target.value) : setCounterpartId(e.target.value))}>
                        {opt(type === 'Spend' ? 'Choose a category' : 'None')}
                        {categoriesList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="df-field">
                    <label htmlFor="tx-amount" className="df-label">Amount</label>
                    <AmountInput id="tx-amount" label="Amount" prefix="₹" value={Number(amount) || 0} onChange={(v) => setAmount(String(v))} />
                  </div>
                  <div className="df-field">
                    <label htmlFor="tx-date" className="df-label">Date</label>
                    <input id="tx-date" type="date" className="form-control" required value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="df-field df-wide">
                    <label htmlFor="tx-notes" className="df-label">Notes</label>
                    <input id="tx-notes" className="form-control" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What it was for" />
                  </div>
                </div>
              </div>
              <div className="df-foot">
                <div>{editingId !== null && <ConfirmAction label="Delete" confirmLabel="Delete" danger question="Delete this transaction? Balances will be recalculated." onConfirm={() => handleDelete(editingId)} />}</div>
                <div className="df-actions">
                  <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                  <button type="submit" className="btn btn-primary">{editingId ? 'Save changes' : 'Save'}</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
