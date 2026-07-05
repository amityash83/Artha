import React, { useState } from 'react';
import { Plus, Edit2, Trash2, X, Calendar, Award, RefreshCw, Settings, CreditCard as CardIcon } from 'lucide-react';
import { CreditCard } from '../types';

interface CreditCardsProps {
  creditCards: CreditCard[];
  onRefresh: () => void;
}

export const CreditCards: React.FC<CreditCardsProps> = ({ creditCards, onRefresh }) => {
  const [subTab, setSubTab] = useState<'transactional' | 'master'>('transactional');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);

  // Quick Update State (Transactional Only)
  const [quickModalOpen, setQuickModalOpen] = useState(false);
  const [quickCard, setQuickCard] = useState<CreditCard | null>(null);
  const [quickOutstanding, setQuickOutstanding] = useState<number>(0);
  const [quickStatementBalance, setQuickStatementBalance] = useState<number>(0);
  const [quickRewardPoints, setQuickRewardPoints] = useState<number>(0);

  // Full Form State (Master Profile)
  const [name, setName] = useState('');
  const [issuer, setIssuer] = useState('');
  const [creditLimit, setCreditLimit] = useState<number>(0);
  const [outstanding, setOutstanding] = useState<number>(0);
  const [statementBalance, setStatementBalance] = useState<number>(0);
  const [statementDate, setStatementDate] = useState<number>(15);
  const [dueDate, setDueDate] = useState<number>(5);
  const [annualFee, setAnnualFee] = useState<number>(0);
  const [renewalDate, setRenewalDate] = useState('');
  const [rewardPoints, setRewardPoints] = useState<number>(0);
  const [pointValue, setPointValue] = useState<number>(0.25);
  const [loungeAccessDomestic, setLoungeAccessDomestic] = useState('');
  const [loungeAccessInternational, setLoungeAccessInternational] = useState('');
  const [spendMilestoneWaiver, setSpendMilestoneWaiver] = useState<number>(0);
  const [remarks, setRemarks] = useState('');

  const openAddModal = () => {
    setEditingCard(null);
    setName('');
    setIssuer('');
    setCreditLimit(0);
    setOutstanding(0);
    setStatementBalance(0);
    setStatementDate(15);
    setDueDate(5);
    setAnnualFee(0);
    setRenewalDate('');
    setRewardPoints(0);
    setPointValue(0.25);
    setLoungeAccessDomestic('');
    setLoungeAccessInternational('');
    setSpendMilestoneWaiver(0);
    setRemarks('');
    setModalOpen(true);
  };

  const openEditModal = (card: CreditCard) => {
    setEditingCard(card);
    setName(card.name);
    setIssuer(card.issuer);
    setCreditLimit(card.credit_limit);
    setOutstanding(card.outstanding);
    setStatementBalance(card.statement_balance || 0);
    setStatementDate(card.statement_date);
    setDueDate(card.due_date);
    setAnnualFee(card.annual_fee || 0);
    setRenewalDate(card.renewal_date || '');
    setRewardPoints(card.reward_points || 0);
    setPointValue(card.point_value || 0.25);
    setLoungeAccessDomestic(card.lounge_access_domestic || '');
    setLoungeAccessInternational(card.lounge_access_international || '');
    setSpendMilestoneWaiver(card.spend_milestone_waiver || 0);
    setRemarks(card.remarks || '');
    setModalOpen(true);
  };

  const openQuickUpdate = (card: CreditCard) => {
    setQuickCard(card);
    setQuickOutstanding(card.outstanding);
    setQuickStatementBalance(card.statement_balance || 0);
    setQuickRewardPoints(card.reward_points || 0);
    setQuickModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    const payload = {
      id: editingCard?.id || null,
      name,
      issuer,
      credit_limit: creditLimit,
      outstanding,
      statement_balance: statementBalance,
      statement_date: statementDate,
      due_date: dueDate,
      annual_fee: annualFee,
      renewal_date: renewalDate,
      reward_points: rewardPoints,
      point_value: pointValue,
      lounge_access_domestic: loungeAccessDomestic,
      lounge_access_international: loungeAccessInternational,
      spend_milestone_waiver: spendMilestoneWaiver,
      remarks
    };

    try {
      const res = await fetch('http://127.0.0.1:8000/api/credit-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setModalOpen(false);
        onRefresh();
      } else {
        const err = await res.json();
        alert(`Failed to save: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleQuickSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCard) return;

    // Merge other fields from the master profile
    const payload = {
      ...quickCard,
      outstanding: quickOutstanding,
      statement_balance: quickStatementBalance,
      reward_points: quickRewardPoints
    };

    try {
      const res = await fetch('http://127.0.0.1:8000/api/credit-cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setQuickModalOpen(false);
        onRefresh();
      } else {
        const err = await res.json();
        alert(`Failed to save balances: ${err.detail || 'Unknown error'}`);
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this credit card?')) return;
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/credit-cards/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onRefresh();
      } else {
        alert('Failed to delete');
      }
    } catch (err) {
      console.error(err);
      alert('Network error');
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Transactional metrics
  const totalOutstanding = creditCards.reduce((sum, c) => sum + c.outstanding, 0);
  const totalBilled = creditCards.reduce((sum, c) => sum + (c.statement_balance || 0), 0);
  const totalRewardsValue = creditCards.reduce((sum, c) => sum + ((c.reward_points || 0) * (c.point_value || 0.25)), 0);
  const totalLimit = creditCards.reduce((sum, c) => sum + c.credit_limit, 0);
  const avgUtilization = totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0;

  // Master metrics
  const totalAnnualFees = creditCards.reduce((sum, c) => sum + (c.annual_fee || 0), 0);
  const totalMilestones = creditCards.reduce((sum, c) => sum + (c.spend_milestone_waiver || 0), 0);

  // Derive card gradient based on bank issuer or name
  const getCardStyle = (issuerName: string) => {
    const nameLower = issuerName.toLowerCase();
    if (nameLower.includes('hdfc')) {
      return { background: 'linear-gradient(135deg, #09122c 0%, #152554 100%)', border: '1px solid rgba(21,37,84,0.4)' };
    }
    if (nameLower.includes('icici')) {
      return { background: 'linear-gradient(135deg, #38150a 0%, #662b11 100%)', border: '1px solid rgba(102,43,17,0.4)' };
    }
    if (nameLower.includes('sbi')) {
      return { background: 'linear-gradient(135deg, #052433 0%, #0d587a 100%)', border: '1px solid rgba(13,88,122,0.4)' };
    }
    if (nameLower.includes('axis')) {
      return { background: 'linear-gradient(135deg, #2b0413 0%, #4c0d25 100%)', border: '1px solid rgba(76,13,37,0.4)' };
    }
    if (nameLower.includes('amex') || nameLower.includes('american')) {
      return { background: 'linear-gradient(135deg, #04363f 0%, #0c6170 100%)', border: '1px solid rgba(12,97,112,0.4)' };
    }
    return { background: 'linear-gradient(135deg, #13161c 0%, #222831 100%)', border: '1px solid rgba(255,255,255,0.06)' };
  };

  return (
    <div>
      {/* Header Area */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="page-title">Credit Cards</h1>
          <p className="page-subtitle">Track billing statement cycles, waiver limits, and optimize credit points.</p>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Add Master Card
        </button>
      </div>

      {/* Sub-tab Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px' }}>
        <button 
          className={`btn ${subTab === 'transactional' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('transactional')}
          style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} /> Balances &amp; Transactions
        </button>
        <button 
          className={`btn ${subTab === 'master' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setSubTab('master')}
          style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <Settings size={14} /> Benefits &amp; Master Profiles
        </button>
      </div>

      {/* Responsive KPI Panels */}
      {subTab === 'transactional' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total CC Outstanding</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--danger)' }}>
              {formatCurrency(totalOutstanding)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Total Billed (Due Next)</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--warning)' }}>
              {formatCurrency(totalBilled)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Accrued Rewards Assets</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--success)' }}>
              {formatCurrency(totalRewardsValue)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Overall Card Utilization</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: avgUtilization > 40 ? 'var(--warning)' : 'var(--success)' }}>
              {avgUtilization.toFixed(1)}%
            </h2>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '32px' }}>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Aggregated Credit Limits</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--text-primary)' }}>
              {formatCurrency(totalLimit)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Upcoming Annual Fees</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--danger)' }}>
              {formatCurrency(totalAnnualFees)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Active Waiver Milestones</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--info)' }}>
              {formatCurrency(totalMilestones)}
            </h2>
          </div>
          <div className="glass-card" style={{ padding: '16px 20px' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Active Cards Inventory</span>
            <h2 style={{ fontSize: '22px', fontWeight: 700, margin: '4px 0 0 0', color: 'var(--accent-light)' }}>
              {creditCards.length} Cards
            </h2>
          </div>
        </div>
      )}

      {/* Grid List Container (No horizontal scrollbar) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
        {creditCards.length > 0 ? (
          creditCards.map(cc => {
            const cardTheme = getCardStyle(cc.issuer);
            const utilization = cc.credit_limit > 0 ? (cc.outstanding / cc.credit_limit) * 100 : 0;
            const availLimit = cc.credit_limit - cc.outstanding;
            const unbilled = Math.max(cc.outstanding - (cc.statement_balance || 0), 0);
            const rewardsCash = (cc.reward_points || 0) * (cc.point_value || 0.25);
            
            return (
              <div 
                key={cc.id} 
                style={{ 
                  background: cardTheme.background, 
                  border: cardTheme.border,
                  borderRadius: '16px',
                  padding: '20px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  minHeight: '270px',
                  color: '#ffffff',
                  fontFamily: 'Inter, sans-serif'
                }}
              >
                {/* Header Row */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.8px', opacity: 0.6 }}>
                        {cc.issuer}
                      </h4>
                      <h3 style={{ margin: '2px 0 0 0', fontSize: '16px', fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>
                        {cc.name}
                      </h3>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {subTab === 'transactional' ? (
                        <button 
                          title="Quick Update Balance"
                          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onClick={() => openQuickUpdate(cc)}
                        >
                          <RefreshCw size={13} />
                        </button>
                      ) : (
                        <button 
                          title="Edit Card Profile"
                          style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: '6px', padding: '6px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onClick={() => openEditModal(cc)}
                        >
                          <Edit2 size={13} />
                        </button>
                      )}
                      <button 
                        title="Delete Card"
                        style={{ background: 'rgba(239,68,68,0.15)', border: 'none', borderRadius: '6px', padding: '6px', color: '#f87171', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                        onClick={() => handleDelete(cc.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Limit bar */}
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', opacity: 0.7, marginBottom: '4px' }}>
                      <span>Utilized: {utilization.toFixed(0)}%</span>
                      <span>Avail: {formatCurrency(availLimit)} / {formatCurrency(cc.credit_limit)}</span>
                    </div>
                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(utilization, 100)}%`, background: utilization > 45 ? 'var(--danger)' : 'var(--success)', borderRadius: '2px' }}></div>
                    </div>
                  </div>
                </div>

                {/* SubTab Specific Contents */}
                {subTab === 'transactional' ? (
                  /* Transactional Data Content */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '16px 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Billed (Due Next)</span>
                      <strong style={{ fontSize: '13px', color: (cc.statement_balance || 0) > 0 ? '#f59e0b' : '#ffffff' }}>
                        {formatCurrency(cc.statement_balance || 0)}
                      </strong>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', marginTop: '2px' }}>Due: {cc.due_date}th of month</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Unbilled Transactions</span>
                      <strong style={{ fontSize: '13px' }}>{formatCurrency(unbilled)}</strong>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', marginTop: '2px' }}>Stmt: {cc.statement_date}th of month</span>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Total Outstanding</span>
                      <strong style={{ fontSize: '13px', color: cc.outstanding > 0 ? '#ef4444' : '#ffffff' }}>{formatCurrency(cc.outstanding)}</strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Rewards Points</span>
                      <strong style={{ fontSize: '13px', color: '#10b981', display: 'flex', alignItems: 'center', gap: '3px' }}>
                        <Award size={13} />
                        {cc.reward_points || 0}
                      </strong>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', marginTop: '2px' }}>Cash Val: ≈ {formatCurrency(rewardsCash)}</span>
                    </div>
                  </div>
                ) : (
                  /* Master Data Content */
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '16px 0', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '12px' }}>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Annual Fee</span>
                      <strong style={{ fontSize: '13px', color: cc.annual_fee > 0 ? '#f87171' : '#10b981' }}>
                        {cc.annual_fee > 0 ? formatCurrency(cc.annual_fee) : 'Free / Lifetime'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Waiver Threshold</span>
                      <strong style={{ fontSize: '13px' }}>
                        {cc.spend_milestone_waiver > 0 ? formatCurrency(cc.spend_milestone_waiver) : 'No Milestone'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Next Renewal Date</span>
                      <strong style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={12} />
                        {cc.renewal_date || 'N/A'}
                      </strong>
                    </div>
                    <div>
                      <span style={{ fontSize: '9px', opacity: 0.5, display: 'block', textTransform: 'uppercase' }}>Points Conversion</span>
                      <strong style={{ fontSize: '13px' }}>1 Pt = {formatCurrency(cc.point_value || 0.25)}</strong>
                    </div>
                  </div>
                )}

                {/* Footer benefit labels */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', background: 'rgba(0,0,0,0.15)', padding: '6px 10px', borderRadius: '6px' }}>
                  <span>Dom Lounge: <strong>{cc.lounge_access_domestic || 'N/A'}</strong></span>
                  <span>Int Lounge: <strong>{cc.lounge_access_international || 'N/A'}</strong></span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="glass-panel" style={{ gridColumn: '1 / -1', padding: '48px', textAlign: 'center', color: 'var(--text-muted)' }}>
            No credit cards configured. Click "Add Master Card" to initialize.
          </div>
        )}
      </div>

      {/* Transactional Quick Update Modal */}
      {quickModalOpen && quickCard && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleQuickSave} style={{ maxWidth: '420px', width: '90%' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <RefreshCw size={16} /> Quick Balance Update
              </h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px' }} onClick={() => setQuickModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Updating balances for <strong>{quickCard.issuer} {quickCard.name}</strong>. These values change dynamically month-to-month.
            </p>

            <div className="form-group">
              <label className="form-label">Latest Billed Statement Balance (₹)</label>
              <input 
                type="number" 
                className="form-input" 
                required 
                value={quickStatementBalance} 
                onChange={e => setQuickStatementBalance(parseFloat(e.target.value) || 0)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Total Outstanding Balance (₹)</label>
              <input 
                type="number" 
                className="form-input" 
                required 
                value={quickOutstanding} 
                onChange={e => setQuickOutstanding(parseFloat(e.target.value) || 0)} 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Accrued Reward Points Balance</label>
              <input 
                type="number" 
                className="form-input" 
                required 
                value={quickRewardPoints} 
                onChange={e => setQuickRewardPoints(parseInt(e.target.value) || 0)} 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
              Save Balances
            </button>
          </form>
        </div>
      )}

      {/* Full Master Card Settings Modal */}
      {modalOpen && (
        <div className="modal-overlay">
          <form className="modal-content" onSubmit={handleSave} style={{ maxWidth: '550px', width: '95%' }}>
            <div className="modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CardIcon size={16} /> {editingCard ? 'Edit Card Profile' : 'Add New Card Profile'}
              </h3>
              <button type="button" className="btn btn-secondary" style={{ padding: '4px' }} onClick={() => setModalOpen(false)}>
                <X size={16} />
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Card Name</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  placeholder="e.g. Regalia Gold / Infinia" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Bank / Issuer</label>
                <input 
                  type="text" 
                  className="form-input" 
                  required 
                  placeholder="e.g. HDFC Bank" 
                  value={issuer} 
                  onChange={e => setIssuer(e.target.value)} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Total Credit Limit (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  value={creditLimit} 
                  onChange={e => setCreditLimit(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Billed Balance (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  value={statementBalance} 
                  onChange={e => setStatementBalance(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Total Outstanding (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  value={outstanding} 
                  onChange={e => setOutstanding(parseFloat(e.target.value) || 0)} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Statement Date (Day of Month)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  min={1}
                  max={31}
                  value={statementDate} 
                  onChange={e => setStatementDate(parseInt(e.target.value) || 15)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Due Date (Day of Month)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  required 
                  min={1}
                  max={31}
                  value={dueDate} 
                  onChange={e => setDueDate(parseInt(e.target.value) || 5)} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Annual Fee (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={annualFee} 
                  onChange={e => setAnnualFee(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Waiver Milestone (₹)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={spendMilestoneWaiver} 
                  onChange={e => setSpendMilestoneWaiver(parseFloat(e.target.value) || 0)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Renewal Date</label>
                <input 
                  type="date" 
                  className="form-input" 
                  value={renewalDate} 
                  onChange={e => setRenewalDate(e.target.value)} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Reward Points Balance</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={rewardPoints} 
                  onChange={e => setRewardPoints(parseInt(e.target.value) || 0)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Point Cash Value (₹)</label>
                <input 
                  type="number" 
                  step="0.01" 
                  className="form-input" 
                  value={pointValue} 
                  onChange={e => setPointValue(parseFloat(e.target.value) || 0.25)} 
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div className="form-group">
                <label className="form-label">Domestic Lounge Access</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 4 per quarter" 
                  value={loungeAccessDomestic} 
                  onChange={e => setLoungeAccessDomestic(e.target.value)} 
                />
              </div>
              <div className="form-group">
                <label className="form-label">International Lounge Access</label>
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="e.g. 2 per year" 
                  value={loungeAccessInternational} 
                  onChange={e => setLoungeAccessInternational(e.target.value)} 
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Remarks</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="e.g. Primary online transactions, rewards focus" 
                value={remarks} 
                onChange={e => setRemarks(e.target.value)} 
              />
            </div>

            <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>
              {editingCard ? 'Update Card Profile' : 'Save Card Profile'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
