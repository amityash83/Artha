import React, { useState, useMemo } from 'react';
import { 
  CreditCard as CardIcon, Plus, Edit2, Trash2, ShieldAlert,
  X, Sparkles
} from 'lucide-react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';

interface CreditCardsProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface CategoryMultiplierRule {
  category: string;
  multiplier: number;
  isExcluded: boolean;
  monthlyCapPoints?: number;
}

interface MilestoneThresholdRule {
  spendThreshold: number;
  bonusPointsRate: number; // e.g. 35 points instead of 12
  pointsPerSpend: number;  // e.g. per 200 spent
}

interface RedemptionPartnerRatio {
  partnerName: string;
  transferRatio: number; // e.g. 0.8 for 5:4, 0.4 for 5:2
}

// Popular Premium Cards Preset Templates
const PRESETS = [
  {
    name: 'HDFC Infinia (Metal/Visa)',
    issuer: 'HDFC Bank',
    network: 'Visa',
    basePoints: 5,
    baseSpend: 150,
    pointValue: 1.0,
    creditLimit: 1500000,
    annualFee: 12500,
    loungeVisitsLimit: 99, // Unlimited
    loungeIntLimit: 99,
    categoryRules: [
      { category: 'Travel', multiplier: 5, isExcluded: false, monthlyCapPoints: 15000 }, // SmartBuy accelerated
      { category: 'Dining', multiplier: 5, isExcluded: false, monthlyCapPoints: 5000 },
      { category: 'Fuel', multiplier: 0, isExcluded: true },
      { category: 'Rent', multiplier: 0, isExcluded: true },
      { category: 'Utilities', multiplier: 1, isExcluded: false }
    ],
    milestoneRules: [] as MilestoneThresholdRule[],
    partners: [
      { partnerName: 'Club Vistara (1:1)', transferRatio: 1.0 },
      { partnerName: 'KrisFlyer Singapore (1:1)', transferRatio: 1.0 }
    ],
    remarks: 'Premium dining, flights, and travel smartbuy accelerator.'
  },
  {
    name: 'Axis Magnus (Standard)',
    issuer: 'Axis Bank',
    network: 'Visa',
    basePoints: 12,
    baseSpend: 200,
    pointValue: 0.40,
    creditLimit: 1000000,
    annualFee: 12500,
    loungeVisitsLimit: 8,
    loungeIntLimit: 8,
    categoryRules: [
      { category: 'Travel', multiplier: 5, isExcluded: false, monthlyCapPoints: 20000 }, // Travel EDGE
      { category: 'Fuel', multiplier: 0, isExcluded: true },
      { category: 'Rent', multiplier: 0, isExcluded: true },
      { category: 'Insurance', multiplier: 0, isExcluded: true },
      { category: 'Utilities', multiplier: 0, isExcluded: true }
    ],
    milestoneRules: [
      { spendThreshold: 150000, bonusPointsRate: 35, pointsPerSpend: 200 }
    ],
    partners: [
      { partnerName: 'Singapore Airlines (5:2)', transferRatio: 0.4 },
      { partnerName: 'ITC Club (5:2)', transferRatio: 0.4 }
    ],
    remarks: 'Incremental spends beyond 1.5L cross step-up milestone rewards.'
  },
  {
    name: 'SBI Card ELITE',
    issuer: 'SBI',
    network: 'Mastercard',
    basePoints: 2,
    baseSpend: 100,
    pointValue: 0.25,
    creditLimit: 500000,
    annualFee: 4999,
    loungeVisitsLimit: 8,
    loungeIntLimit: 6,
    categoryRules: [
      { category: 'Dining', multiplier: 5, isExcluded: false },
      { category: 'Fuel', multiplier: 0, isExcluded: true }
    ],
    milestoneRules: [] as MilestoneThresholdRule[],
    partners: [] as RedemptionPartnerRatio[],
    remarks: 'Milestone spends release movie vouchers and extra points.'
  }
];

export const CreditCards: React.FC<CreditCardsProps> = ({ data, onRefresh, showToast }) => {
  const { liabilities = [], categories = [], institutions = [] } = data;

  const creditCards = useMemo(() => {
    return liabilities.filter((l: any) => l.category_name === 'Credit Card');
  }, [liabilities]);

  const [activeSubTab, setActiveSubTab] = useState<'inventory' | 'milestones' | 'calculator'>('inventory');
  
  // Modals & Overlay forms
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [deletingCardId, setDeletingCardId] = useState<number | null>(null);
  
  // Overlay Tab navigation
  const [activeModalTab, setActiveModalTab] = useState<'general' | 'rates' | 'categories' | 'milestones' | 'partners'>('general');

  // Form states
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

  // Redesigned reward engine configurator states
  const [basePoints, setBasePoints] = useState(1);
  const [baseSpend, setBaseSpend] = useState(100);
  const [currentStatementSpend, setCurrentStatementSpend] = useState(0);
  const [categoryRules, setCategoryRules] = useState<CategoryMultiplierRule[]>([]);
  const [milestoneRules, setMilestoneRules] = useState<MilestoneThresholdRule[]>([]);
  const [redemptionPartners, setRedemptionPartners] = useState<RedemptionPartnerRatio[]>([]);

  // Rule Builders local states
  const [newCatName, setNewCatName] = useState('General');
  const [newCatMultiplier, setNewCatMultiplier] = useState(2);
  const [newCatExcluded, setNewCatExcluded] = useState(false);
  const [newCatCap, setNewCatCap] = useState('');

  const [newMilestoneSpend, setNewMilestoneSpend] = useState(150000);
  const [newMilestoneRate, setNewMilestoneRate] = useState(35);
  const [newMilestoneSpendBlock, setNewMilestoneSpendBlock] = useState(200);

  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRatio, setNewPartnerRatio] = useState(1.0);

  // Calculator states
  const [calcCategory, setCalcCategory] = useState('General');
  const [calcAmount, setCalcAmount] = useState<number>(25000);
  const [redemptionStrategy, setRedemptionStrategy] = useState<'cash' | 'miles'>('cash');

  const creditCardCategoryId = useMemo(() => {
    const cat = categories.find(c => c.name === 'Credit Card');
    return cat ? cat.id : null;
  }, [categories]);

  // Seeding presets
  const applyPreset = (preset: typeof PRESETS[0]) => {
    setName(preset.name);
    const inst = institutions.find(i => i.name.toLowerCase().includes(preset.issuer.toLowerCase()));
    setLenderId(inst ? inst.id.toString() : '');
    setNetwork(preset.network);
    setBasePoints(preset.basePoints);
    setBaseSpend(preset.baseSpend);
    setPointValue(preset.pointValue);
    setCreditLimit(preset.creditLimit);
    setAnnualFee(preset.annualFee);
    setLoungeVisitsLimit(preset.loungeVisitsLimit);
    setLoungeIntLimit(preset.loungeIntLimit);
    setCategoryRules(preset.categoryRules as CategoryMultiplierRule[]);
    setMilestoneRules(preset.milestoneRules as MilestoneThresholdRule[]);
    setRedemptionPartners(preset.partners as RedemptionPartnerRatio[]);
    setRemarks(preset.remarks);
    if (showToast) showToast(`Preset template applied: ${preset.name}`, "info");
  };

  const handleOpenEdit = (card: any) => {
    setEditingCard(card);
    setName(card.name);
    setLenderId(card.lender_institution_id?.toString() || '');
    setOutstanding(card.outstanding || 0);

    const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
    setCreditLimit(meta.credit_limit || 100000);
    setStatementDate(meta.statement_date || 15);
    setDueDate(meta.due_date || 5);
    setAnnualFee(meta.annual_fee || 0);
    setRenewalDate(meta.renewal_date || '');
    setRewardPoints(meta.reward_points || 0);
    setPointValue(meta.point_value || 0.25);
    setNetwork(meta.network || 'Visa');
    setLoungeVisitsLimit(meta.lounge_visits_limit || 4);
    setLoungeVisitsUsed(meta.lounge_visits_used || 0);
    setLoungeIntLimit(meta.lounge_int_limit || 0);
    setLoungeIntUsed(meta.lounge_int_used || 0);
    setMilestoneTarget(meta.milestone_spend_target || 0);
    setMilestoneCurrent(meta.milestone_spend_current || 0);
    setMilestoneDesc(meta.milestone_reward_desc || '');
    setRemarks(meta.remarks || '');

    // Advanced Rewards structures
    setBasePoints(meta.base_points || 1);
    setBaseSpend(meta.base_spend || 100);
    setCurrentStatementSpend(meta.current_statement_spend || 0);
    
    // Parse category multipliers, milestones and partners from database JSON strings
    try {
      setCategoryRules(meta.category_rules_json ? JSON.parse(meta.category_rules_json) : []);
    } catch { setCategoryRules([]); }
    
    try {
      setMilestoneRules(meta.milestone_rules_json ? JSON.parse(meta.milestone_rules_json) : []);
    } catch { setMilestoneRules([]); }

    try {
      setRedemptionPartners(meta.redemption_partners_json ? JSON.parse(meta.redemption_partners_json) : []);
    } catch { setRedemptionPartners([]); }

    setActiveModalTab('general');
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

    setBasePoints(1);
    setBaseSpend(100);
    setCurrentStatementSpend(0);
    setCategoryRules([]);
    setMilestoneRules([]);
    setRedemptionPartners([]);
    
    setActiveModalTab('general');
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
        if (showToast) showToast("Credit Card deleted successfully", "success");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSaveCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !lenderId || !creditCardCategoryId) {
      if (showToast) showToast("Please select issuer bank and name.", "error");
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
      base_points: Number(basePoints),
      base_spend: Number(baseSpend),
      current_statement_spend: Number(currentStatementSpend),
      category_rules_json: JSON.stringify(categoryRules),
      milestone_rules_json: JSON.stringify(milestoneRules),
      redemption_partners_json: JSON.stringify(redemptionPartners)
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
        if (showToast) showToast(isEdit ? "Card configuration saved" : "Credit Card registered", "success");
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Error saving card settings", "error");
    }
  };

  // Rule additions helpers
  const handleAddCatRule = () => {
    if (categoryRules.some(r => r.category.toLowerCase() === newCatName.toLowerCase())) {
      if (showToast) showToast("Multiplier for category already configured.", "info");
      return;
    }
    setCategoryRules(prev => [...prev, {
      category: newCatName,
      multiplier: Number(newCatMultiplier),
      isExcluded: newCatExcluded,
      monthlyCapPoints: newCatCap ? Number(newCatCap) : undefined
    }]);
    setNewCatCap('');
  };

  const handleAddMilestoneRule = () => {
    setMilestoneRules(prev => [...prev, {
      spendThreshold: Number(newMilestoneSpend),
      bonusPointsRate: Number(newMilestoneRate),
      pointsPerSpend: Number(newMilestoneSpendBlock)
    }]);
  };

  const handleAddPartnerRule = () => {
    if (!newPartnerName) return;
    setRedemptionPartners(prev => [...prev, {
      partnerName: newPartnerName,
      transferRatio: Number(newPartnerRatio)
    }]);
    setNewPartnerName('');
    setNewPartnerRatio(1.0);
  };

  // Summary Metrics calculations
  const metrics = useMemo(() => {
    let totalLimit = 0;
    let totalOutstanding = 0;
    let totalRewardValue = 0;
    let totalFees = 0;

    creditCards.forEach((c: any) => {
      totalOutstanding += c.outstanding || 0;
      const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
      totalLimit += Number(meta.credit_limit || 0);
      
      const pts = Number(meta.reward_points || 0);
      const val = Number(meta.point_value || 0.25);
      totalRewardValue += pts * val;
      
      totalFees += Number(meta.annual_fee || 0);
    });

    return {
      totalLimit,
      totalOutstanding,
      totalRewardValue,
      totalFees,
      utilizationRate: totalLimit > 0 ? (totalOutstanding / totalLimit) * 100 : 0
    };
  }, [creditCards]);

  // --- MATHEMATICAL REWARD CALCULATOR SIMULATOR ENGINE ---
  const calculatorRecommendations = useMemo(() => {
    if (calcAmount <= 0) return [];

    return creditCards.map((c: any) => {
      const meta = c.metadata_json ? (typeof c.metadata_json === 'string' ? JSON.parse(c.metadata_json) : c.metadata_json) : {};
      
      const basePts = Number(meta.base_points || 1);
      const baseSpendAmt = Number(meta.base_spend || 100);
      const ptVal = Number(meta.point_value || 0.25);
      
      // Parse rules
      let catRules: CategoryMultiplierRule[] = [];
      try {
        catRules = meta.category_rules_json ? JSON.parse(meta.category_rules_json) : [];
      } catch { catRules = []; }

      let msRules: MilestoneThresholdRule[] = [];
      try {
        msRules = meta.milestone_rules_json ? JSON.parse(meta.milestone_rules_json) : [];
      } catch { msRules = []; }

      let partnerRatios: RedemptionPartnerRatio[] = [];
      try {
        partnerRatios = meta.redemption_partners_json ? JSON.parse(meta.redemption_partners_json) : [];
      } catch { partnerRatios = []; }

      // 1. Check for Category Exclusions
      const matchingCatRule = catRules.find(r => r.category.toLowerCase() === calcCategory.toLowerCase());
      if (matchingCatRule && matchingCatRule.isExcluded) {
        return {
          cardId: c.id,
          cardName: c.name,
          pointsEarned: 0,
          rewardValueInr: 0,
          effectiveRate: 0,
          details: 'Excluded category (no points earned).',
          network: meta.network || 'Visa'
        };
      }

      // 2. Resolve Multiplier Rate vs Base Rate
      let multiplier = 1.0;
      if (matchingCatRule) {
        multiplier = Number(matchingCatRule.multiplier);
      }

      // 3. Check for Step-up Threshold Milestone Multipliers
      // Uses Statement Spend + simulated spend to see if milestone rate triggers
      const currentStmtSpend = Number(meta.current_statement_spend || 0);
      const projectedSpendTotal = currentStmtSpend + calcAmount;

      let resolvedPointsRate = basePts;
      let resolvedSpendBlock = baseSpendAmt;
      let isMilestoneTriggered = false;

      // Find highest triggered milestone threshold
      const triggeredMs = msRules
        .filter(rule => projectedSpendTotal >= rule.spendThreshold)
        .sort((a, b) => b.spendThreshold - a.spendThreshold)[0];

      if (triggeredMs) {
        resolvedPointsRate = triggeredMs.bonusPointsRate;
        resolvedSpendBlock = triggeredMs.pointsPerSpend;
        isMilestoneTriggered = true;
      }

      // 4. Calculate Raw Reward Points
      // points = (Amount / SpendBlock) * Rate * Multiplier
      let rawPoints = (calcAmount / resolvedSpendBlock) * resolvedPointsRate * multiplier;

      // 5. Apply category monthly caps if configured
      let isCapped = false;
      if (matchingCatRule && matchingCatRule.monthlyCapPoints !== undefined) {
        const cap = Number(matchingCatRule.monthlyCapPoints);
        if (rawPoints > cap) {
          rawPoints = cap;
          isCapped = true;
        }
      }

      rawPoints = Math.round(rawPoints);

      // 6. Calculate True Yield in INR based on Redemption Strategy
      let resolvedValue = rawPoints * ptVal;
      let yieldDetails = `Redeemed at base value of ₹${ptVal} per point.`;

      if (redemptionStrategy === 'miles' && partnerRatios.length > 0) {
        // Find partner with best ratio
        const bestPartner = [...partnerRatios].sort((a, b) => b.transferRatio - a.transferRatio)[0];
        // Standard assumption: 1 Mile = ₹1.0 value
        const effectiveMileValue = 1.0;
        resolvedValue = rawPoints * bestPartner.transferRatio * effectiveMileValue;
        yieldDetails = `Transferred to ${bestPartner.partnerName} at ratio ${bestPartner.transferRatio}x (estimated value of ₹1/mile).`;
      } else if (redemptionStrategy === 'miles') {
        yieldDetails = `No mileage partners configured. Defaulted to statement cash value.`;
      }

      const effectiveRate = calcAmount > 0 ? (resolvedValue / calcAmount) * 100 : 0;

      return {
        cardId: c.id,
        cardName: c.name,
        pointsEarned: rawPoints,
        rewardValueInr: resolvedValue,
        effectiveRate: Number(effectiveRate.toFixed(2)),
        details: `${isMilestoneTriggered ? 'Milestone Step-up Active! ' : ''}${isCapped ? 'Category points capped. ' : ''}${yieldDetails}`,
        network: meta.network || 'Visa'
      };
    }).sort((a, b) => b.rewardValueInr - a.rewardValueInr);
  }, [creditCards, calcCategory, calcAmount, redemptionStrategy]);

  const getNetworkIconText = (networkStr: string) => {
    const net = networkStr.toLowerCase();
    if (net.includes('visa')) return 'VISA';
    if (net.includes('master') || net.includes('mc')) return 'mastercard';
    if (net.includes('rupay')) return 'RuPay';
    if (net.includes('amex') || net.includes('american')) return 'AMEX';
    if (net.includes('diner')) return 'Diners Club';
    return networkStr;
  };

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

  const getCardTheme = (networkStr: string, index: number) => {
    const themes = [
      { bg: 'linear-gradient(135deg, #1e1b4b 0%, #311042 50%, #090514 100%)', border: 'rgba(168, 85, 247, 0.45)', glow: 'rgba(168, 85, 247, 0.2)' },
      { bg: 'linear-gradient(135deg, #090d16 0%, #152238 60%, #020509 100%)', border: 'rgba(56, 189, 248, 0.4)', glow: 'rgba(56, 189, 248, 0.15)' },
      { bg: 'linear-gradient(135deg, #1c1917 0%, #2e2a24 60%, #0c0a09 100%)', border: 'rgba(251, 191, 36, 0.45)', glow: 'rgba(251, 191, 36, 0.15)' },
      { bg: 'linear-gradient(135deg, #022c22 0%, #064e3b 60%, #020617 100%)', border: 'rgba(16, 185, 129, 0.4)', glow: 'rgba(16, 185, 129, 0.15)' }
    ];

    if (networkStr.toLowerCase() === 'amex') {
      return { bg: 'linear-gradient(135deg, #113c4c 0%, #1c5e73 60%, #041217 100%)', border: 'rgba(34, 211, 238, 0.45)', glow: 'rgba(34, 211, 238, 0.2)' };
    }
    if (networkStr.toLowerCase() === 'diners') {
      return { bg: 'linear-gradient(135deg, #2e0854 0%, #171544 70%, #03001e 100%)', border: 'rgba(236, 72, 153, 0.45)', glow: 'rgba(236, 72, 153, 0.2)' };
    }

    return themes[index % themes.length];
  };

  return (
    <div style={{ paddingBottom: '40px', fontFamily: 'Inter, sans-serif' }}>
      {/* Page Header */}
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Credit Card Earning &amp; Optimization Engine</h1>
          <p className="page-subtitle">Simulate incremental spending, evaluate step-up milestone thresholds, and optimize reward yield rates.</p>
        </div>
        <button 
          className="btn btn-primary" 
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px' }}
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          Register Credit Card
        </button>
      </div>

      {/* Top Indicators Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Combined Credit Limit</span>
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
            Combined Utilization: <strong style={{ color: metrics.utilizationRate > 30 ? 'var(--warning-light)' : 'var(--success-light)' }}>{metrics.utilizationRate.toFixed(1)}%</strong>
          </span>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Points Cash Value (INR)</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--success-light)' }}>
            {formatCurrency(metrics.totalRewardValue)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total unredeemed rewards value</span>
        </div>

        <div className="glass-card" style={{ padding: '16px 20px' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Total Annual Fees</span>
          <h3 style={{ fontSize: '22px', fontWeight: 700, margin: '6px 0 2px 0', color: 'var(--warning-light)' }}>
            {formatCurrency(metrics.totalFees)}
          </h3>
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Yearly card maintenance cost</span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '24px', gap: '8px' }}>
        <button 
          className={`tab-btn ${activeSubTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('inventory')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'inventory' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'inventory' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Card Inventory
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'milestones' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('milestones')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'milestones' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'milestones' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Waivers &amp; Milestones
        </button>
        <button 
          className={`tab-btn ${activeSubTab === 'calculator' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('calculator')}
          style={{ padding: '10px 16px', background: 'none', border: 'none', color: activeSubTab === 'calculator' ? '#fff' : 'var(--text-muted)', borderBottom: activeSubTab === 'calculator' ? '2px solid var(--accent)' : 'none', cursor: 'pointer', fontWeight: 600, fontSize: '13px' }}
        >
          Smart Rewards Simulator
        </button>
      </div>

      {/* --- INVENTORY --- */}
      {activeSubTab === 'inventory' && (
        <div>
          {creditCards.length === 0 ? (
            <div style={{ padding: '48px', textAlign: 'center', background: 'rgba(255,255,255,0.01)', border: '1px dashed var(--border-glass)', borderRadius: '12px', color: 'var(--text-muted)' }}>
              <CardIcon size={36} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <h4>No Credit Cards Registered</h4>
              <p style={{ fontSize: '13px', margin: '4px 0 16px 0' }}>Configure card reward rates and step-ups to simulate incremental spending optimizations.</p>
              <button className="btn btn-primary" onClick={handleOpenAdd}>Add Credit Card</button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '24px' }}>
              {creditCards.map((card: any, idx) => {
                const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
                const limit = Number(meta.credit_limit || 0);
                const fee = Number(meta.annual_fee || 0);
                const pts = Number(meta.reward_points || 0);
                const ptVal = Number(meta.point_value || 0.25);
                const theme = getCardTheme(meta.network || 'Visa', idx);
                
                const rewardVal = pts * ptVal;
                const netYield = fee > 0 ? rewardVal - fee : rewardVal;
                const isLowYield = fee > 0 && rewardVal < fee;
                const isDeleting = deletingCardId === card.id;

                const domLimit = Number(meta.lounge_visits_limit || 0);
                const domUsed = Number(meta.lounge_visits_used || 0);
                const intLimit = Number(meta.lounge_int_limit || 0);
                const intUsed = Number(meta.lounge_int_used || 0);

                return (
                  <div key={card.id} style={{ display: 'flex', flexDirection: 'column', borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border-glass)', background: 'rgba(255,255,255,0.015)' }}>
                    
                    {/* SECTION 1: PHYSICAL CREDIT CARD FACE */}
                    <div 
                      style={{ 
                        height: '190px', 
                        background: theme.bg, 
                        borderBottom: `1px solid ${theme.border}`,
                        boxShadow: `inset 0 0 20px rgba(255,255,255,0.05)`,
                        padding: '20px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'space-between',
                        position: 'relative',
                        overflow: 'hidden',
                        transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                        cursor: 'pointer'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = 'translateY(-4px)';
                        e.currentTarget.style.boxShadow = `0 12px 24px -8px ${theme.border}`;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = 'none';
                        e.currentTarget.style.boxShadow = `inset 0 0 20px rgba(255,255,255,0.05)`;
                      }}
                    >
                      {/* Holographic light reflection diagonal overlay */}
                      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.05) 45%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.05) 55%, transparent 70%)', pointerEvents: 'none', transform: 'scale(1.5)' }}></div>

                      {/* Card Top: Bank Name & Network Badge */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1 }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.7)', textShadow: '0 1px 2px rgba(0,0,0,0.5)' }}>
                          {getInstitutionName(card.lender_institution_id)}
                        </span>
                        {isLowYield && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.85)', padding: '2px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', color: '#fff', fontWeight: 700 }}>
                            <ShieldAlert size={10} />
                            Low Yield
                          </div>
                        )}
                      </div>

                      {/* Card Middle: Chip & Contactless logo */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 1, marginTop: '10px' }}>
                        <div style={{ width: '40px', height: '30px', background: 'linear-gradient(135deg, #e5c060 0%, #f9e8a2 50%, #d4af37 100%)', borderRadius: '6px', border: '1px solid rgba(0,0,0,0.2)', position: 'relative', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.3)' }}>
                          <div style={{ position: 'absolute', top: 0, left: '13px', right: '13px', bottom: 0, borderLeft: '1px solid rgba(0,0,0,0.15)', borderRight: '1px solid rgba(0,0,0,0.15)' }}></div>
                          <div style={{ position: 'absolute', top: '10px', left: 0, right: 0, bottom: '10px', borderTop: '1px solid rgba(0,0,0,0.15)', borderBottom: '1px solid rgba(0,0,0,0.15)' }}></div>
                        </div>
                        {/* Spaced card number suffix */}
                        <div style={{ fontSize: '16px', fontWeight: 600, letterSpacing: '2px', color: 'rgba(255,255,255,0.85)', fontFamily: 'monospace', textShadow: '1px 1px 2px rgba(0,0,0,0.6)' }}>
                          •••• &nbsp; •••• &nbsp; •••• &nbsp; {card.name.match(/\d{4}$/) ? card.name.match(/\d{4}$/)[0] : card.id.toString().padStart(4, '0')}
                        </div>
                      </div>

                      {/* Card Bottom: Holder Name & Network Logo */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 1 }}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: '7px', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Cardholder Name</span>
                          <span style={{ fontSize: '13px', fontWeight: 600, color: '#fff', textTransform: 'uppercase', letterSpacing: '1px', textShadow: '0 1px 1px rgba(0,0,0,0.5)' }}>
                            {card.remarks && card.remarks.length < 20 ? card.remarks : "VALUED CUSTOMER"}
                          </span>
                        </div>
                        <span style={{ color: '#fff', fontSize: '13px', fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase', fontFamily: 'monospace', opacity: 0.8, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>
                          {getNetworkIconText(meta.network || 'Visa')}
                        </span>
                      </div>
                    </div>

                    {/* SECTION 2: DETAILED STATS PANEL */}
                    <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '14px', background: 'rgba(255,255,255,0.015)' }}>
                      {/* Outstanding vs Available Limit */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                        <div>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Outstanding</span>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: card.outstanding > 0 ? '#f87171' : 'var(--text-primary)' }}>
                            {formatCurrency(card.outstanding)}
                          </span>
                        </div>
                        <div>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: '2px' }}>Available Limit</span>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--success-light)' }}>
                            {formatCurrency(Math.max(limit - card.outstanding, 0))}
                          </span>
                        </div>
                      </div>

                      {/* Limit Progress Bar */}
                      <div>
                        <div style={{ height: '5px', background: 'rgba(255,255,255,0.04)', borderRadius: '2.5px', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.min((card.outstanding / (limit || 1)) * 100, 100)}%`, background: card.outstanding / limit > 0.4 ? 'var(--danger)' : 'var(--accent)' }}></div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          <span>Total Limit: {formatCurrency(limit)}</span>
                          <span>Bill Cycle Day: {meta.statement_date || 15}th</span>
                        </div>
                      </div>

                      {/* Statement Spend & Statement Day Info */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Current Statement Spend</span>
                        <strong style={{ color: '#60a5fa' }}>{formatCurrency(meta.current_statement_spend || 0)}</strong>
                      </div>

                      {/* Reward Points and Yield Calculation */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '11px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px' }}>
                        <div>
                          <span style={{ color: 'var(--text-secondary)', display: 'block' }}>Reward Points Balance</span>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({pts.toLocaleString()} points @ ₹{ptVal})</span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 600, color: '#fcd34d' }}>{formatCurrency(rewardVal)} Value</span>
                          <span style={{ display: 'block', fontSize: '9px', color: netYield >= 0 ? 'var(--success-light)' : '#f87171' }}>
                            Net Yield: {formatCurrency(netYield)}
                          </span>
                        </div>
                      </div>

                      {/* Lounge Quick Status */}
                      {(domLimit > 0 || intLimit > 0) && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', borderTop: '1px solid var(--border-glass)', paddingTop: '10px', color: 'var(--text-muted)' }}>
                          <span>Lounges Left:</span>
                          <div style={{ display: 'flex', gap: '8px' }}>
                            {domLimit > 0 && <span>Dom: <strong>{Math.max(domLimit - domUsed, 0)}</strong></span>}
                            {intLimit > 0 && <span>Intl: <strong>{Math.max(intLimit - intUsed, 0)}</strong></span>}
                          </div>
                        </div>
                      )}

                      {/* Actions Footer */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-glass)', paddingTop: '12px', marginTop: '4px' }}>
                        {isDeleting ? (
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--danger-light)', fontSize: '11px', fontWeight: 500 }}>Confirm Deletion?</span>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(239,68,68,0.2)', color: '#ef4444' }} onClick={() => handleDeleteCard(card.id)}>Delete</button>
                              <button type="button" className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '11px' }} onClick={() => setDeletingCardId(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: '8px' }}>
                            <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)' }} onClick={() => handleOpenEdit(card)}>
                              <Edit2 size={12} /> Edit
                            </button>
                            <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--danger-light)', background: 'rgba(255,255,255,0.03)' }} onClick={() => setDeletingCardId(card.id)}>
                              <Trash2 size={12} /> Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* --- MILESTONES --- */}
      {activeSubTab === 'milestones' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Spend Milestones list */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Fee Waivers &amp; Milestones</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {creditCards.map((card: any) => {
                const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
                const target = Number(meta.milestone_spend_target || 0);
                const current = Number(meta.milestone_spend_current || 0);
                const renewalStr = meta.renewal_date || '';

                if (target <= 0) return null;

                const percent = Math.min((current / target) * 100, 100);
                const remaining = Math.max(target - current, 0);

                let dailyRateMsg = 'Milestone reached!';
                let isOverdue = false;
                if (remaining > 0) {
                  if (renewalStr) {
                    const today = new Date();
                    const renewal = new Date(renewalStr);
                    const diffDays = Math.ceil((renewal.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    if (diffDays > 0) {
                      dailyRateMsg = `${formatCurrency(remaining / diffDays)}/day for the next ${diffDays} days`;
                    } else {
                      isOverdue = true;
                      dailyRateMsg = 'Renewal date has passed.';
                    }
                  } else {
                    dailyRateMsg = 'Renewal date not set.';
                  }
                }

                return (
                  <div key={card.id} style={{ padding: '16px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <div>
                        <strong style={{ fontSize: '13px', color: '#fff' }}>{card.name}</strong>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginLeft: '8px' }}>Renewal: {renewalStr || 'N/A'}</span>
                      </div>
                      <span style={{ fontSize: '12px', fontWeight: 600 }}>{formatCurrency(current)} / {formatCurrency(target)}</span>
                    </div>

                    <div style={{ height: '8px', background: 'rgba(255,255,255,0.04)', borderRadius: '4px', overflow: 'hidden', marginBottom: '10px' }}>
                      <div style={{ height: '100%', width: `${percent}%`, background: percent >= 100 ? 'var(--success)' : 'var(--accent)' }}></div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {remaining > 0 ? <>Remaining: <strong style={{ color: '#fff' }}>{formatCurrency(remaining)}</strong></> : <strong style={{ color: 'var(--success-light)' }}>Waiver Target Cleared!</strong>}
                      </span>
                      <span style={{ color: isOverdue ? 'var(--danger-light)' : 'var(--text-secondary)' }}>{remaining > 0 && `Required Rate: ${dailyRateMsg}`}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Lounge quota tracker */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Lounge Access Trackers</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {creditCards.map((card: any) => {
                const meta = card.metadata_json ? (typeof card.metadata_json === 'string' ? JSON.parse(card.metadata_json) : card.metadata_json) : {};
                const domLimit = Number(meta.lounge_visits_limit || 0);
                const domUsed = Number(meta.lounge_visits_used || 0);
                const intLimit = Number(meta.lounge_int_limit || 0);
                const intUsed = Number(meta.lounge_int_used || 0);

                if (domLimit <= 0 && intLimit <= 0) return null;

                return (
                  <div key={card.id} style={{ padding: '14px', background: 'rgba(255,255,255,0.01)', border: '1px solid var(--border-glass)', borderRadius: '10px' }}>
                    <strong style={{ fontSize: '13px', color: '#fff', display: 'block', marginBottom: '10px' }}>{card.name}</strong>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {domLimit > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            <span>Domestic lounge visits</span>
                            <span>{Math.max(domLimit - domUsed, 0)} Left of {domLimit}</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(domUsed / domLimit) * 100}%`, background: 'var(--accent)' }}></div>
                          </div>
                        </div>
                      )}

                      {intLimit > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            <span>International lounge visits</span>
                            <span>{Math.max(intLimit - intUsed, 0)} Left of {intLimit}</span>
                          </div>
                          <div style={{ height: '6px', background: 'rgba(255,255,255,0.04)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${(intUsed / intLimit) * 100}%`, background: 'var(--success)' }}></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* --- SMART REWARDS SIMULATOR --- */}
      {activeSubTab === 'calculator' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '24px' }}>
          {/* Simulator Panel Inputs */}
          <div className="glass-panel" style={{ padding: '20px', height: 'fit-content' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Spend Calculator</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="form-label">Merchant Category</label>
                <select 
                  className="form-input"
                  value={calcCategory}
                  onChange={e => setCalcCategory(e.target.value)}
                >
                  <option value="General">General / Retail</option>
                  <option value="Dining">Dining &amp; Food Delivery</option>
                  <option value="Travel">Flights, Hotels &amp; Travel</option>
                  <option value="Grocery">Grocery &amp; Supermarkets</option>
                  <option value="Utility">Electricity &amp; Utilities</option>
                  <option value="Fuel">Fuel Station</option>
                  <option value="Rent">Rent Payment</option>
                  <option value="Online Shopping">Online Shopping (Amazon/Flipkart)</option>
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

              <div>
                <label className="form-label">Redemption Yield Strategy</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`btn ${redemptionStrategy === 'cash' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                    onClick={() => setRedemptionStrategy('cash')}
                  >
                    Cash / Statement Credit
                  </button>
                  <button 
                    className={`btn ${redemptionStrategy === 'miles' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, padding: '8px', fontSize: '12px' }}
                    onClick={() => setRedemptionStrategy('miles')}
                  >
                    Air Miles / Hotels (Best Partner)
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Rank Results */}
          <div className="glass-panel" style={{ padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-primary)' }}>Ranked Best Card Recommendations</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {calculatorRecommendations.length === 0 ? (
                <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Configure credit cards to simulate rewards yield optimizations.</span>
              ) : (
                calculatorRecommendations.map((rec, index) => (
                  <div 
                    key={rec.cardId}
                    style={{ 
                      padding: '14px 18px', 
                      background: index === 0 ? 'rgba(16,185,129,0.06)' : 'rgba(255,255,255,0.01)', 
                      border: index === 0 ? '1px solid rgba(16,185,129,0.25)' : '1px solid var(--border-glass)', 
                      borderRadius: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ fontSize: '18px', fontWeight: 800, color: index === 0 ? '#34d399' : 'var(--text-muted)' }}>
                        #{index + 1}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <strong style={{ fontSize: '13px', color: '#fff' }}>{rec.cardName}</strong>
                          <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>({rec.network})</span>
                        </div>
                        <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: '4px 0 0 0', maxWidth: '340px', lineHeight: '1.4' }}>
                          {rec.details}
                        </p>
                      </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '16px', fontWeight: 700, color: index === 0 ? '#34d399' : '#fff' }}>
                        {formatCurrency(rec.rewardValueInr)}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        Rate: {rec.effectiveRate}% Yield
                      </div>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        +{rec.pointsEarned} Points
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ADD/EDIT TABBED MODAL OVERLAY --- */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}>
            <button 
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              onClick={() => setModalOpen(false)}
            >
              <X size={18} />
            </button>

            <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '18px' }}>
              {editingCard ? `Configure Card: ${editingCard.name}` : 'Register Credit Card'}
            </h3>

            {/* Presets Row (Only show when adding new card) */}
            {!editingCard && (
              <div style={{ background: 'rgba(139,92,246,0.04)', border: '1px solid rgba(139,92,246,0.12)', padding: '12px 16px', borderRadius: '10px', marginBottom: '20px' }}>
                <span style={{ fontSize: '11px', color: '#a78bfa', fontWeight: 600, display: 'block', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Quick Fill Premium Presets
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {PRESETS.map((p, pIdx) => (
                    <button 
                      key={pIdx}
                      type="button" 
                      className="btn btn-secondary" 
                      style={{ padding: '6px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-glass)' }}
                      onClick={() => applyPreset(p)}
                    >
                      <Sparkles size={11} style={{ color: '#fcd34d' }} />
                      {p.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Tabbed Navigation inside configurator modal */}
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-glass)', marginBottom: '18px', gap: '6px' }}>
              {['general', 'rates', 'categories', 'milestones', 'partners'].map((mTab) => (
                <button
                  key={mTab}
                  type="button"
                  onClick={() => setActiveModalTab(mTab as any)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '8px 12px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    color: activeModalTab === mTab ? '#fff' : 'var(--text-muted)',
                    borderBottom: activeModalTab === mTab ? '2px solid var(--accent)' : 'none'
                  }}
                >
                  {mTab.toUpperCase()}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveCard}>
              {/* MODAL TAB 1: GENERAL */}
              {activeModalTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Card Name *</label>
                      <input type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Infinia" />
                    </div>
                    <div>
                      <label className="form-label">Issuer Bank *</label>
                      <select className="form-input" value={lenderId} onChange={e => setLenderId(e.target.value)} required>
                        <option value="">-- Pick Issuer --</option>
                        {institutions.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Credit Limit (INR)</label>
                      <input type="number" className="form-input" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Outstanding Balance (INR)</label>
                      <input type="number" className="form-input" value={outstanding} onChange={e => setOutstanding(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Statement Date (Day of Month)</label>
                      <input type="number" className="form-input" value={statementDate} onChange={e => setStatementDate(Number(e.target.value))} min={1} max={31} />
                    </div>
                    <div>
                      <label className="form-label">Payment Due Date (Day of Month)</label>
                      <input type="number" className="form-input" value={dueDate} onChange={e => setDueDate(Number(e.target.value))} min={1} max={31} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Annual Fee (INR)</label>
                      <input type="number" className="form-input" value={annualFee} onChange={e => setAnnualFee(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Renewal Date</label>
                      <input type="date" className="form-input" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Card Network</label>
                      <select className="form-input" value={network} onChange={e => setNetwork(e.target.value)}>
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="RuPay">RuPay</option>
                        <option value="Amex">Amex</option>
                        <option value="Diners">Diners Club</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label">Remarks</label>
                      <input type="text" className="form-input" value={remarks} onChange={e => setRemarks(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL TAB 2: BASE RATES */}
              {activeModalTab === 'rates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Base Points Earning</label>
                      <input type="number" className="form-input" value={basePoints} onChange={e => setBasePoints(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Per Spend Amount (INR)</label>
                      <input type="number" className="form-input" value={baseSpend} onChange={e => setBaseSpend(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Cash Value per Point (INR)</label>
                      <input type="number" step="0.01" className="form-input" value={pointValue} onChange={e => setPointValue(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Current Statement Spend (INR)</label>
                      <input type="number" className="form-input" value={currentStatementSpend} onChange={e => setCurrentStatementSpend(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label">Current reward points balance</label>
                      <input type="number" className="form-input" value={rewardPoints} onChange={e => setRewardPoints(Number(e.target.value))} />
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL TAB 3: CATEGORY RULES */}
              {activeModalTab === 'categories' && (
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Category Multipliers &amp; Exclusions</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px', maxHeight: '160px', overflowY: 'auto' }}>
                    {categoryRules.map((rule, rIdx) => (
                      <div key={rIdx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '12px' }}>
                        <div>
                          <strong>{rule.category}</strong>: {rule.isExcluded ? <span style={{ color: 'var(--danger-light)' }}>Excluded (0 points)</span> : <span style={{ color: 'var(--accent-light)' }}>{rule.multiplier}x multiplier</span>}
                          {rule.monthlyCapPoints && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>(Cap: {rule.monthlyCapPoints} pts)</span>}
                        </div>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => setCategoryRules(prev => prev.filter((_, i) => i !== rIdx))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Category</label>
                      <select className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatName} onChange={e => setNewCatName(e.target.value)}>
                        <option value="General">General / Retail</option>
                        <option value="Dining">Dining</option>
                        <option value="Travel">Travel</option>
                        <option value="Grocery">Grocery</option>
                        <option value="Utility">Utility</option>
                        <option value="Fuel">Fuel</option>
                        <option value="Rent">Rent</option>
                        <option value="Online Shopping">Online Shopping</option>
                      </select>
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Multiplier</label>
                      <input type="number" step="0.1" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatMultiplier} onChange={e => setNewCatMultiplier(Number(e.target.value))} disabled={newCatExcluded} />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Monthly Points Cap</label>
                      <input type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatCap} onChange={e => setNewCatCap(e.target.value)} placeholder="None" disabled={newCatExcluded} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', height: '100%', paddingBottom: '6px' }}>
                      <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newCatExcluded} onChange={e => setNewCatExcluded(e.target.checked)} />
                        Exclude
                      </label>
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddCatRule}>Add Rule</button>
                  </div>
                </div>
              )}

              {/* MODAL TAB 4: MILESTONES */}
              {activeModalTab === 'milestones' && (
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Threshold Milestone step-ups</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    {milestoneRules.map((rule, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '12px' }}>
                        <span>Cross <strong>{formatCurrency(rule.spendThreshold)}</strong> monthly spend to earn <strong>{rule.bonusPointsRate} pts</strong> per <strong>₹{rule.pointsPerSpend} spent</strong>.</span>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => setMilestoneRules(prev => prev.filter((_, i) => i !== idx))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Spend Threshold (INR)</label>
                      <input type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneSpend} onChange={e => setNewMilestoneSpend(Number(e.target.value))} />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Milestone Points Rate</label>
                      <input type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneRate} onChange={e => setNewMilestoneRate(Number(e.target.value))} />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Spend block (INR)</label>
                      <input type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneSpendBlock} onChange={e => setNewMilestoneSpendBlock(Number(e.target.value))} />
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddMilestoneRule}>Add</button>
                  </div>

                  {/* Lounge limits fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '20px' }}>
                    <div>
                      <label className="form-label">Domestic Lounge Access (Visits/yr)</label>
                      <input type="number" className="form-input" value={loungeVisitsLimit} onChange={e => setLoungeVisitsLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Domestic Lounges Used</label>
                      <input type="number" className="form-input" value={loungeVisitsUsed} onChange={e => setLoungeVisitsUsed(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                    <div>
                      <label className="form-label">Intl Lounge Access (Visits/yr)</label>
                      <input type="number" className="form-input" value={loungeIntLimit} onChange={e => setLoungeIntLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Intl Lounges Used</label>
                      <input type="number" className="form-input" value={loungeIntUsed} onChange={e => setLoungeIntUsed(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                    <div>
                      <label className="form-label">Waiver Spend Target (INR)</label>
                      <input type="number" className="form-input" value={milestoneTarget} onChange={e => setMilestoneTarget(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label">Current Waiver Spend (INR)</label>
                      <input type="number" className="form-input" value={milestoneCurrent} onChange={e => setMilestoneCurrent(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <label className="form-label">Milestone Reward Details</label>
                    <input type="text" className="form-input" value={milestoneDesc} onChange={e => setMilestoneDesc(e.target.value)} placeholder="e.g. Waived Annual Fee, 10k Bonus Points..." />
                  </div>
                </div>
              )}

              {/* MODAL TAB 5: PARTNERS */}
              {activeModalTab === 'partners' && (
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Redemption Partners &amp; Airline Miles</h4>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    {redemptionPartners.map((ratio, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '12px' }}>
                        <span><strong>{ratio.partnerName}</strong>: {ratio.transferRatio} mile/point ratio</span>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => setRedemptionPartners(prev => prev.filter((_, i) => i !== idx))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Partner Airline / Hotel</label>
                      <input type="text" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="e.g. KrisFlyer Singapore" />
                    </div>

                    <div>
                      <label className="form-label" style={{ fontSize: '10px' }}>Conversion Ratio</label>
                      <input type="number" step="0.1" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newPartnerRatio} onChange={e => setNewPartnerRatio(Number(e.target.value))} />
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddPartnerRule}>Add Partner</button>
                  </div>
                </div>
              )}

              {/* Form Actions footer */}
              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 0 0 0', marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save Configuration</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
