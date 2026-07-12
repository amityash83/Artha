import React, { useState, useMemo } from 'react';
import { 
  CreditCard, Plus, Edit2, Trash2, Award, ShieldAlert,
  X, Calculator, PlusCircle
} from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';

interface CreditCardsProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface CardRewardRule {
  category: string;
  ratePct: number; // Reward rate in percent (e.g. 3.3% for Infinia on general, 10% on smartbuy)
}

export const CreditCards: React.FC<CreditCardsProps> = ({ data, onRefresh, showToast }) => {
  const { liabilities = [], categories = [], institutions = [] } = data;

  // Filter liabilities where category is Credit Card
  const creditCards = useMemo(() => {
    return liabilities.filter((l: any) => l.category_name === 'Credit Card');
  }, [liabilities]);

  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'milestones' | 'calculator' | 'lounges'>('inventory');
  
  // Modals & Forms State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<number | null>(null);

  // Form Field States
  const [name, setName] = useState('');
  const [lenderId, setLenderId] = useState('');
  const [outstanding, setOutstanding] = useState(0);
  const [creditLimit, setCreditLimit] = useState(100000);
  const [statementDate, setStatementDate] = useState(15);
  const [dueDate, setDueDate] = useState(5);
  const [annualFee, setAnnualFee] = useState(0);
  const [renewalDate, setRenewalDate] = useState('');
  const [rewardPoints, setRewardPoints] = useState(0);
  const [pointValue, setPointValue] = useState(0.25);
  const [network, setNetwork] = useState('Visa');
  const [loungeVisitsLimit, setLoungeVisitsLimit] = useState(4);
  const [loungeVisitsUsed, setLoungeVisitsUsed] = useState(0);
  const [loungeIntLimit, setLoungeIntLimit] = useState(0);
  const [loungeIntUsed, setLoungeIntUsed] = useState(0);
  const [milestoneTarget, setMilestoneTarget] = useState(0);
  const [milestoneCurrent, setMilestoneCurrent] = useState(0);
  const [milestoneDesc, setMilestoneDesc] = useState('');
  const [remarks, setRemarks] = useState('');
  
  // Custom Card Reward Rules State (Temporary form storage)
  const [rewardRules, setRewardRules] = useState<CardRewardRule[]>([]);
  const [newRuleCategory, setNewRuleCategory] = useState('General');
  const [newRuleRate, setNewRuleRate] = useState(1);

  // Calculator State
  const [calcCategory, setCalcCategory] = useState('General');
  const [calcAmount, setCalcAmount] = useState<number>(10000);

  // Offers State (Local mockup stored in metadata for the specific card)
  const [offersList, setOffersList] = useState<Array<{ id: string; merchant: string; desc: string; expiry: string }>>([]);
  const [newOfferMerchant, setNewOfferMerchant] = useState('');
  const [newOfferDesc, setNewOfferDesc] = useState('');
  const [newOfferExpiry, setNewOfferExpiry] = useState('');

  // Fetch Category ID for Credit Card
  const creditCardCategoryId = useMemo(() => {
    const cat = categories.find(c => c.name === 'Credit Card');
    return cat ? cat.id : null;
  }, [categories]);

  // Seeding the form when editing a card
  const handleOpenEdit = (card: any) => {
    setEditingCard(card);
    setName(card.name);
    setLenderId(card.lender_institution_id?.toString() || '');
    setOutstanding(card.outstanding || 0);
    
    // Parse metadata
    const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
    setCreditLimit(meta.credit_limit || card.credit_limit || 100000);
    setStatementDate(meta.statement_date || card.statement_date || 15);
    setDueDate(meta.due_date || card.due_date || 5);
    setAnnualFee(meta.annual_fee || card.annual_fee || 0);
    setRenewalDate(meta.renewal_date || card.renewal_date || '');
    setRewardPoints(meta.reward_points || card.reward_points || 0);
    setPointValue(meta.point_value || card.point_value || 0.25);
    setNetwork(meta.network || card.network || 'Visa');
    setLoungeVisitsLimit(meta.lounge_visits_limit || card.lounge_visits_limit || 4);
    setLoungeVisitsUsed(meta.lounge_visits_used || card.lounge_visits_used || 0);
    setLoungeIntLimit(meta.lounge_int_limit || 0);
    setLoungeIntUsed(meta.lounge_int_used || 0);
    setMilestoneTarget(meta.milestone_spend_target || card.milestone_spend_target || 0);
    setMilestoneCurrent(meta.milestone_spend_current || card.milestone_spend_current || 0);
    setMilestoneDesc(meta.milestone_reward_desc || card.milestone_reward_desc || '');
    setRemarks(meta.remarks || card.remarks || '');
    
    // Load rules and offers from metadata
    setRewardRules(meta.reward_rules || [
      { category: 'General', ratePct: meta.point_value ? meta.point_value * 4 : 1 }
    ]);
    setOffersList(meta.offers || []);
    
    setModalOpen(true);
  };

  const handleOpenAdd = () => {
    setEditingCard(null);
    setName('');
    setLenderId('');
    setOutstanding(0);
    setCreditLimit(100000);
    setStatementDate(15);
    setDueDate(5);
    setAnnualFee(0);
    setRenewalDate('');
    setRewardPoints(0);
    setPointValue(0.25);
    setNetwork('Visa');
    setLoungeVisitsLimit(4);
    setLoungeVisitsUsed(0);
    setLoungeIntLimit(0);
    setLoungeIntUsed(0);
    setMilestoneTarget(0);
    setMilestoneCurrent(0);
    setMilestoneDesc('');
    setRemarks('');
    setRewardRules([{ category: 'General', ratePct: 1 }]);
    setOffersList([]);
    setModalOpen(true);
  };

  const handleDeleteCard = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/liabilities/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onRefresh();
        setDeletingCardId(null);
        if (showToast) showToast("Credit Card removed successfully", "success");
      } else {
        if (showToast) showToast("Failed to delete credit card", "error");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error removing credit card", "error");
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !lenderId || !creditCardCategoryId) {
      if (showToast) showToast("Please fill in required fields.", "error");
      return;
    }

    const metadataPayload = {
      credit_limit: Number(creditLimit),
      statement_date: Number(statementDate),
      due_date: Number(dueDate),
      annual_fee: Number(annualFee),
      renewal_date: renewalDate,
      reward_points: Number(rewardPoints),
      point_value: Number(pointValue),
      network,
      lounge_visits_limit: Number(loungeVisitsLimit),
      lounge_visits_used: Number(loungeVisitsUsed),
      lounge_int_limit: Number(loungeIntLimit),
      lounge_int_used: Number(loungeIntUsed),
      milestone_spend_target: Number(milestoneTarget),
      milestone_spend_current: Number(milestoneCurrent),
      milestone_reward_desc: milestoneDesc,
      remarks,
      reward_rules: rewardRules,
      offers: offersList
    };

    const payload = {
      name,
      category_id: creditCardCategoryId,
      lender_institution_id: Number(lenderId),
      interest_rate: 0.0,
      emi: 0.0,
      outstanding: Number(outstanding),
      tenure_months: 0,
      compounding: 'Monthly',
      tax_benefit: 'None',
      metadata_json: JSON.stringify(metadataPayload)
    };

    const isEdit = !!editingCard;
    const url = isEdit 
      ? `${API_BASE_URL}/api/entities/liabilities/${editingCard.id}`
      : `${API_BASE_URL}/api/entities/liabilities`;

    try {
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setModalOpen(false);
        onRefresh();
        if (showToast) showToast(isEdit ? "Card details updated" : "New Card added", "success");
      } else {
        const err = await res.json();
        if (showToast) showToast(`Failed to save: ${err.detail || "Error"}`, "error");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Network error saving card details", "error");
    }
  };

  // Rule management helpers
  const handleAddRule = () => {
    if (rewardRules.some(r => r.category.toLowerCase() === newRuleCategory.toLowerCase())) {
      if (showToast) showToast("Rule for this category already exists.", "info");
      return;
    }
    setRewardRules(prev => [...prev, { category: newRuleCategory, ratePct: Number(newRuleRate) }]);
    setNewRuleCategory('General');
    setNewRuleRate(1);
  };

  const handleRemoveRule = (catToRemove: string) => {
    if (catToRemove === 'General') {
      if (showToast) showToast("Cannot remove General reward rate.", "info");
      return;
    }
    setRewardRules(prev => prev.filter(r => r.category !== catToRemove));
  };

  // Offers management helpers
  const handleAddOffer = () => {
    if (!newOfferMerchant || !newOfferDesc) return;
    const newOffer = {
      id: Math.random().toString(36).substring(2, 7),
      merchant: newOfferMerchant,
      desc: newOfferDesc,
      expiry: newOfferExpiry || 'N/A'
    };
    setOffersList(prev => [...prev, newOffer]);
    setNewOfferMerchant('');
    setNewOfferDesc('');
    setNewOfferExpiry('');
  };

  const handleRemoveOffer = (offerId: string) => {
    setOffersList(prev => prev.filter(o => o.id !== offerId));
  };

  // Metrics
  const metrics = useMemo(() => {
    let totalLimit = 0;
    let totalOutstanding = 0;
    let totalRewardValue = 0;
    let totalFees = 0;

    creditCards.forEach((c: any) => {
      totalOutstanding += c.outstanding || 0;
      const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
      totalLimit += Number(meta.credit_limit || c.credit_limit || 0);
      
      const pts = Number(meta.reward_points || c.reward_points || 0);
      const val = Number(meta.point_value || c.point_value || 0.25);
      totalRewardValue += pts * val;
      
      totalFees += Number(meta.annual_fee || c.annual_fee || 0);
    });

    return {
      totalLimit,
      totalOutstanding,
      totalRewardValue,
      totalFees,
      utilizationRate: totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0
    };
  }, [creditCards]);

  // Merchant recommendation calculations
  const calculatorRecommendations = useMemo(() => {
    if (calcAmount <= 0) return [];
    
    return creditCards.map((c: any) => {
      const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
      const rules = meta.reward_rules || [];
      const ptVal = Number(meta.point_value || 0.25);
      
      // Resolve reward rate
      let matchedRule = rules.find((r: any) => r.category.toLowerCase() === calcCategory.toLowerCase());
      if (!matchedRule) {
        matchedRule = rules.find((r: any) => r.category.toLowerCase() === 'general');
      }
      
      const rate = matchedRule ? Number(matchedRule.ratePct) : 1.0;
      // If rules represent rate percentage (e.g. 3.3% on Infinia)
      const cashBackVal = (calcAmount * rate) / 100;
      
      return {
        cardId: c.id,
        cardName: c.name,
        rewardRate: rate,
        estimatedPoints: Math.round(cashBackVal / ptVal),
        estimatedCash: cashBackVal,
        network: meta.network || 'Visa'
      };
    }).sort((a, b) => b.estimatedCash - a.estimatedCash);
  }, [creditCards, calcCategory, calcAmount]);

  const getInstitutionName = (id: number) => {
    const inst = institutions.find(i => i.id === id);
    return inst ? inst.name : 'Unknown Bank';
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  // Card theme helper
  const getCardTheme = (networkStr: string, index: number) => {
    const themes = [
      { bg: 'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #090514 100%)', border: 'rgba(168, 85, 247, 0.4)', glow: 'rgba(168, 85, 247, 0.15)' }, // Purple glow
      { bg: 'linear-gradient(135deg, #0f172a 0%, #1e293b 60%, #020617 100%)', border: 'rgba(148, 163, 184, 0.3)', glow: 'rgba(255, 255, 255, 0.05)' }, // Slate
      { bg: 'linear-gradient(135deg, #1e293b 0%, #1c1917 60%, #0c0a09 100%)', border: 'rgba(217, 119, 6 0.3)', glow: 'rgba(217, 119, 6, 0.1)' },    // Gold/Amber border
      { bg: 'linear-gradient(135deg, #064e3b 0%, #022c22 70%, #020617 100%)', border: 'rgba(52, 211, 153, 0.3)', glow: 'rgba(52, 211, 153, 0.1)' }   // Emerald
    ];

    if (networkStr.toLowerCase() === 'amex') {
      return { bg: 'linear-gradient(135deg, #134e5e 0%, #0f3747 60%, #05161e 100%)', border: 'rgba(34, 211, 238, 0.4)', glow: 'rgba(34, 211, 238, 0.15)' };
    }
    if (networkStr.toLowerCase() === 'diners') {
      return { bg: 'linear-gradient(135deg, #3b0764 0%, #1e1b4b 70%, #03001e 100%)', border: 'rgba(236, 72, 153, 0.4)', glow: 'rgba(236, 72, 153, 0.15)' };
    }

    return themes[index % themes.length];
  };

  const getNetworkIconText = (networkStr: string) => {
    const net = networkStr.toLowerCase();
    if (net.includes('visa')) return 'VISA';
    if (net.includes('master') || net.includes('mc')) return 'mastercard';
    if (net.includes('rupay')) return 'RuPay';
    if (net.includes('amex') || net.includes('american')) return 'AMEX';
    if (net.includes('diner')) return 'Diners Club';
    return networkStr;
  };

  return (
    <div style={{ paddingBottom: '40px', fontFamily: 'Inter, sans-serif' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Credit Card Workspace</h1>
          <p className="page-subtitle">Track credit inventory, analyze reward yields, monitor spend milestones, and optimize transactions.</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          Add Credit Card
        </button>
      </div>

      {/* Top Metrics Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Credit Limit</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--text-primary)' }}>
            {formatCurrency(metrics.totalLimit)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Aggregate purchase capacity</span>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Outstanding Balance</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: '#f87171' }}>
            {formatCurrency(metrics.totalOutstanding)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Utilization: <strong style={{ color: metrics.utilizationRate > 30 ? 'var(--warning-light)' : 'var(--success-light)' }}>{metrics.utilizationRate.toFixed(1)}%</strong>
          </span>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Points Cash Value</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--success-light)' }}>
            {formatCurrency(metrics.totalRewardValue)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Unredeemed rewards inventory</span>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Annual Card Fees Cost</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--warning-light)' }}>
            {formatCurrency(metrics.totalFees)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Recurring yearly maintenance</span>
        </div>
      </div>

      {/* Tabs Switcher Navigation */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '24px', gap: '8px' }}>
        <button 
          className={`tab-btn ${activeSubTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('inventory')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'inventory' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'inventory' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Cards Inventory
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'milestones' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('milestones')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'milestones' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'milestones' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Waives &amp; Spend Milestones
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('calculator')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'calculator' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'calculator' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Merchant Rewards Calculator
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'lounges' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('lounges')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'lounges' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'lounges' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Lounge Access Tracker
        </button>
      </div>

      {/* --- SUB TAB 1: CARDS INVENTORY --- */}
      {activeSubTab === 'inventory' && (
        <div>
          {creditCards.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: '12px', color: 'var(--text-muted)' }}>
              <CreditCard size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <h4>No Credit Cards Registered</h4>
              <p style={{ fontSize: '13px', margin: '4px 0 16px 0' }}>Register your active cards to monitor statement due cycles and compute reward multipliers.</p>
              <button className="btn btn-primary" onClick={handleOpenAdd}>Add Card Now</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '24px' }}>
              {creditCards.map((card: any, idx) => {
                const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
                const limit = Number(meta.credit_limit || card.credit_limit || 0);
                const fee = Number(meta.annual_fee || card.annual_fee || 0);
                const pts = Number(meta.reward_points || card.reward_points || 0);
                const ptVal = Number(meta.point_value || card.point_value || 0.25);
                const theme = getCardTheme(meta.network || 'Visa', idx);
                const isDeleting = deletingCardId === card.id;

                const rewardMonetaryVal = pts * ptVal;
                const netYield = fee > 0 ? rewardMonetaryVal - fee : rewardMonetaryVal;
                const isLowYield = fee > 0 && rewardMonetaryVal < fee;

                return (
                  <div 
                    key={card.id} 
                    className="glass-panel" 
                    style={{ 
                      padding: '24px', 
                      display: 'flex', 
                      flexDirection: 'column', 
                      gap: '16px',
                      background: theme.bg,
                      border: `1px solid ${theme.border}`,
                      boxShadow: `0 15px 30px -10px ${theme.glow}`,
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Simulated Card Content Face */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.6)' }}>
                          {getInstitutionName(card.lender_institution_id)}
                        </span>
                        <h4 style={{ fontSize: '16px', fontWeight: 700, margin: '2px 0 0 0', color: '#fff' }}>{card.name}</h4>
                      </div>
                      <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 800, fontStyle: 'italic', fontFamily: 'monospace' }}>
                        {getNetworkIconText(meta.network || 'Visa')}
                      </div>
                    </div>

                    {/* Chip representation */}
                    <div style={{ width: '38px', height: '28px', background: 'linear-gradient(135deg, #d4af37 0%, #f9e8a2 100%)', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)' }}></div>

                    {/* Limits and Balances */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', margin: '4px 0' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Outstanding Balance</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: card.outstanding > 0 ? '#f87171' : '#cbd5e1' }}>
                          {formatCurrency(card.outstanding)}
                        </div>
                      </div>
                      <div>
                        <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase' }}>Available Limit</span>
                        <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--success-light)' }}>
                          {formatCurrency(Math.max(limit - card.outstanding, 0))}
                        </div>
                      </div>
                    </div>

                    {/* Limit Progress Bar */}
                    <div>
                      <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${Math.min((card.outstanding / (limit || 1)) * 100, 100)}%`, background: card.outstanding / limit > 0.4 ? '#f87171' : '#60a5fa' }}></div>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'rgba(255,255,255,0.4)', marginTop: '4px' }}>
                        <span>Limit: {formatCurrency(limit)}</span>
                        <span>Bill Cycle: {meta.statement_date || 15}th</span>
                      </div>
                    </div>

                    {/* Card Actions / Details Footer */}
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '12px', marginTop: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>Rewards Value (Net Yield)</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: '#fcd34d' }}>
                          {pts.toLocaleString()} pts ({formatCurrency(rewardMonetaryVal)}) / Net: <strong style={{ color: netYield >= 0 ? 'var(--success-light)' : '#f87171' }}>{formatCurrency(netYield)}</strong>
                        </span>
                      </div>

                      {isDeleting ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--danger-light)', fontSize: '11px', fontWeight: 500 }}>Delete?</span>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 8px', fontSize: '10px', minWidth: 'auto', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                            onClick={() => handleDeleteCard(card.id)}
                          >
                            Confirm
                          </button>
                          <button 
                            type="button" 
                            className="btn btn-secondary" 
                            style={{ padding: '2px 8px', fontSize: '10px', minWidth: 'auto' }}
                            onClick={() => setDeletingCardId(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '5px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}
                            onClick={() => handleOpenEdit(card)}
                          >
                            <Edit2 size={11} />
                          </button>
                          <button 
                            className="btn btn-secondary" 
                            style={{ padding: '5px 8px', fontSize: '11px', background: 'rgba(255,255,255,0.05)', color: 'var(--danger-light)', border: '1px solid rgba(255,255,255,0.1)' }}
                            onClick={() => setDeletingCardId(card.id)}
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Offers sub-section in card face */}
                    {meta.offers && meta.offers.length > 0 && (
                      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Active Targeted Offers</span>
                        {meta.offers.map((o: any) => (
                          <div key={o.id} style={{ fontSize: '10px', color: '#67e8f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span>• {o.merchant}: {o.desc}</span>
                            <span style={{ opacity: 0.6, fontSize: '9px' }}>Exp: {o.expiry}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Low Yield warning badge */}
                    {isLowYield && (
                      <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(239, 68, 68, 0.8)', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#fff', fontWeight: 600 }}>
                        <ShieldAlert size={10} />
                        Low Yield Card
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- SUB TAB 2: MILESTONES & WAIVES --- */}
      {activeSubTab === 'milestones' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Spend Milestones and Fee Waivers</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {creditCards.map((card: any) => {
              const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
              const target = Number(meta.milestone_spend_target || 0);
              const current = Number(meta.milestone_spend_current || 0);
              const renewalStr = meta.renewal_date || '';
              
              if (target <= 0) return null;

              const percent = Math.min((current / target) * 100, 100);
              const remaining = Math.max(target - current, 0);
              
              // Calculate daily run rate required
              let dailyRateMsg = 'Milestone reached!';
              let isOverdue = false;
              if (remaining > 0) {
                if (renewalStr) {
                  const today = new Date();
                  const renewal = new Date(renewalStr);
                  const diffTime = renewal.getTime() - today.getTime();
                  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                  if (diffDays > 0) {
                    const daily = remaining / diffDays;
                    dailyRateMsg = `${formatCurrency(daily)}/day for the next ${diffDays} days`;
                  } else {
                    isOverdue = true;
                    dailyRateMsg = 'Card renewal date has passed.';
                  }
                } else {
                  dailyRateMsg = 'Renewal date not configured.';
                }
              }

              return (
                <div key={card.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div>
                      <strong style={{ fontSize: '13px', color: '#fff' }}>{card.name}</strong>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '12px' }}>
                        Renewal: {renewalStr || 'N/A'}
                      </span>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600, color: percent >= 100 ? 'var(--success-light)' : 'var(--text-muted)' }}>
                      {formatCurrency(current)} / {formatCurrency(target)} ({percent.toFixed(0)}%)
                    </span>
                  </div>

                  <div style={{ height: '8px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: percent >= 100 ? 'var(--success)' : 'var(--accent)' }}></div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                      {remaining > 0 ? (
                        <>Remaining: <strong style={{ color: '#fff' }}>{formatCurrency(remaining)}</strong></>
                      ) : (
                        <span style={{ color: 'var(--success-light)', fontWeight: 600 }}>Target waiver met!</span>
                      )}
                    </span>
                    <span style={{ color: isOverdue ? 'var(--danger-light)' : 'var(--text-secondary)' }}>
                      {remaining > 0 && `Required Rate: ${dailyRateMsg}`}
                    </span>
                  </div>

                  {meta.milestone_reward_desc && (
                    <div style={{ marginTop: '10px', display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(252,211,77,0.05)', border: '1px solid rgba(252,211,77,0.1)', padding: '4px 8px', borderRadius: '4px', fontSize: '10px', color: '#fcd34d' }}>
                      <Award size={12} />
                      <span>Reward: {meta.milestone_reward_desc}</span>
                    </div>
                  )}
                </div>
              );
            })}
            {creditCards.every((c: any) => {
              const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
              return !meta.milestone_spend_target;
            }) && (
              <span style={{ color: 'var(--text-muted)', fontSize: '12px', padding: '12px 0' }}>Configure milestone targets inside card settings to monitor waiver run rates.</span>
            )}
          </div>
        </div>
      )}

      {/* --- SUB TAB 3: MERCHANT CALCULATOR --- */}
      {activeSubTab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
          {/* Input Panel */}
          <div className="glass-panel" style={{ padding: '20px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Simulate Transaction</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label className="form-label">Merchant Category</label>
                <select 
                  className="form-input"
                  value={calcCategory}
                  onChange={e => setCalcCategory(e.target.value)}
                >
                  <option value="General">General Retail</option>
                  <option value="Dining">Dining &amp; Food Delivery</option>
                  <option value="Travel">Flights &amp; Hotels</option>
                  <option value="Grocery">Supermarkets &amp; Groceries</option>
                  <option value="Utility">Electricity &amp; Utilities</option>
                  <option value="Fuel">Fuel Station</option>
                  <option value="Online Shopping">Flipkart, Amazon, etc.</option>
                </select>
              </div>

              <div>
                <label className="form-label">Transaction Amount (INR)</label>
                <input 
                  type="number" 
                  className="form-input"
                  value={calcAmount}
                  onChange={e => setCalcAmount(Math.max(Number(e.target.value), 0))}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid rgba(139, 92, 246, 0.1)', padding: '12px', borderRadius: '8px', marginTop: '8px' }}>
                <Calculator size={16} style={{ color: 'var(--accent-light)', flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                  The calculator evaluates card-specific rules to identify the card that maximizes cash-back or reward value.
                </span>
              </div>
            </div>
          </div>

          {/* Recommendations Panel */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Best Cards for this Transaction</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {calculatorRecommendations.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>No active credit cards available for evaluation.</span>
              ) : (
                calculatorRecommendations.map((rec, index) => (
                  <div 
                    key={rec.cardId} 
                    style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center', 
                      padding: '12px 16px', 
                      background: index === 0 ? 'rgba(139,92,246,0.06)' : 'rgba(255,255,255,0.01)', 
                      border: index === 0 ? '1px solid rgba(139,92,246,0.2)' : '1px solid var(--border-glass)', 
                      borderRadius: '10px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ 
                        fontSize: '18px', 
                        fontWeight: 700, 
                        color: index === 0 ? 'var(--accent-light)' : 'var(--text-muted)',
                        width: '24px'
                      }}>
                        #{index + 1}
                      </div>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#fff' }}>{rec.cardName}</strong>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          Reward Rate: {rec.rewardRate}% ({getNetworkIconText(rec.network)})
                        </div>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: index === 0 ? 'var(--success-light)' : '#e2e8f0' }}>
                        + {formatCurrency(rec.estimatedCash)}
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                        Est. Points: {rec.estimatedPoints}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- SUB TAB 4: LOUNGE ACCESS --- */}
      {activeSubTab === 'lounges' && (
        <div className="glass-panel" style={{ padding: '20px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Lounge Access Trackers</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
            {creditCards.map((card: any) => {
              const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
              const domLimit = Number(meta.lounge_visits_limit || 0);
              const domUsed = Number(meta.lounge_visits_used || 0);
              const intLimit = Number(meta.lounge_int_limit || 0);
              const intUsed = Number(meta.lounge_int_used || 0);

              if (domLimit <= 0 && intLimit <= 0) return null;

              const domRemaining = Math.max(domLimit - domUsed, 0);
              const intRemaining = Math.max(intLimit - intUsed, 0);

              return (
                <div key={card.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px' }}>
                  <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#fff', marginBottom: '12px' }}>{card.name}</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {domLimit > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>Domestic Lounges</span>
                          <span>{domRemaining} Left of {domLimit}</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${((domLimit - domRemaining) / domLimit) * 100}%`, background: 'var(--accent)' }}></div>
                        </div>
                      </div>
                    )}

                    {intLimit > 0 && (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          <span>International Lounges</span>
                          <span>{intRemaining} Left of {intLimit}</span>
                        </div>
                        <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${((intLimit - intRemaining) / intLimit) * 100}%`, background: 'var(--success)' }}></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {creditCards.every((c: any) => {
              const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
              return !meta.lounge_visits_limit && !meta.lounge_int_limit;
            }) && (
              <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Configure lounge visit limits to monitor remaining quotas.</span>
            )}
          </div>
        </div>
      )}

      {/* --- ADD/EDIT CARD OVERLAY MODAL --- */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
            <button 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              onClick={() => setModalOpen(false)}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '18px' }}>
              {editingCard ? `Edit Card: ${editingCard.name}` : 'Register New Credit Card'}
            </h3>

            <form onSubmit={handleSaveCard}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Card Name *</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={name}
                    onChange={e => setName(e.target.value)}
                    required 
                    placeholder="Infinia, Eterna, Platinum..."
                  />
                </div>
                <div>
                  <label className="form-label">Issuer Bank *</label>
                  <select 
                    className="form-input"
                    value={lenderId}
                    onChange={e => setLenderId(e.target.value)}
                    required
                  >
                    <option value="">-- Pick Issuer --</option>
                    {institutions.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Credit Limit (INR)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={creditLimit}
                    onChange={e => setCreditLimit(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label">Current Outstanding Balance (INR)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={outstanding}
                    onChange={e => setOutstanding(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Statement Date (Day of Month)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={statementDate}
                    onChange={e => setStatementDate(Number(e.target.value))}
                    min={1} max={31}
                  />
                </div>
                <div>
                  <label className="form-label">Payment Due Date (Day of Month)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={dueDate}
                    onChange={e => setDueDate(Number(e.target.value))}
                    min={1} max={31}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Annual Fee (INR)</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={annualFee}
                    onChange={e => setAnnualFee(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label">Renewal Date</label>
                  <input 
                    type="date" 
                    className="form-input" 
                    value={renewalDate}
                    onChange={e => setRenewalDate(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Reward Points Balance</label>
                  <input 
                    type="number" 
                    className="form-input" 
                    value={rewardPoints}
                    onChange={e => setRewardPoints(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="form-label">Point Value (INR)</label>
                  <input 
                    type="number" 
                    step="0.01"
                    className="form-input" 
                    value={pointValue}
                    onChange={e => setPointValue(Number(e.target.value))}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label className="form-label">Card Network</label>
                  <select 
                    className="form-input"
                    value={network}
                    onChange={e => setNetwork(e.target.value)}
                  >
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="RuPay">RuPay</option>
                    <option value="Amex">Amex</option>
                    <option value="Diners">Diners Club</option>
                  </select>
                </div>
                <div>
                  <label className="form-label">Remarks</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={remarks}
                    onChange={e => setRemarks(e.target.value)}
                    placeholder="Remarks..."
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '14px 0', marginTop: '14px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Lounge &amp; Milestones</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '10px' }}>
                  <div>
                    <label className="form-label">Domestic Lounge Access (Visits/yr)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={loungeVisitsLimit}
                      onChange={e => setLoungeVisitsLimit(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Domestic Lounges Used</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={loungeVisitsUsed}
                      onChange={e => setLoungeVisitsUsed(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '10px' }}>
                  <div>
                    <label className="form-label">Intl Lounge Access (Visits/yr)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={loungeIntLimit}
                      onChange={e => setLoungeIntLimit(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Intl Lounges Used</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={loungeIntUsed}
                      onChange={e => setLoungeIntUsed(Number(e.target.value))}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '10px' }}>
                  <div>
                    <label className="form-label">Milestone Spend Target (INR)</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={milestoneTarget}
                      onChange={e => setMilestoneTarget(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="form-label">Current Milestone Spend</label>
                    <input 
                      type="number" 
                      className="form-input" 
                      value={milestoneCurrent}
                      onChange={e => setMilestoneCurrent(Number(e.target.value))}
                    />
                  </div>
                </div>
                
                <div style={{ marginBottom: '10px' }}>
                  <label className="form-label">Milestone Reward Details</label>
                  <input 
                    type="text" 
                    className="form-input" 
                    value={milestoneDesc}
                    onChange={e => setMilestoneDesc(e.target.value)}
                    placeholder="e.g. Waived Annual Fee, 10k Bonus Points..."
                  />
                </div>
              </div>

              {/* Reward Rules Sub-section */}
              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '14px 0', marginTop: '14px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Card Reward Multiplier Rules</h4>
                
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {rewardRules.map((rule, rIdx) => (
                    <div 
                      key={rIdx} 
                      style={{ 
                        display: 'inline-flex', 
                        alignItems: 'center', 
                        gap: '6px', 
                        padding: '4px 10px', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid var(--border-glass)', 
                        borderRadius: '6px', 
                        fontSize: '11px' 
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>{rule.category}</span>
                      <span style={{ color: 'var(--accent-light)' }}>{rule.ratePct}%</span>
                      {rule.category !== 'General' && (
                        <button 
                          type="button"
                          style={{ background: 'none', border: 'none', color: '#f87171', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                          onClick={() => handleRemoveRule(rule.category)}
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Rule Category</label>
                    <select 
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newRuleCategory}
                      onChange={e => setNewRuleCategory(e.target.value)}
                    >
                      <option value="General">General</option>
                      <option value="Dining">Dining</option>
                      <option value="Travel">Travel</option>
                      <option value="Grocery">Grocery</option>
                      <option value="Utility">Utility</option>
                      <option value="Fuel">Fuel</option>
                      <option value="Online Shopping">Online Shopping</option>
                    </select>
                  </div>

                  <div style={{ flex: 1 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Reward Rate (%)</label>
                    <input 
                      type="number" 
                      step="0.1"
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newRuleRate}
                      onChange={e => setNewRuleRate(Number(e.target.value))}
                    />
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={handleAddRule}
                  >
                    <PlusCircle size={12} /> Add Rule
                  </button>
                </div>
              </div>

              {/* Offers Sub-section */}
              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '14px 0', marginTop: '14px' }}>
                <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '8px' }}>Active Targeted Offers</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                  {offersList.map((offer) => (
                    <div 
                      key={offer.id} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '6px 10px', 
                        background: 'rgba(255,255,255,0.03)', 
                        border: '1px solid var(--border-glass)', 
                        borderRadius: '6px', 
                        fontSize: '11px' 
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: '#67e8f9' }}>{offer.merchant}</span>: {offer.desc} 
                        <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>(Exp: {offer.expiry})</span>
                      </div>
                      <button 
                        type="button"
                        style={{ background: 'none', border: 'none', color: '#f87171', padding: 0, cursor: 'pointer' }}
                        onClick={() => handleRemoveOffer(offer.id)}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1.5 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Merchant</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newOfferMerchant}
                      onChange={e => setNewOfferMerchant(e.target.value)}
                      placeholder="e.g. Amazon"
                    />
                  </div>

                  <div style={{ flex: 2 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Offer Deal</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newOfferDesc}
                      onChange={e => setNewOfferDesc(e.target.value)}
                      placeholder="e.g. 10% instant discount"
                    />
                  </div>

                  <div style={{ flex: 1.2 }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Expiry</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      style={{ padding: '4px 8px', fontSize: '12px' }}
                      value={newOfferExpiry}
                      onChange={e => setNewOfferExpiry(e.target.value)}
                      placeholder="e.g. 31-Jul"
                    />
                  </div>

                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    onClick={handleAddOffer}
                  >
                    <PlusCircle size={12} /> Add Offer
                  </button>
                </div>
              </div>

              {/* Form Submits */}
              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 0 0 0', marginTop: '16px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Card</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
