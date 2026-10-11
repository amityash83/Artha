import React, { useState, useMemo, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { InitData, CategoryMultiplierRule, MilestoneThresholdRule, RedemptionPartnerRatio, CapRule, SpendBreakdown, CreditCardAnnualReview } from '../types';
import { API_BASE_URL } from '../config';
import { useModalA11y } from '../hooks/useModalA11y';
import { CardLibraryTab } from './creditcards/CardLibraryTab';
import { CompareCardsTab } from './creditcards/CompareCardsTab';
import { CardRow, CardsSummary } from './creditcards/MyCards';

interface CreditCardsProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Open the "Add card" form (from "+ New", Go-to search or the desktop menu). */
  addRequest?: number;
}

const CAP_PERIODS: CapRule['period'][] = ['daily', 'monthly', 'quarterly', 'statement_cycle', 'annual'];

// Reward-rule categories are sourced from data.categories (entity_type 'Expense') so
// the same vocabulary a card charge is tagged with in the Ledger is the one a
// category multiplier rule matches against — one taxonomy, not two independently
// maintained lists. These are cosmetic overrides of the plain category name only,
// falling back to the raw name for any category not listed here.
const CATEGORY_DISPLAY_LABELS: Record<string, string> = {
  'General': 'General / Retail',
  'Dining': 'Dining & Food Delivery',
  'Travel': 'Flights, Hotels & Travel',
  'Grocery': 'Grocery & Supermarkets',
  'Utility': 'Electricity & Utilities',
  'Fuel': 'Fuel Station',
  'Rent': 'Rent Payment',
  'Online Shopping': 'Online Shopping (Amazon/Flipkart)',
};

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

export const CreditCards: React.FC<CreditCardsProps> = ({ data, onRefresh, showToast, addRequest }) => {
  const { liabilities = [], categories = [], institutions = [], people = [] } = data;
  const primaryOwnerId = (people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id;

  const creditCards = useMemo(() => {
    return liabilities.filter((l: any) => l.category_name === 'Credit Card');
  }, [liabilities]);

  // Per-card current-cycle category breakdown, fetched for every owned card
  // (not just the one being edited) so the Calculator's pooled-cap enforcement
  // below has real per-category spend to work from. A card with no logged
  // Spend transactions yet simply has no entry here — pooling for it silently
  // falls back to each category's own individual cap, same as before real
  // spend data existed (see resolve_reward_rate's category_spend_map docstring
  // in backend/calculations.py for the mirrored backend logic).
  const [spendBreakdownsByCard, setSpendBreakdownsByCard] = useState<Record<number, SpendBreakdown>>({});
  useEffect(() => {
    creditCards.forEach((c: any) => {
      fetch(`${API_BASE_URL}/api/liabilities/${c.id}/spend-breakdown`)
        .then(res => res.json())
        .then(bd => setSpendBreakdownsByCard(prev => ({ ...prev, [c.id]: bd })))
        .catch(() => {});
    });
  }, [creditCards]);

  const [view, setView] = useState<'mine' | 'research'>('mine');
  const [researchTab, setResearchTab] = useState<'which' | 'compare' | 'library'>('which');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [comparePreselect, setComparePreselect] = useState<number | null>(null);
  // "Worth the fee?" verdicts, shown inside each card's details.
  const [reviews, setReviews] = useState<CreditCardAnnualReview[]>([]);
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/credit-cards/annual-review`).then((r) => r.json()).then(setReviews).catch(() => setReviews([]));
  }, [creditCards]);
  useEffect(() => { if (addRequest) handleOpenAdd(); }, [addRequest]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCompareAlternatives = (liabilityId: number) => {
    setComparePreselect(liabilityId);
    setView('research');
    setResearchTab('compare');
  };
  
  // Modals & Overlay forms
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any | null>(null);
  const [spendBreakdown, setSpendBreakdown] = useState<SpendBreakdown | null>(null);
  const modalRef = useModalA11y(modalOpen, () => setModalOpen(false));
  
  // Overlay Tab navigation
  const [activeModalTab, setActiveModalTab] = useState<'general' | 'rates' | 'categories' | 'milestones' | 'partners'>('general');

  // Form states
  const [name, setName] = useState('');
  const [lenderId, setLenderId] = useState('');
  const [ownerId, setOwnerId] = useState('');
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
  // Staged additional simultaneous caps (e.g. a daily cap alongside the monthly one
  // above) for the category rule about to be added — see handleAddCatRule.
  const [newCatExtraCaps, setNewCatExtraCaps] = useState<CapRule[]>([]);
  const [newCapPeriod, setNewCapPeriod] = useState<CapRule['period']>('daily');
  const [newCapPoints, setNewCapPoints] = useState('');
  const [newCapGroupLabel, setNewCapGroupLabel] = useState('');

  const [newMilestoneSpend, setNewMilestoneSpend] = useState(150000);
  const [newMilestoneRate, setNewMilestoneRate] = useState(35);
  const [newMilestoneSpendBlock, setNewMilestoneSpendBlock] = useState(200);

  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerRatio, setNewPartnerRatio] = useState(1.0);
  const [newPartnerPointValue, setNewPartnerPointValue] = useState('');

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

  // Card Library variant picker — the real replacement for the hardcoded PRESETS
  // array above. PRESETS stays only as a fallback for the rare case card_variants
  // is empty (e.g. a fresh DB where the seed migration hasn't run for some reason).
  const applyCardVariant = (variant: any) => {
    setName(variant.name);
    const inst = institutions.find(i => i.name.toLowerCase().includes(String(variant.issuer).toLowerCase()));
    setLenderId(inst ? inst.id.toString() : '');
    setNetwork(variant.network);
    setBasePoints(variant.base_points);
    setBaseSpend(variant.base_spend);
    setPointValue(variant.point_value);
    setAnnualFee(variant.annual_fee);
    setLoungeVisitsLimit(variant.lounge_visits_domestic);
    setLoungeIntLimit(variant.lounge_visits_international);
    try {
      setCategoryRules(variant.category_rules_json ? JSON.parse(variant.category_rules_json) : []);
    } catch { setCategoryRules([]); }
    try {
      setMilestoneRules(variant.milestone_rules_json ? JSON.parse(variant.milestone_rules_json) : []);
    } catch { setMilestoneRules([]); }
    try {
      setRedemptionPartners(variant.redemption_partners_json ? JSON.parse(variant.redemption_partners_json) : []);
    } catch { setRedemptionPartners([]); }
    if (variant.eligibility_notes) setRemarks(variant.eligibility_notes);
    if (showToast) showToast(`Card Library entry applied: ${variant.name}`, "info");
  };

  const handleOpenEdit = (card: any) => {
    setEditingCard(card);
    setName(card.name);
    setLenderId(card.lender_institution_id?.toString() || '');
    setOwnerId(card.owner_id?.toString() || '');
    setOutstanding(card.outstanding || 0);

    // credit_card_details columns are flattened directly onto the liability object
    // by /api/init — read them straight off `card`, not from metadata_json.
    setCreditLimit(card.credit_limit || 100000);
    setStatementDate(card.statement_date || 15);
    setDueDate(card.due_date || 5);
    setAnnualFee(card.annual_fee || 0);
    setRenewalDate(card.renewal_date || '');
    setRewardPoints(card.reward_points || 0);
    setPointValue(card.point_value || 0.25);
    setNetwork(card.network || 'Visa');
    setLoungeVisitsLimit(card.lounge_visits_limit || 4);
    setLoungeVisitsUsed(card.lounge_visits_used || 0);
    setLoungeIntLimit(card.lounge_int_limit || 0);
    setLoungeIntUsed(card.lounge_int_used || 0);
    setMilestoneTarget(card.milestone_spend_target || 0);
    setMilestoneCurrent(card.milestone_spend_current || 0);
    setMilestoneDesc(card.milestone_reward_desc || '');
    setRemarks(card.remarks || '');

    // Advanced Rewards structures
    setBasePoints(card.base_points || 1);
    setBaseSpend(card.base_spend || 100);
    // The one marked adjustment transaction's own amount — NOT the raw (now
    // vestigial, unwritten) current_statement_spend column, and not the full
    // derived cycle total either (which also includes other real logged spend).
    setCurrentStatementSpend(card.statement_spend_adjustment || 0);

    // Parse category multipliers, milestones and partners from database JSON strings
    try {
      setCategoryRules(card.category_rules_json ? JSON.parse(card.category_rules_json) : []);
    } catch { setCategoryRules([]); }

    try {
      setMilestoneRules(card.milestone_rules_json ? JSON.parse(card.milestone_rules_json) : []);
    } catch { setMilestoneRules([]); }

    try {
      setRedemptionPartners(card.redemption_partners_json ? JSON.parse(card.redemption_partners_json) : []);
    } catch { setRedemptionPartners([]); }

    setActiveModalTab('general');
    setModalOpen(true);
    setSpendBreakdown(null);
    fetch(`${API_BASE_URL}/api/liabilities/${card.id}/spend-breakdown`)
      .then(res => res.json())
      .then(setSpendBreakdown)
      .catch(() => setSpendBreakdown(null));
  };

  const handleOpenAdd = () => {
    setEditingCard(null);
    setOwnerId(primaryOwnerId?.toString() || '');
    setSpendBreakdown(null);
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
      const res = await fetch(`${API_BASE_URL}/api/entities/liabilities/${id}?with_entries=true`, {
        method: 'DELETE'
      });
      if (res.ok) {
        onRefresh();
        if (showToast) showToast("Card removed", "success");
      } else if (showToast) {
        showToast((await res.json().catch(() => null))?.detail ?? "Couldn't remove the card", "error");
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

    // Base liability fields go through the generic entity route; the reward-engine
    // config (credit limit, statement/due dates, milestones, category multipliers,
    // redemption partners, lounge tracking) is the single source of truth in
    // credit_card_details, written via its own satellite route below — not bundled
    // into liabilities.metadata_json anymore.
    const payload = {
      name,
      category_id: creditCardCategoryId,
      lender_institution_id: Number(lenderId),
      ...(ownerId ? { owner_id: Number(ownerId) } : {}),
      interest_rate: 0.0,
      emi: 0.0,
      outstanding: Number(outstanding),
      tenure_months: 0,
      compounding: 'Monthly',
      tax_benefit: 'None',
    };

    const creditCardDetailsPayload = {
      credit_limit: Number(creditLimit),
      statement_balance: editingCard?.statement_balance || 0,
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
      redemption_partners_json: JSON.stringify(redemptionPartners),
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
        const liabilityId = isEdit ? editingCard.id : (await res.json()).id;
        await fetch(`${API_BASE_URL}/api/liabilities/${liabilityId}/credit-card-details`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(creditCardDetailsPayload),
        });
        setModalOpen(false);
        onRefresh();
        if (showToast) showToast(isEdit ? "Card saved" : "Card added", "success");
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
      monthlyCapPoints: newCatCap ? Number(newCatCap) : undefined,
      caps: newCatExtraCaps.length > 0 ? newCatExtraCaps : undefined
    }]);
    setNewCatCap('');
    setNewCatExtraCaps([]);
  };

  const handleAddExtraCap = () => {
    if (!newCapPoints) return;
    setNewCatExtraCaps(prev => [...prev, {
      capPoints: Number(newCapPoints),
      period: newCapPeriod,
      groupLabel: newCapGroupLabel || undefined
    }]);
    setNewCapPoints('');
    setNewCapGroupLabel('');
  };

  const handleRemoveExtraCap = (idx: number) => {
    setNewCatExtraCaps(prev => prev.filter((_, i) => i !== idx));
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
      transferRatio: Number(newPartnerRatio),
      pointValue: newPartnerPointValue ? Number(newPartnerPointValue) : undefined
    }]);
    setNewPartnerName('');
    setNewPartnerRatio(1.0);
    setNewPartnerPointValue('');
  };

  // --- MATHEMATICAL REWARD CALCULATOR SIMULATOR ENGINE ---
  const calculatorRecommendations = useMemo(() => {
    if (calcAmount <= 0) return [];

    return creditCards.map((c: any) => {
      // credit_card_details columns are flattened directly onto the liability object
      // by /api/init — no metadata_json parsing needed.
      const meta = c;
      
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
      // Uses Statement Spend + simulated spend to see if milestone rate triggers.
      // Prefer the real ledger-derived cycle total once any Spend transaction has
      // ever been logged for this card; current_statement_spend is otherwise the
      // last-known manual figure (0 for a card that's never used either path).
      const currentStmtSpend = Number(meta.has_spend_transactions ? meta.real_cycle_spend_total : (meta.current_statement_spend || 0));
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

      // 5. Apply the tightest of all configured caps (legacy monthlyCapPoints plus any
      // additional simultaneous ceilings in caps[], e.g. a daily cap alongside the
      // monthly one). Mirrors resolve_reward_rate's clamp in calculations.py.
      let isCapped = false;
      if (matchingCatRule) {
        const candidateCaps: number[] = [];
        if (matchingCatRule.monthlyCapPoints !== undefined) candidateCaps.push(Number(matchingCatRule.monthlyCapPoints));
        const pooledCaps: CapRule[] = [];
        (matchingCatRule.caps || []).forEach(capRule => {
          if (capRule.capPoints === undefined) return;
          // A pooled cap still applies as its own ordinary ceiling on this
          // category — pooling below only ADDS an extra, usually-tighter
          // candidate; it never replaces this one.
          candidateCaps.push(Number(capRule.capPoints));
          if (capRule.groupLabel) pooledCaps.push(capRule);
        });

        // Enforce each pooled cap's combined ceiling across every sibling
        // category sharing the same groupLabel, using real per-category spend
        // this cycle (mirrors resolve_reward_rate's category_spend_map logic
        // in backend/calculations.py). Sibling "already earned" points are
        // estimated at THIS card's currently-resolved rate, since milestone
        // step-up is a card-wide threshold, not per-category — there's no
        // separate historical rate to reconstruct.
        if (pooledCaps.length > 0) {
          const categorySpendMap: Record<string, number> = {};
          (spendBreakdownsByCard[c.id]?.by_category || []).forEach(row => {
            categorySpendMap[row.category_name] = row.amount;
          });
          pooledCaps.forEach(poolCap => {
            const groupLabel = poolCap.groupLabel;
            const poolCeiling = Number(poolCap.capPoints);
            let consumed = 0;
            catRules.forEach(sibling => {
              if (sibling.isExcluded) return;
              const sharesGroup = (sibling.caps || []).some(
                sc => sc.groupLabel === groupLabel && sc.capPoints !== undefined
              );
              if (!sharesGroup) return;
              const siblingSpend = categorySpendMap[sibling.category] || 0;
              if (siblingSpend <= 0) return;
              let siblingPoints = (siblingSpend / resolvedSpendBlock) * resolvedPointsRate * Number(sibling.multiplier);
              const siblingIndividualCaps: number[] = [];
              (sibling.caps || []).forEach(sc => {
                if (sc.capPoints !== undefined && sc.groupLabel !== groupLabel) siblingIndividualCaps.push(Number(sc.capPoints));
              });
              if (sibling.monthlyCapPoints !== undefined) siblingIndividualCaps.push(Number(sibling.monthlyCapPoints));
              if (siblingIndividualCaps.length > 0) siblingPoints = Math.min(siblingPoints, Math.min(...siblingIndividualCaps));
              consumed += siblingPoints;
            });
            candidateCaps.push(Math.max(0, poolCeiling - consumed));
          });
        }

        if (candidateCaps.length > 0) {
          const effectiveCap = Math.min(...candidateCaps);
          if (rawPoints > effectiveCap) {
            rawPoints = effectiveCap;
            isCapped = true;
          }
        }
      }

      rawPoints = Math.round(rawPoints);

      // 6. Calculate True Yield in INR based on Redemption Strategy
      let resolvedValue = rawPoints * ptVal;
      let yieldDetails = `Redeemed at base value of ₹${ptVal} per point.`;

      if (redemptionStrategy === 'miles' && partnerRatios.length > 0) {
        // Best route by actual INR yield (ratio * per-point value), not ratio alone —
        // a high-ratio route to a low-value point isn't necessarily the best deal.
        const bestPartner = [...partnerRatios].sort(
          (a, b) => (b.transferRatio * (b.pointValue ?? 1.0)) - (a.transferRatio * (a.pointValue ?? 1.0))
        )[0];
        const effectiveMileValue = bestPartner.pointValue ?? 1.0;
        resolvedValue = rawPoints * bestPartner.transferRatio * effectiveMileValue;
        yieldDetails = `Transferred to ${bestPartner.partnerName} at ratio ${bestPartner.transferRatio}x (₹${effectiveMileValue}/point estimated value).`;
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
  }, [creditCards, calcCategory, calcAmount, redemptionStrategy, spendBreakdownsByCard]);

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

  const bankName = (card: any) => card.lender_name || getInstitutionName(card.lender_institution_id);
  const reviewFor = (id: number) => reviews.find((r) => r.liability_id === id);

  return (
    <div style={{ paddingBottom: '40px' }}>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 className="page-title">Credit Cards</h1>
          <p className="page-subtitle">What you owe on each card, the rewards you hold, and which card earns the most for a purchase.</p>
        </div>
        <button className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px' }} onClick={handleOpenAdd}>
          <Plus size={15} /> Add card
        </button>
      </div>

      <div role="tablist" aria-label="Credit card views" className="cc-views">
        {([['mine', 'My cards'], ['research', 'Find the best card']] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id} className="cc-view" onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === 'mine' && (
        creditCards.length === 0 ? (
          <div className="glass-panel cc-empty">
            <h3>No cards yet</h3>
            <p>Add a card to track what you owe, when it's due, its rewards and whether it's worth its annual fee.</p>
            <button className="btn btn-primary" onClick={handleOpenAdd}>Add card</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <CardsSummary cards={creditCards} />
            {creditCards.map((card: any) => (
              <CardRow key={card.id} card={card} bank={bankName(card)} review={reviewFor(card.id)}
                expanded={expandedId === card.id || creditCards.length === 1}
                onToggle={() => setExpandedId(expandedId === card.id ? null : card.id)}
                onEdit={() => handleOpenEdit(card)}
                onRemove={() => handleDeleteCard(card.id)}
                onCompare={() => handleCompareAlternatives(card.id)} />
            ))}
          </div>
        )
      )}

      {view === 'research' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div role="tablist" aria-label="Find the best card" className="cc-subviews">
            {([['which', 'Which card to use?'], ['compare', 'Compare cards'], ['library', 'Card library']] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={researchTab === id} className="cc-subview" onClick={() => setResearchTab(id)}>{label}</button>
            ))}
          </div>

          {researchTab === 'which' && (
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p className="cc-note" style={{ margin: 0 }}>Enter a purchase to see which of your cards earns the most for it, using each card's reward rules, caps and milestones.</p>
              <div className="cc-which-inputs">
                <label>
                  <span className="cc-label">Amount</span>
                  <span className="settings-affix"><span aria-hidden>₹</span>
                    <input aria-label="Purchase amount" inputMode="decimal" value={calcAmount || ''} onChange={(e) => setCalcAmount(Math.max(parseFloat(e.target.value.replace(/,/g, '')) || 0, 0))} />
                  </span>
                </label>
                <label>
                  <span className="cc-label">Where</span>
                  <select className="settings-input" value={calcCategory} onChange={(e) => setCalcCategory(e.target.value)} aria-label="Merchant type">
                    {categories.filter((c) => c.entity_type === 'Expense').map((c) => (
                      <option key={c.id} value={c.name}>{CATEGORY_DISPLAY_LABELS[c.name] || c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="cc-label">Value points as</span>
                  <select className="settings-input" value={redemptionStrategy} onChange={(e) => setRedemptionStrategy(e.target.value as 'cash' | 'miles')} aria-label="How you redeem points">
                    <option value="cash">Cash or statement credit</option>
                    <option value="miles">Air miles or hotel points (best partner)</option>
                  </select>
                </label>
              </div>
              {calculatorRecommendations.length === 0 ? (
                <p className="cc-note">Add a card first.</p>
              ) : (
                <ol className="cc-ranking">
                  {calculatorRecommendations.map((rec, i) => (
                    <li key={rec.cardId} className={i === 0 ? 'cc-best' : undefined}>
                      <span className="cc-rank">{i + 1}</span>
                      <span className="cc-rank-text">
                        <strong>{rec.cardName}</strong>
                        <span>{rec.details}</span>
                      </span>
                      <span className="cc-rank-value">
                        <strong>{formatCurrency(rec.rewardValueInr)}</strong>
                        <span>{rec.effectiveRate}% back · {rec.pointsEarned.toLocaleString('en-IN')} points</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
          {researchTab === 'compare' && (
            <CompareCardsTab ownedCards={creditCards} cardVariants={data.card_variants || []} showToast={showToast} preselectLiabilityId={comparePreselect} />
          )}
          {researchTab === 'library' && (
            <CardLibraryTab cardVariants={data.card_variants || []} onRefresh={onRefresh} showToast={showToast} />
          )}
        </div>
      )}

      {/* --- ADD/EDIT TABBED MODAL OVERLAY --- */}
      {modalOpen && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000, padding: '20px' }}>
          <div
            className="glass-panel cc-form"
            style={{ width: '100%', maxWidth: '680px', maxHeight: '90vh', overflowY: 'auto', padding: '24px', position: 'relative' }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="card-config-title"
            tabIndex={-1}
          >
            <button
              style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              onClick={() => setModalOpen(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>

            <h3 id="card-config-title" style={{ fontSize: '16px', fontWeight: 600, color: '#fff', marginBottom: '18px' }}>
              {editingCard ? `Edit ${editingCard.name}` : 'Add a credit card'}
            </h3>

            {/* Start from the Card Library (new cards only) */}
            {!editingCard && (
              <label className="cc-quickfill">
                <span className="cc-label">Start from the Card Library (optional)</span>
                <select className="settings-input" value="" aria-label="Start from the Card Library"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) return;
                    if (v.startsWith('preset-')) applyPreset(PRESETS[Number(v.slice(7))]);
                    else { const found = (data.card_variants || []).find((x: any) => String(x.id) === v); if (found) applyCardVariant(found); }
                  }}>
                  <option value="">Choose a card to fill in its published rates and fees…</option>
                  {(data.card_variants || []).map((v: any) => <option key={v.id} value={String(v.id)}>{v.name}</option>)}
                  {(!data.card_variants || data.card_variants.length === 0) && PRESETS.map((pr, k) => <option key={pr.name} value={`preset-${k}`}>{pr.name}</option>)}
                </select>
              </label>
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
                  {({ general: 'Basics', rates: 'Reward rate', categories: 'Spend categories', milestones: 'Milestones & lounges', partners: 'Transfer partners' } as Record<string, string>)[mTab]}
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveCard}>
              {/* MODAL TAB 1: GENERAL */}
              {activeModalTab === 'general' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-name">Card Name *</label>
                      <input id="cc-name" type="text" className="form-input" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Infinia" />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-lender">Issuer Bank *</label>
                      <select id="cc-lender" className="form-input" value={lenderId} onChange={e => setLenderId(e.target.value)} required>
                        <option value="">-- Pick Issuer --</option>
                        {[...institutions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {people.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <div>
                        <label className="form-label" htmlFor="cc-owner">Cardholder</label>
                        <select id="cc-owner" className="form-input" value={ownerId} onChange={e => setOwnerId(e.target.value)}>
                          {people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role})</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-credit-limit">Credit Limit (INR)</label>
                      <input id="cc-credit-limit" type="number" className="form-input" value={creditLimit} onChange={e => setCreditLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-outstanding">Outstanding Balance (INR)</label>
                      <input id="cc-outstanding" type="number" className="form-input" value={outstanding} onChange={e => setOutstanding(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-statement-date">Statement Date (Day of Month)</label>
                      <input id="cc-statement-date" type="number" className="form-input" value={statementDate} onChange={e => setStatementDate(Number(e.target.value))} min={1} max={31} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-due-date">Payment Due Date (Day of Month)</label>
                      <input id="cc-due-date" type="number" className="form-input" value={dueDate} onChange={e => setDueDate(Number(e.target.value))} min={1} max={31} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-annual-fee">Annual Fee (INR)</label>
                      <input id="cc-annual-fee" type="number" className="form-input" value={annualFee} onChange={e => setAnnualFee(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-renewal-date">Renewal Date</label>
                      <input id="cc-renewal-date" type="date" className="form-input" value={renewalDate} onChange={e => setRenewalDate(e.target.value)} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-network">Card Network</label>
                      <select id="cc-network" className="form-input" value={network} onChange={e => setNetwork(e.target.value)}>
                        <option value="Visa">Visa</option>
                        <option value="Mastercard">Mastercard</option>
                        <option value="RuPay">RuPay</option>
                        <option value="Amex">Amex</option>
                        <option value="Diners">Diners Club</option>
                      </select>
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-remarks">Remarks</label>
                      <input id="cc-remarks" type="text" className="form-input" value={remarks} onChange={e => setRemarks(e.target.value)} />
                    </div>
                  </div>
                </div>
              )}

              {/* MODAL TAB 2: BASE RATES */}
              {activeModalTab === 'rates' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-base-points">Base Points Earning</label>
                      <input id="cc-base-points" type="number" className="form-input" value={basePoints} onChange={e => setBasePoints(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-base-spend">Per Spend Amount (INR)</label>
                      <input id="cc-base-spend" type="number" className="form-input" value={baseSpend} onChange={e => setBaseSpend(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-point-value">Cash Value per Point (INR)</label>
                      <input id="cc-point-value" type="number" step="0.01" className="form-input" value={pointValue} onChange={e => setPointValue(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-current-statement-spend">Statement Spend Adjustment (INR)</label>
                      <input id="cc-current-statement-spend" type="number" className="form-input" value={currentStatementSpend} onChange={e => setCurrentStatementSpend(Number(e.target.value))} />
                      <p style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        For spend you haven't logged individually in the Transactions Ledger this cycle —
                        combined with any logged Card Spend transactions for the total below. This only
                        affects the spend total/reward calculations, never Outstanding Balance (the General
                        tab) — update that separately if this reflects new debt.
                      </p>
                    </div>
                  </div>

                  {editingCard && (
                    <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '8px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        Current cycle ({editingCard.cycle_start} to {editingCard.cycle_end}), from the ledger:
                      </span>
                      <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(editingCard.real_cycle_spend_total || 0)}
                      </span>
                      {spendBreakdown && spendBreakdown.by_category.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '6px' }}>
                          {spendBreakdown.by_category.map((row, idx) => (
                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                              <span>{row.category_name}</span>
                              <span>{new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(row.amount)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-reward-points">Current reward points balance</label>
                      <input id="cc-reward-points" type="number" className="form-input" value={rewardPoints} onChange={e => setRewardPoints(Number(e.target.value))} />
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
                          {rule.monthlyCapPoints && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>(Cap: {rule.monthlyCapPoints} pts/mo)</span>}
                          {(rule.caps || []).map((cap, cIdx) => (
                            <span key={cIdx} style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                              (Cap: {cap.capPoints} pts/{cap.period}{cap.groupLabel ? `, ${cap.groupLabel}` : ''})
                            </span>
                          ))}
                        </div>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => setCategoryRules(prev => prev.filter((_, i) => i !== rIdx))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-new-cat-name" style={{ fontSize: '10px' }}>Category</label>
                      <select id="cc-new-cat-name" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatName} onChange={e => setNewCatName(e.target.value)}>
                        {categories.filter(c => c.entity_type === 'Expense').map(c => (
                          <option key={c.id} value={c.name}>{CATEGORY_DISPLAY_LABELS[c.name] || c.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-cat-multiplier" style={{ fontSize: '10px' }}>Multiplier</label>
                      <input id="cc-new-cat-multiplier" type="number" step="0.1" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatMultiplier} onChange={e => setNewCatMultiplier(Number(e.target.value))} disabled={newCatExcluded} />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-cat-cap" style={{ fontSize: '10px' }}>Monthly Points Cap</label>
                      <input id="cc-new-cat-cap" type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCatCap} onChange={e => setNewCatCap(e.target.value)} placeholder="None" disabled={newCatExcluded} />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', justifyContent: 'center', height: '100%', paddingBottom: '6px' }}>
                      <label style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                        <input type="checkbox" checked={newCatExcluded} onChange={e => setNewCatExcluded(e.target.checked)} />
                        Exclude
                      </label>
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddCatRule}>Add Rule</button>
                  </div>

                  {/* Additional simultaneous caps for the rule about to be added above —
                      e.g. a daily cap alongside the Monthly Points Cap, or a cap shared/
                      pooled with other categories (label only, not cross-category enforced;
                      Artha has no per-category spend ledger to enforce a shared pool against). */}
                  <div style={{ marginTop: '10px', padding: '12px', borderRadius: '8px', border: '1px dashed var(--border-glass)' }}>
                    <label className="form-label" style={{ fontSize: '10px' }}>Additional caps for the rule above (optional — e.g. a daily cap)</label>
                    {newCatExtraCaps.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                        {newCatExtraCaps.map((cap, idx) => (
                          <span key={idx} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', padding: '3px 8px', background: 'rgba(255,255,255,0.03)', borderRadius: '10px' }}>
                            {cap.capPoints} pts/{cap.period}{cap.groupLabel ? ` (${cap.groupLabel})` : ''}
                            <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', display: 'flex' }} onClick={() => handleRemoveExtraCap(idx)}><X size={10} /></button>
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1.2fr auto', gap: '8px', alignItems: 'flex-end' }}>
                      <div>
                        <label className="form-label" htmlFor="cc-new-cap-period" style={{ fontSize: '10px' }}>Period</label>
                        <select id="cc-new-cap-period" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCapPeriod} onChange={e => setNewCapPeriod(e.target.value as CapRule['period'])}>
                          {CAP_PERIODS.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="form-label" htmlFor="cc-new-cap-points" style={{ fontSize: '10px' }}>Points cap</label>
                        <input id="cc-new-cap-points" type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCapPoints} onChange={e => setNewCapPoints(e.target.value)} placeholder="e.g. 15000" />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="cc-new-cap-group" style={{ fontSize: '10px' }}>Shared pool label (optional)</label>
                        <input id="cc-new-cap-group" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newCapGroupLabel} onChange={e => setNewCapGroupLabel(e.target.value)} placeholder="e.g. Accelerated Rewards" />
                      </div>
                      <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddExtraCap}>Add Cap</button>
                    </div>
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
                      <label className="form-label" htmlFor="cc-new-milestone-spend" style={{ fontSize: '10px' }}>Spend Threshold (INR)</label>
                      <input id="cc-new-milestone-spend" type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneSpend} onChange={e => setNewMilestoneSpend(Number(e.target.value))} />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-milestone-rate" style={{ fontSize: '10px' }}>Milestone Points Rate</label>
                      <input id="cc-new-milestone-rate" type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneRate} onChange={e => setNewMilestoneRate(Number(e.target.value))} />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-milestone-block" style={{ fontSize: '10px' }}>Spend block (INR)</label>
                      <input id="cc-new-milestone-block" type="number" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newMilestoneSpendBlock} onChange={e => setNewMilestoneSpendBlock(Number(e.target.value))} />
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddMilestoneRule}>Add</button>
                  </div>

                  {/* Lounge limits fields */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '20px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-lounge-visits-limit">Domestic Lounge Access (Visits/yr)</label>
                      <input id="cc-lounge-visits-limit" type="number" className="form-input" value={loungeVisitsLimit} onChange={e => setLoungeVisitsLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-lounge-visits-used">Domestic Lounges Used</label>
                      <input id="cc-lounge-visits-used" type="number" className="form-input" value={loungeVisitsUsed} onChange={e => setLoungeVisitsUsed(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-lounge-int-limit">Intl Lounge Access (Visits/yr)</label>
                      <input id="cc-lounge-int-limit" type="number" className="form-input" value={loungeIntLimit} onChange={e => setLoungeIntLimit(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-lounge-int-used">Intl Lounges Used</label>
                      <input id="cc-lounge-int-used" type="number" className="form-input" value={loungeIntUsed} onChange={e => setLoungeIntUsed(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginTop: '10px' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-milestone-target">Waiver Spend Target (INR)</label>
                      <input id="cc-milestone-target" type="number" className="form-input" value={milestoneTarget} onChange={e => setMilestoneTarget(Number(e.target.value))} />
                    </div>
                    <div>
                      <label className="form-label" htmlFor="cc-milestone-current">Current Waiver Spend (INR)</label>
                      <input id="cc-milestone-current" type="number" className="form-input" value={milestoneCurrent} onChange={e => setMilestoneCurrent(Number(e.target.value))} />
                    </div>
                  </div>

                  <div style={{ marginTop: '10px' }}>
                    <label className="form-label" htmlFor="cc-milestone-desc">Milestone Reward Details</label>
                    <input id="cc-milestone-desc" type="text" className="form-input" value={milestoneDesc} onChange={e => setMilestoneDesc(e.target.value)} placeholder="e.g. Waived Annual Fee, 10k Bonus Points..." />
                  </div>
                </div>
              )}

              {/* MODAL TAB 5: PARTNERS */}
              {activeModalTab === 'partners' && (
                <div>
                  <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', marginBottom: '10px' }}>Redemption Routes &amp; Airline Miles</h4>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Covers external mile-transfer partners as well as the bank's own in-house channels
                    (e.g. a travel portal or cashback) — use a ratio of 1 for a channel with no external conversion.
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                    {redemptionPartners.map((ratio, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-glass)', borderRadius: '6px', fontSize: '12px' }}>
                        <span>
                          <strong>{ratio.partnerName}</strong>: {ratio.transferRatio} mile/point ratio
                          {ratio.pointValue !== undefined && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>(₹{ratio.pointValue}/point)</span>}
                        </span>
                        <button type="button" style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer' }} onClick={() => setRedemptionPartners(prev => prev.filter((_, i) => i !== idx))}><X size={12} /></button>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr auto', gap: '10px', alignItems: 'flex-end', background: 'rgba(255,255,255,0.01)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-glass)' }}>
                    <div>
                      <label className="form-label" htmlFor="cc-new-partner-name" style={{ fontSize: '10px' }}>Redemption Route</label>
                      <input id="cc-new-partner-name" type="text" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} placeholder="e.g. KrisFlyer Singapore, Travel Portal, Cashback" />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-partner-ratio" style={{ fontSize: '10px' }}>Conversion Ratio</label>
                      <input id="cc-new-partner-ratio" type="number" step="0.1" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newPartnerRatio} onChange={e => setNewPartnerRatio(Number(e.target.value))} />
                    </div>

                    <div>
                      <label className="form-label" htmlFor="cc-new-partner-value" style={{ fontSize: '10px' }}>Point Value (₹, optional)</label>
                      <input id="cc-new-partner-value" type="number" step="0.01" className="form-input" style={{ fontSize: '11px', padding: '4px' }} value={newPartnerPointValue} onChange={e => setNewPartnerPointValue(e.target.value)} placeholder="Default ₹1" />
                    </div>

                    <button type="button" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: '11px' }} onClick={handleAddPartnerRule}>Add Route</button>
                  </div>
                </div>
              )}

              {/* Form Actions footer */}
              <div style={{ borderTop: '1px solid var(--border-glass)', padding: '16px 0 0 0', marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">Save card</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
