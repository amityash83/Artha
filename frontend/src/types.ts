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

// Shapes stored (JSON-stringified) inside CreditCardDetails/CardVariant's
// category_rules_json / milestone_rules_json / redemption_partners_json fields.
// Shared between a user's own cards and Card Library reference variants.
export interface CapRule {
  capPoints: number;
  period: 'daily' | 'monthly' | 'quarterly' | 'statement_cycle' | 'annual';
  // Documents a bank's stated shared/pooled cap (e.g. "part of the 15,000/mo
  // Accelerated Rewards pool") — every CapRule across a card's category_rules
  // sharing the same groupLabel string draws from one combined ceiling.
  // Enforced by CreditCards.tsx's Calculator against real per-category spend
  // this cycle (see spendBreakdownsByCard); if no real spend has been logged
  // yet for a sibling category, that category simply can't have consumed any
  // of the pool, so this falls back to each category's own individual cap.
  groupLabel?: string;
}

export interface CategoryMultiplierRule {
  category: string;
  multiplier: number;
  isExcluded: boolean;
  monthlyCapPoints?: number;
  // Additional simultaneous ceilings (e.g. a daily cap alongside the monthly one) —
  // resolve_reward_rate applies the tightest of monthlyCapPoints + every caps[].capPoints.
  caps?: CapRule[];
}

export interface MilestoneThresholdRule {
  spendThreshold: number;
  bonusPointsRate: number; // e.g. 35 points instead of 12
  pointsPerSpend: number;  // e.g. per 200 spent
}

export interface RedemptionPartnerRatio {
  partnerName: string; // shown as "Redemption Route" — covers external mile-transfer
                       // partners and in-house channels (Travel Portal, Cashback) alike
  transferRatio: number; // e.g. 0.8 for 5:4, 0.4 for 5:2; 1.0 for an in-house/no-conversion route
  pointValue?: number;   // INR value per point via this route; falls back to 1.0 if unset
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
  // Derived live from the transactions ledger (Credit Card liabilities only) —
  // see compute_real_cycle_spend_total in main.py. has_spend_transactions gates
  // the manual-vs-derived fallback: a card with a manually-entered
  // current_statement_spend but no logged Spend transactions keeps showing the
  // manual figure instead of silently dropping to 0.
  real_cycle_spend_total?: number;
  has_spend_transactions?: boolean;
  cycle_start?: string;
  cycle_end?: string;
  statement_spend_adjustment?: number;
  [key: string]: any; // Dynamic fields
}

export interface SpendBreakdownCategory {
  category_name: string;
  amount: number;
}

export interface SpendBreakdown {
  cycle_start: string;
  cycle_end: string;
  total: number;
  by_category: SpendBreakdownCategory[];
}

export interface Income {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  amount: number; // gross, per period
  frequency: string;
  status?: string;
  taxable?: number;
  owner_id?: number;
  owner_name?: string;
  net_amount?: number; // Salary only: take-home per period (a Salary category custom field)
}

export interface Expense {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  amount: number;
  frequency: string;
  status?: string;
  owner_id?: number;
  owner_name?: string;
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
  surcharge: number;
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

// ---------------------------------------------------------------------------
// Tax Planner (backend/tax/). Engine inputs are deliberately loosely typed: their
// shape is owned by backend/tax/engine.py's DEFAULT_INPUTS and described to the UI
// by /api/tax/input-metadata, so new fields don't need a type change here.
// ---------------------------------------------------------------------------

export type TaxRegimeKey = 'old' | 'new';
export type TaxVerification = 'verified' | 'secondary_source' | 'unverified' | 'assumption' | 'user_entered';

export interface TaxPlannerInputs {
  profile: {
    age: number;
    residential_status: 'resident' | 'rnor' | 'non_resident';
    employer_type: 'private' | 'government';
    city: string | null;
    metro: boolean | null;
    selected_regime: TaxRegimeKey | null;
  };
  salary: Record<string, number>;
  salary_monthly: Record<string, number> | null;
  monthly: TaxMonthlyInput | null;
  employer_contributions: Record<string, number>;
  payroll_deductions: Record<string, number>;
  hra: { rent_paid_monthly: number; months_rented: number };
  exempt_allowances: Record<string, number>;
  other_income: Record<string, number>;
  capital_gains: Record<string, number>;
  deductions: { '80C': Record<string, number> } & Record<string, number | boolean | Record<string, number>>;
  prepaid: { tds: number; advance_tax: number };
  // Dated advance-tax payments; when any are entered, their total is prepaid.advance_tax.
  advance_tax_payments?: TaxAdvancePayment[] | null;
}

export interface TaxAdvancePayment { date: string; amount: number }

export interface TaxAdvanceInstalment {
  due_date: string;
  cumulative_pct: number;
  cumulative_due: number;
  paid_by_due_date: number;
  still_to_pay: number;
  status: 'met' | 'safe_harbour' | 'short' | 'upcoming' | 'not_required';
  deferment_interest: number;
  interest_if_unpaid: number;
}

export interface TaxAdvanceSchedule {
  financial_year: string;
  regime: TaxRegimeKey;
  total_tax: number;
  return_due_date: string | null;
  available: boolean;
  required: boolean;
  reason: string;
  expected_tds?: number;
  tds_basis?: 'salary_only' | 'entered';
  advance_tax_liability?: number;
  threshold?: number;
  payments?: TaxAdvancePayment[];
  paid_total?: number;
  instalments?: TaxAdvanceInstalment[];
  deferment_interest_total?: number;
  year_end_shortfall?: { unpaid: number; interest_per_month: number; from: string; final: boolean; explanation: string } | null;
  next_due?: TaxAdvanceInstalment | null;
  rule?: { verification: TaxVerification; legacy_section?: string; act_2025_section?: string; note?: string };
  notes?: string[];
}

// One payslip month (April..March) in month-by-month mode.
export interface TaxMonthInput {
  label: string;
  status: 'actual' | 'projected';
  salary: Record<string, number>;
  payroll_deductions: Record<string, number>;
  employer_contributions: Record<string, number>;
  tds: number | null;
  rent_paid: number;
  metro: boolean | null;
}

export interface TaxMonthlyInput {
  enabled: boolean;
  months: TaxMonthInput[];
}

export interface TaxMonthlyView {
  months: {
    label: string;
    status: 'actual' | 'projected';
    gross_cash: number;
    payroll_deductions: number;
    tds: number;
    tds_basis: 'actual' | 'projected' | 'missing';
    in_hand: number;
    employer_nps: number;
  }[];
  actual_months: number;
  projected_months: number;
  tds_paid_to_date: number;
  tax_still_due: number;
  suggested_tds_per_remaining_month: number;
  expected_refund: number;
  missing_tds_months: string[];
  method: string;
}

export interface TaxAuditLine {
  step: number;
  key: string;
  label: string;
  amount: number;
  formula: string;
  source: 'input' | 'rule' | 'derived' | 'assumption' | 'user_asserted';
  rule_ref?: string;
  verification?: TaxVerification;
  legacy_section?: string;
  act_2025_section?: string;
  inputs?: Record<string, unknown>;
}

export interface TaxWarning {
  code: string;
  severity: 'info' | 'warning';
  regime: TaxRegimeKey | null;
  message: string;
}

export interface TaxHraDetail {
  computed_monthly?: boolean;
  per_month?: { label: string; exemption: number; binding_component: string | null; metro: boolean; rent_paid: number }[];
  exemption: number;
  components: { actual_hra_received: number; rent_paid_minus_pct_of_salary: number; pct_of_salary: number };
  binding_component: string | null;
  metro: boolean;
  metro_or_non_metro_pct: number;
  rent_excess_over_salary_pct: number;
  months_rented: number;
}

export interface TaxRegimeComputation {
  regime: TaxRegimeKey;
  label: string;
  gross_salary: number;
  cash_salary: number;
  salary_exemptions: number;
  hra: TaxHraDetail | null;
  standard_deduction: number;
  professional_tax_deduction: number;
  taxable_salary: number;
  house_property_income: number;
  other_income: number;
  special_rate_income: number;
  gross_total_income: number;
  deductions: Record<string, number>;
  deductions_total: number;
  total_income: number;
  slab_tax: number;
  special_rate_tax: number;
  tax_before_rebate: number;
  rebate: number;
  tax_after_rebate: number;
  surcharge_rate_pct: number;
  surcharge_before_marginal_relief: number;
  surcharge_marginal_relief: number;
  surcharge: number;
  cess: number;
  total_tax: number;
  prepaid_taxes: number;
  balance_payable: number;
  effective_rate_pct: number;
  marginal_rate_pct: number;
  monthly_average: { tax: number; in_hand_salary: number; note: string };
  in_hand_salary_annual: number;
  payroll_deductions_total: number;
  monthly: TaxMonthlyView | null;
  audit: TaxAuditLine[];
}

export interface TaxRuleSetRef {
  rule_set_id: string;
  version: number;
  financial_year: string;
  assessment_year: string;
  act: string;
  name?: string;
  source?: 'shipped' | 'user';
  content_hash?: string;
}

export interface TaxComputeResult {
  rule_set: TaxRuleSetRef;
  computed_at: string | null;
  regimes: Record<TaxRegimeKey, TaxRegimeComputation>;
  comparison: {
    best_regime: TaxRegimeKey;
    savings_old_minus_new: number;
    savings_pct_of_old: number | null;
    monthly_savings_old_minus_new: number;
    explanation: string;
  };
  warnings: TaxWarning[];
  inputs: TaxPlannerInputs;
}

export interface TaxRuleSetMeta {
  rule_set_id: string;
  version: number;
  financial_year: string;
  name: string;
  source: 'shipped' | 'user';
  based_on_rule_set_id: string | null;
  based_on_version: number | null;
  content_hash: string;
  status: 'active' | 'archived';
  note: string | null;
  created_at: string | null;
  version_count?: number;
  applies_to_fy?: boolean;
  unchanged?: boolean;
}

// A rule-set item: the leaf unit of a rule set, carrying provenance with its value.
export interface TaxRuleItem {
  value: unknown;
  verification: TaxVerification;
  source?: string;
  legacy_section?: string;
  act_2025_section?: string;
  note?: string;
}

export interface TaxRuleSetSource {
  id: string;
  title: string;
  url: string;
  accessed?: string;
  official?: boolean;
}

export interface TaxRuleSetContent {
  rule_set_id: string;
  version: number;
  financial_year: string;
  assessment_year: string;
  act: string;
  name?: string;
  status_note?: string;
  sources: TaxRuleSetSource[];
  regimes: Record<TaxRegimeKey, Record<string, unknown>>;
  [key: string]: unknown;
}

export interface TaxRuleSetChange {
  path: string;
  before: unknown;
  after: unknown;
  added: boolean;
  removed: boolean;
}

export interface TaxInputField {
  key: string;
  label: string;
  kind?: string;
  help?: string;
  variable?: boolean;
}

export interface TaxDeductionField {
  path: string;
  label: string;
  group: string;
  rule_key: string;
  help?: string;
  type?: 'boolean';
  user_asserted?: boolean;
}

export interface TaxInputMetadata {
  salary_components: TaxInputField[];
  payroll_deductions: TaxInputField[];
  employer_contributions: TaxInputField[];
  other_income: TaxInputField[];
  capital_gains: TaxInputField[];
  deduction_fields: TaxDeductionField[];
  default_financial_year: string;
}

export interface TaxScenarioSummary {
  id: number;
  name: string;
  profile_id: number | null;
  financial_year: string;
  rule_set_id: string;
  rule_set_version: number;
  rule_set_hash: string;
  computed_at: string;
  recalculated_from: number | null;
  notes: string | null;
  created_at: string;
  old_total_tax: number;
  new_total_tax: number;
  best_regime: TaxRegimeKey;
}

export interface TaxScenario extends TaxScenarioSummary {
  inputs: TaxPlannerInputs;
  result: TaxComputeResult;
}

export interface TaxNpsFlag {
  code: string;
  message: string;
}

export interface TaxNpsScenario {
  label: string;
  pct_of_base: number | null;
  regime: TaxRegimeKey;
  feasible: boolean;
  employer_nps_annual: number;
  employer_nps_monthly: number;
  deductible_employer_nps: number;
  taxable_income_before: number;
  taxable_income_after: number;
  tax_before: number;
  tax_after: number;
  tax_saved_annual: number;
  tax_saved_monthly: number;
  tax_saved_per_rupee: number | null;
  cash_salary_annual: number;
  cash_reduction_annual: number;
  cash_reduction_monthly: number;
  in_hand_annual: number;
  in_hand_monthly: number;
  in_hand_change_annual: number;
  in_hand_change_monthly: number;
  effective_rate_before_pct: number;
  effective_rate_after_pct: number;
  additional_retirement_investment_annual: number;
  net_economic_benefit_annual: number;
  ctc_before: number;
  ctc_after: number;
  tax_by_regime: Record<TaxRegimeKey, number>;
  flags: TaxNpsFlag[];
}

export interface TaxNpsScenariosResult {
  rule_set: TaxRuleSetRef;
  funding: 'restructure' | 'over_ctc';
  restructure_from: string | null;
  regime_mode: 'best' | TaxRegimeKey;
  salary_base_annual: number;
  salary_base_source: string;
  current_employer_nps_annual: number;
  before: { regime: TaxRegimeKey; tax: number; in_hand_annual: number; in_hand_monthly: number; taxable_income: number };
  scenarios: TaxNpsScenario[];
  definitions: Record<string, string>;
}

// The optimisation the payslip simulator, overview and charts apply.
export interface TaxOptimization {
  mode: 'pct' | 'monthly';
  employer_nps_pct: number;
  employer_nps_monthly: number;
  funding: 'restructure' | 'over_ctc';
  restructure_from: string;
  salary_base_override: number | null;
  regime: 'best' | TaxRegimeKey;
  offered_pcts: string; // free text, e.g. "10, 14"; empty = policy not confirmed
  actual_monthly_tds_before: number | null;
  actual_monthly_tds_after: number | null;
  payslip_month: number | null; // month-by-month entry: 0 = April; null = the current month
}

export interface TaxPayslipSide {
  regime: TaxRegimeKey;
  earnings: Record<string, number>;
  gross_monthly_cash: number;
  payroll_deductions: Record<string, number>;
  payroll_deductions_total: number;
  tds_monthly: number;
  tds_basis: 'payroll_actual' | 'payroll_adjusted' | 'average' | 'month_actual' | 'month_projected' | 'month_missing';
  engine_average_tds_monthly: number;
  net_in_hand_monthly: number;
  employer_nps_monthly: number;
  employer_nps_annual: number;
  taxable_salary_annual: number;
  taxable_income_annual: number;
  annual_tax: number;
}

export interface TaxPayslipResult {
  rule_set: TaxRuleSetRef;
  before: TaxPayslipSide;
  after: TaxPayslipSide;
  feasible: boolean;
  notes: string[];
  month: { index: number; label: string; status: 'actual' | 'projected' } | null; // null = average month
  difference: {
    monthly_cash_change: number;
    monthly_nps_change: number;
    annual_tax_saved: number;
    monthly_tax_saved: number;
    net_monthly_impact: number;
    net_annual_impact: number;
  };
  tds_note: string;
}

export interface TaxEpfSuggestion {
  financial_year: string;
  basis: 'ceiling' | 'full';
  rate_pct: number;
  months: { label: string; wages: number; epf: number; explanation: string;
    ceilings: { amount: number; days: number; first_day: number; verification: TaxVerification }[] }[];
  annual: number;
  ceiling_changes: { from: string; amount: number; verification: TaxVerification; note?: string }[];
  notes: string[];
}

export interface TaxWaterfallResult {
  regime: TaxRegimeKey;
  baseline_tax: number;
  baseline_taxable_income: number;
  steps: { key: string; label: string; effect: number; tax_after_step: number }[];
  final_tax: number;
  consistent: boolean;
  baseline_definition: string;
}

export interface TaxPrefillItem {
  id: string;
  target: string; // a planner input path, or 'salary_total' (fixed salary components, scaled together)
  target_label: string;
  amount: number;
  label: string;
  basis: 'recorded' | 'estimate' | 'guess';
  explanation: string;
  source: { type: string; id?: number; category?: string };
  selected: boolean;
  note?: string | null;
  overlap?: string;
}

export interface TaxPrefillResult {
  financial_year: string;
  person_id: number | null;
  people: { id: number; name: string; role: string }[];
  items: TaxPrefillItem[];
  monthly_grid_targets: string[];
  notes: string[];
}
