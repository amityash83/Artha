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

export interface Account {
  id: number;
  name: string;
  institution_id: number;
  institution_name?: string;
  current_balance: number;
  currency: string;
  status: string;
  owner?: string;
  tags?: string;
  metadata_json?: string;
}

export interface Asset {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  institution_id?: number;
  institution_name?: string;
  current_value: number;
  invested_amount?: number;
  acquisition_date?: string;
  status?: string;
  owner?: string;
  metadata_json?: string;
  [key: string]: any; // Allows holding dynamic deserialized parameters
}

export interface Liability {
  id: number;
  name: string;
  category_id: number;
  category_name?: string;
  lender_institution_id?: number;
  lender_name?: string;
  outstanding: number;
  interest_rate: number;
  emi: number;
  tenure_months?: number;
  status?: string;
  owner?: string;
  metadata_json?: string;
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
  recommendations: Recommendation[];
  cash_flows: MonthlyCashFlow[];
}
