export interface Account {
  id: number;
  name: string;
  institution: string;
  current_balance: number;
  last_updated: string;
  remarks: string;
}

export interface Loan {
  id: number;
  name: string;
  lender: string;
  outstanding: number;
  roi: number;
  emi: number;
  tenure: number;
  start_date: string;
  prepayment_allowed: number;
  processing_fee: number;
  loan_type: string;
  remaining_tenure: number;
  remaining_interest: number;
  progress: number;
}

export interface Investment {
  id: number;
  name: string;
  type: string;
  current_value: number;
  invested_amount: number;
  goal_mapping: string;
  last_updated: string;
}

export interface Property {
  id: number;
  name: string;
  purchase_price: number;
  current_value: number;
  associated_loan_id: number | null;
  rental_income: number;
  expenses: number;
  remarks: string;
}

export interface InsurancePolicy {
  id: number;
  company: string;
  policy_number: string;
  premium: number;
  frequency: string;
  coverage: number;
  nominee: string;
  maturity_date: string;
  last_premium_date: string;
  renewal_date: string;
  waiting_period: string;
  claim_history: string;
  insurance_type: string;
  surrender_value: number;
}

export interface Goal {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  monthly_contribution: number;
  expected_completion: string;
  goal_type: string;
  gap: number;
  months_remaining: number;
  status: string;
}

export interface FinancialRule {
  id: number;
  rule_key: string;
  rule_name: string;
  description: string;
  value: number;
  is_enabled: number;
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

export interface CreditCard {
  id: number;
  name: string;
  issuer: string;
  credit_limit: number;
  outstanding: number;
  statement_balance: number;
  statement_date: number;
  due_date: number;
  annual_fee: number;
  renewal_date: string;
  reward_points: number;
  point_value: number;
  lounge_access_domestic: string;
  lounge_access_international: string;
  spend_milestone_waiver: number;
  remarks: string;
}

export interface InitData {
  summary: Summary;
  accounts: Account[];
  loans: Loan[];
  investments: Investment[];
  properties: Property[];
  insurance: InsurancePolicy[];
  goals: Goal[];
  rules: FinancialRule[];
  recommendations: Recommendation[];
  credit_cards: CreditCard[];
}
