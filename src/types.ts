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
  recommendations: Recommendation[];
  cash_flows: MonthlyCashFlow[];
}
