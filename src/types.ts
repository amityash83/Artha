export interface Category {
  id: number;
  name: string;
  entity_type: 'Asset' | 'Liability' | 'Income' | 'Expense';
  fields_definition: any; // JSON schema or record
  monthly_budget?: number;
}

export interface Institution {
  id: number;
  name: string;
  category_id?: number;
  contact_info?: string;
}

export interface Person {
  id: number;
  name: string;
  role: 'Primary Owner' | 'Spouse' | 'Dependent';
  risk_tolerance: 'Conservative' | 'Moderate' | 'Aggressive';
}

export interface Account {
  id: number;
  name: string;
  institution_id: number;
  institution_name?: string;
  owner_id: number;
  owner_name?: string;
  current_balance: number; // derived server-side from transactions; read-only
  currency: string;
  status: string;
}

export interface InsuranceDetails {
  asset_id?: number;
  policy_type: 'Life' | 'Term' | 'Health' | 'Vehicle';
  policy_number?: string;
  premium: number;
  frequency: string;
  renewal_date?: string;
  sum_assured?: number;
  surrender_value?: number;
  sum_insured?: number;
  claims_made?: number;
  claims_amount?: number;
  idv?: number;
  vehicle_registration?: string;
}

export interface HoldingLot {
  id?: number;
  asset_id?: number;
  purchase_date: string;
  quantity: number;
  price_per_unit: number;
  notes?: string;
}

export interface RentalLedgerEntry {
  id?: number;
  asset_id?: number;
  month: string; // 'YYYY-MM'
  rent_amount: number;
  expenses_amount: number;
  notes?: string;
}

export interface InsuranceClaim {
  id?: number;
  asset_id?: number;
  claim_date: string;
  claim_amount: number;
  status?: string;
  description?: string;
}

export interface InsurancePremiumPayment {
  id?: number;
  asset_id?: number;
  payment_date: string;
  amount: number;
  notes?: string;
}

// Named AttachedDocument (not Document) to avoid colliding with the global DOM Document type.
export interface AttachedDocument {
  id: number;
  ref_type: 'Account' | 'Asset' | 'Liability' | 'Goal';
  ref_id: number;
  file_name: string;
  stored_name: string;
  mime_type?: string;
  size_bytes?: number;
  description?: string;
  uploaded_at: string;
}

export interface CreditCardDetails {
  liability_id?: number;
  credit_limit: number;
  statement_balance: number;
  statement_date?: number;
  due_date?: number;
  annual_fee: number;
  reward_points: number;
  point_value: number;
  renewal_date?: string;
  network?: string;
  lounge_visits_limit?: number;
  lounge_visits_used?: number;
  lounge_int_limit?: number;
  lounge_int_used?: number;
  milestone_spend_target?: number;
  milestone_spend_current?: number;
  milestone_reward_desc?: string;
  remarks?: string;
  base_points?: number;
  base_spend?: number;
  current_statement_spend?: number;
  category_rules_json?: string;
  milestone_rules_json?: string;
  redemption_partners_json?: string;
}

export interface CardVariant {
  id: number;
  name: string;
  issuer: string;
  network: string;
  card_tier: string;
  joining_fee: number;
  annual_fee: number;
  fee_waiver_spend: number;
  base_points: number;
  base_spend: number;
  point_value: number;
  lounge_visits_domestic: number;
  lounge_visits_international: number;
  eligibility_notes?: string;
  category_rules_json: string;
  milestone_rules_json: string;
  redemption_partners_json: string;
  pros_json: string;
  cons_json: string;
  is_seeded: number;
  source_notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CardComparisonResult {
  weights_used: Record<string, number>;
  assumed_annual_spend: number;
  cards: Array<{
    id: number;
    source: 'owned' | 'library';
    label: string;
    issuer: string;
    scores: {
      fee: number;
      reward_value: number;
      lounge_access: number;
      milestone_ease: number;
      simplicity: number;
    };
    weighted_total: number;
    projected_annual_reward_value: number;
    annual_fee: number;
    net_annual_value: number;
  }>;
  winner_id: number | null;
  winner_source: 'owned' | 'library' | null;
  caveats: string[];
}

export interface CreditCardAnnualReview {
  liability_id: number;
  name: string;
  issuer?: string;
  verdict: 'Keep' | 'Close' | 'Downgrade' | 'Upgrade-Candidate';
  worth_the_fee: boolean;
  annual_fee: number;
  reward_value: number;
  net_value: number;
  milestone_on_pace: boolean | null;
  lounge_utilization: number | null;
  reason: string;
  next_review_date: string | null;
  caveat: string;
}

export interface Asset {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  institution_id?: number;
  institution_name?: string;
  owner_id: number;
  owner_name?: string;
  current_value: number;
  invested_amount?: number;
  acquisition_date?: string;
  status?: string;
  risk_level?: 'Low' | 'Medium' | 'High';
  metadata_json?: string;
  insurance_details?: InsuranceDetails;
  holding_lots?: HoldingLot[];
  xirr?: number; // Computed server-side from holding_lots + current_value (Stock/Mutual Fund only)
  rental_ledger?: RentalLedgerEntry[];
  insurance_claims?: InsuranceClaim[];
  premium_payments?: InsurancePremiumPayment[];
  [key: string]: any; // Allows holding dynamic deserialized parameters
}

export interface Liability {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  lender_institution_id?: number;
  lender_name?: string;
  owner_id: number;
  owner_name?: string;
  outstanding: number;
  interest_rate: number;
  emi: number;
  tenure_months?: number;
  status?: string;
  metadata_json?: string;
  liability_kind?: 'loan' | 'revolving_credit';
  credit_card_details?: CreditCardDetails;
  // Computed fields
  remaining_tenure?: number;
  remaining_interest?: number;
  progress?: number;
  [key: string]: any; // Dynamic fields
}

export interface Income {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  amount: number;
  frequency: string;
  status?: string;
}

export interface Expense {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  amount: number;
  frequency: string;
  status?: string;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  target_date?: string;
  priority?: string;
  funding_sources?: any;
  expected_completion?: string;
  // Computed fields
  gap?: number;
  months_remaining?: number;
  status?: string;
}

export interface TaxDeduction {
  id?: number;
  tax_profile_id?: number;
  section: '80C' | '80D' | '80CCD1B' | '80E' | '80G' | '80TTA' | '24B' | 'Other';
  label: string;
  amount: number;
  notes?: string;
}

export interface TaxProfile {
  id: number;
  person_id: number;
  person_name?: string;
  financial_year: string;
  regime: 'Old' | 'New';
  age_band: 'Below60' | '60to80' | 'Above80';
  hra_rent_paid: number;
  hra_basic_salary: number;
  hra_received: number;
  is_metro_city: boolean;
  home_loan_interest_self_occupied: number;
  other_income_reported: number;
  tds_deducted: number;
  advance_tax_paid: number;
  notes?: string;
}

export interface CapitalGainsRealization {
  id: number;
  asset_id: number;
  asset_name?: string;
  transaction_id?: number;
  owner_id: number;
  asset_category: string;
  sale_date: string;
  financial_year: string;
  quantity_sold: number;
  sale_value: number;
  cost_basis: number;
  gain_amount: number;
  gain_type: 'LTCG' | 'STCG';
  tax_rate_applied?: number;
  notes?: string;
}

export interface RegimeResult {
  gross_tax: number;
  rebate_87a: number;
  cess: number;
  total_tax: number;
}

export interface TaxEstimate {
  financial_year: string;
  gross_income: number;
  standard_deduction: number;
  total_80c_deductions: number;
  total_80d_deductions: number;
  other_deductions: number;
  hra_exemption: number;
  taxable_income_old: number;
  taxable_income_new: number;
  capital_gains: { stcg: number; ltcg: number; tax: number };
  old_regime: RegimeResult;
  new_regime: RegimeResult;
  recommended_regime: 'Old' | 'New';
  savings_with_recommended: number;
  estimated_total_tax: number;
  prepaid_taxes: number;
  estimated_refund_or_due: number;
  disclaimer: string;
}

export interface FinancialRule {
  id: number;
  rule_key: string;
  rule_name: string;
  description: string;
  value: number;
  is_enabled: number;
  category: string;
}

export interface Recommendation {
  category: string;
  title: string;
  message: string;
  status: 'success' | 'warning' | 'danger' | 'info';
  action_type: 'prepay' | 'invest' | 'save' | 'info';
  suggested_amount: number;
  rule_key: string | null;
}

export interface AISettings {
  provider: 'none' | 'ollama' | 'openai' | 'anthropic';
  endpoint?: string;
  model?: string;
  max_tokens?: number;
  api_key_set?: boolean;
  updated_at?: string;
}

export interface KnowledgeArticle {
  id: number;
  slug: string;
  title: string;
  topic: string;
  summary: string;
  body: string;
  related_rule_key: string | null;
  tags: string[];
  see_also: string[];
  created_at?: string;
  updated_at?: string;
}

export interface Snapshot {
  id: number;
  month: string;
  net_worth: number;
  liquid_funds: number;
  total_assets: number;
  total_liabilities: number;
  snapshot_data: string;
}

export interface Summary {
  net_worth: number;
  total_assets: number;
  total_debt: number;
  total_liquid: number;
  total_investments: number;
  total_properties: number;
  monthly_change: number;
  yearly_change: number;
}

export interface MonthlyCashFlow {
  id: number;
  month: string;
  net_salary: number;
  other_income: number;
  household_expenses: number;
  emi: number;
  insurance_premium: number;
  investments: number;
  one_time_expenses: number;
  notes: string;
}

export interface InitData {
  summary: Summary;
  accounts: Account[];
  assets: Asset[];
  liabilities: Liability[];
  income: Income[];
  expenses: Expense[];
  goals: Goal[];
  rules: FinancialRule[];
  categories: Category[];
  institutions: Institution[];
  people: Person[];
  tax_profiles: TaxProfile[];
  card_variants: CardVariant[];
  knowledge_articles: KnowledgeArticle[];
  ai_provider: 'none' | 'ollama' | 'openai' | 'anthropic';
  recommendations: Recommendation[];
  cash_flows: MonthlyCashFlow[];
}
