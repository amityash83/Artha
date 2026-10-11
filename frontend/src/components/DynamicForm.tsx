import React, { useState, useEffect } from 'react';
import { Category, Institution, Liability, Goal, Person } from '../types';
import { HoldingLotsEditor } from './HoldingLotsEditor';
import { GoalFundingConstraintsEditor } from './GoalFundingConstraintsEditor';
import { DocumentsEditor } from './DocumentsEditor';
import { PropertyRentalLedgerEditor } from './PropertyRentalLedgerEditor';
import { InsuranceClaimsEditor } from './InsuranceClaimsEditor';
import { InsurancePremiumPaymentsEditor } from './InsurancePremiumPaymentsEditor';
import { API_BASE_URL } from '../config';
import { FREQUENCIES } from '../frequency';
import { AmountInput, Switch } from './settings/ui';

interface DynamicFormProps {
  entityType: 'accounts' | 'assets' | 'liabilities' | 'income' | 'expenses' | 'goals';
  category?: Category;
  categories?: Category[];
  institutions: Institution[];
  people?: Person[];
  goals?: Goal[];
  initialData?: any;
  liabilities?: Liability[];
  properties?: any[];
  onSubmit: (data: any) => void;
  onCancel: () => void;
  /** Shown at the left of the footer, e.g. a delete action when editing. */
  footerStart?: React.ReactNode;
}

const HOLDING_CATEGORIES = ['Stock', 'Mutual Fund'];

// Mutual fund types and the risk each implies; mirrors backend/risk.py FUND_TYPE_RISK.
const FUND_TYPES: { value: string; label: string }[] = [
  { value: 'Equity', label: 'Equity (including index funds and ELSS)' },
  { value: 'Hybrid', label: 'Hybrid' },
  { value: 'Debt', label: 'Debt' },
  { value: 'Liquid', label: 'Liquid or money market' },
  { value: 'Other', label: 'Other (gold, international)' },
];
const FUND_TYPE_RISK: Record<string, string> = { Equity: 'High', Hybrid: 'Medium', Debt: 'Low', Liquid: 'Low', Other: 'Medium' };

// What a home loan's money went on, and what that means for tax (tax/prefill.py).
const LOAN_USE_HINT: Record<string, string> = {
  purchase: 'Interest (24b) and principal (80C) can count, old regime, self-occupied home.',
  repair: 'Interest can count, up to a lower cap; the principal doesn\'t count under 80C.',
  other: "Not a home-loan deduction: the Tax Planner leaves this loan out.",
};

const INSURANCE_TYPE_FIELDS: Record<string, string[]> = {
  Life: ['sum_assured', 'surrender_value'],
  Term: ['sum_assured'],
  Health: ['sum_insured', 'claims_made', 'claims_amount'],
  Vehicle: ['idv', 'vehicle_registration'],
};

export const DynamicForm: React.FC<DynamicFormProps> = ({
  entityType,
  category,
  categories,
  institutions,
  people = [],
  goals,
  initialData,
  liabilities = [],
  properties = [],
  onSubmit,
  onCancel,
  footerStart,
}) => {
  const [formData, setFormData] = useState<any>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [holdingLots, setHoldingLots] = useState<any[]>([]);
  const [fundingConstraints, setFundingConstraints] = useState<any[]>([]);
  const [rentalLedger, setRentalLedger] = useState<any[]>([]);
  const [insuranceClaims, setInsuranceClaims] = useState<any[]>([]);
  const [premiumPayments, setPremiumPayments] = useState<any[]>([]);
  const [showShare, setShowShare] = useState(false);

  // The effective category tracks the in-form Asset Class selector when present,
  // so switching category re-derives the specialized field set below.
  const currentCategoryId = formData.category_id || category?.id;
  const currentCategory = categories?.find((c) => c.id === currentCategoryId) || category;
  const categoryName = currentCategory?.name;

  const isCreditCard = entityType === 'liabilities' && categoryName === 'Credit Card';
  const isHomeLoan = entityType === 'liabilities' && categoryName === 'Home Loan';
  const isInsurance = entityType === 'assets' && categoryName === 'Insurance';
  const isProperty = entityType === 'assets' && categoryName === 'Property';
  const isHolding = entityType === 'assets' && HOLDING_CATEGORIES.includes(categoryName || '');
  const isEpf = entityType === 'assets' && categoryName === 'EPF';

  const buildFieldSet = (policyType?: string) => {
    const standardFields: Record<string, string> = {
      name: 'text',
    };

    if (entityType === 'accounts') {
      standardFields['category_id'] = 'category_select';
      standardFields['institution_id'] = 'institution_select';
      standardFields['owner_id'] = 'person_select';
      standardFields['currency'] = 'text';
      standardFields['status'] = 'select_status';
      // Balance is always derived from the transactions ledger; both fields below map
      // to the account's one-off 'Initial balance registration' credit transaction.
      // On create the backend turns current_balance into that transaction; on edit,
      // opening_balance (prefilled from it by /api/init) lets the user set or correct
      // it later — update_entity rewrites the underlying transaction, never a column.
      if (!initialData) {
        standardFields['current_balance'] = 'number';
      } else {
        standardFields['opening_balance'] = 'number';
      }
    } else if (entityType === 'assets') {
      standardFields['category_id'] = 'category_select';
      if (isInsurance) {
        standardFields['policy_type'] = 'select_policy_type';
        standardFields['institution_id'] = 'institution_select';
        standardFields['policy_number'] = 'text';
        standardFields['premium'] = 'number';
        standardFields['frequency'] = 'select_frequency';
        standardFields['renewal_date'] = 'date';
        (INSURANCE_TYPE_FIELDS[policyType || 'Life'] || []).forEach((f) => {
          standardFields[f] = f === 'vehicle_registration' ? 'text' : 'number';
        });
        standardFields['status'] = 'select_status';
        standardFields['owner_id'] = 'person_select';
      } else if (isEpf) {
        // Employer, UAN, member ID, status and the three shares come from the EPF
        // category's fields_definition; the value is derived from the shares on save.
        standardFields['owner_id'] = 'person_select';
      } else if (isHolding) {
        standardFields['institution_id'] = 'institution_select';
        standardFields['acquisition_date'] = 'date';
        standardFields['current_value'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner_id'] = 'person_select';
        // A fund's type decides its risk (backend/risk.py) and its tax treatment.
        if (categoryName === 'Mutual Fund') standardFields['fund_type'] = 'select_fund_type';
        standardFields['risk_level'] = 'select_risk';
      } else {
        standardFields['institution_id'] = 'institution_select';
        standardFields['current_value'] = 'number';
        standardFields['invested_amount'] = 'number';
        standardFields['acquisition_date'] = 'date';
        standardFields['status'] = 'select_status';
        standardFields['owner_id'] = 'person_select';
        standardFields['risk_level'] = 'select_risk';
        if (isProperty) {
          standardFields['linked_liability_ids'] = 'home_loan_multi';
        }
      }
      standardFields['goal_mapping'] = 'goal_select';
    } else if (entityType === 'liabilities') {
      standardFields['category_id'] = 'category_select';
      if (isCreditCard) {
        standardFields['lender_institution_id'] = 'institution_select';
        standardFields['outstanding'] = 'number';
        standardFields['credit_limit'] = 'number';
        standardFields['statement_balance'] = 'number';
        standardFields['statement_date'] = 'number';
        standardFields['due_date'] = 'number';
        standardFields['annual_fee'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner_id'] = 'person_select';
      } else {
        standardFields['lender_institution_id'] = 'institution_select';
        standardFields['outstanding'] = 'number';
        standardFields['interest_rate'] = 'number';
        standardFields['emi'] = 'number';
        standardFields['tenure_months'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner_id'] = 'person_select';
        if (isHomeLoan) {
          standardFields['linked_asset_id'] = 'property_select';
          // What the money went on decides its tax treatment (tax/prefill.py _loan_use);
          // both live in metadata_json.
          standardFields['loan_use'] = 'select_loan_use';
          standardFields['house_share_pct'] = 'loan_share';
        }
      }
    } else if (entityType === 'goals') {
      standardFields['target_amount'] = 'number';
      standardFields['current_amount'] = 'number';
      standardFields['monthly_contribution'] = 'number';
      standardFields['target_date'] = 'date';
      standardFields['priority'] = 'select_priority';
      standardFields['low_risk_only'] = 'checkbox';
    } else if (entityType === 'income' || entityType === 'expenses') {
      standardFields['category_id'] = 'category_select';
      standardFields['owner_id'] = 'person_select';
      standardFields['amount'] = 'number';
      standardFields['frequency'] = 'select_frequency';
      if (entityType === 'income') standardFields['taxable'] = 'checkbox';
      standardFields['status'] = 'select_status';
    }

    // Append any category-defined custom fields not already covered above
    if (currentCategory && currentCategory.fields_definition) {
      try {
        const customDefs = typeof currentCategory.fields_definition === 'string'
          ? JSON.parse(currentCategory.fields_definition)
          : currentCategory.fields_definition;

        if (Array.isArray(customDefs)) {
          customDefs.forEach((item: any) => {
            if (item && item.name && !standardFields[item.name]) {
              standardFields[item.name] = item.type || 'text';
            }
          });
        } else if (typeof customDefs === 'object' && customDefs !== null) {
          Object.keys(customDefs).forEach((k) => {
            if (!standardFields[k]) {
              standardFields[k] = customDefs[k];
            }
          });
        }
      } catch (e) {
        console.error("Error parsing fields_definition:", e);
      }
    }

    return standardFields;
  };

  useEffect(() => {
    const initialPolicyType = initialData?.policy_type || initialData?.insurance_details?.policy_type || 'Life';
    const standardFields = buildFieldSet(initialPolicyType);
    setFields(standardFields);

    const defaultData: any = {};
    Object.keys(standardFields).forEach((k) => {
      const type = standardFields[k];
      if (initialData && initialData[k] !== undefined) {
        defaultData[k] = initialData[k];
      } else if (type === 'number') {
        defaultData[k] = 0;
      } else if (type === 'institution_select') {
        // accounts.institution_id is NOT NULL; everywhere else (e.g. self-held
        // property, physical gold) an institution is legitimately absent.
        defaultData[k] = entityType === 'accounts' ? (institutions[0]?.id || '') : '';
      } else if (type === 'person_select') {
        // The Primary Owner, not whoever sorts first (people arrive sorted by name).
        defaultData[k] = (people.find((p) => p.role === 'Primary Owner') ?? people[0])?.id || '';
      } else if (type === 'category_select') {
        defaultData[k] = initialData?.category_id || category?.id || '';
      } else if (type === 'select_status') {
        defaultData[k] = 'Active';
      } else if (type === 'select_priority') {
        defaultData[k] = 'Medium';
      } else if (type === 'select_risk') {
        defaultData[k] = 'Medium';
      } else if (type === 'select_policy_type') {
        defaultData[k] = 'Life';
      } else if (type === 'select_frequency') {
        defaultData[k] = isInsurance ? 'Yearly' : 'Monthly';
      } else if (type === 'checkbox') {
        defaultData[k] = k === 'low_risk_only' ? 0 : 1;
      } else if (type === 'select_fund_type') {
        defaultData[k] = '';
      } else if (type === 'select_epf_status') {
        defaultData[k] = 'Active';
      } else if (type === 'select_loan_use') {
        defaultData[k] = 'purchase';
      } else if (type === 'loan_share') {
        defaultData[k] = 100;
      } else if (k === 'currency') {
        defaultData[k] = 'INR'; // accounts.currency's column default
      } else {
        defaultData[k] = '';
      }
    });

    if (initialData && initialData.metadata_json) {
      const meta = typeof initialData.metadata_json === 'string'
        ? JSON.parse(initialData.metadata_json)
        : initialData.metadata_json;
      Object.assign(defaultData, meta);
    }

    if (isProperty && 'linked_liability_ids' in standardFields) {
      // Loans point at their property (liabilities.linked_asset_id), so a property can
      // carry several, e.g. a home loan and a top-up on it.
      defaultData['linked_liability_ids'] = initialData?.id ? liabilities.filter((l) => l.linked_asset_id === initialData.id).map((l) => l.id) : [];
      delete defaultData['linked_liability_id']; // the old single-loan field, if it leaked into metadata
    }

    setFormData(defaultData);
    setHoldingLots(initialData?.holding_lots ? [...initialData.holding_lots] : []);
    setRentalLedger(initialData?.rental_ledger ? [...initialData.rental_ledger] : []);
    setInsuranceClaims(initialData?.insurance_claims ? [...initialData.insurance_claims] : []);
    setPremiumPayments(initialData?.premium_payments ? [...initialData.premium_payments] : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, category, institutions, initialData]);

  // Goal funding constraints live behind their own routes (not bundled into
  // initialData), so an editing goal needs a separate fetch to load them.
  useEffect(() => {
    if (entityType === 'goals' && initialData?.id) {
      fetch(`${API_BASE_URL}/api/goals/${initialData.id}/funding-constraints`)
        .then((r) => r.json())
        .then((data) => setFundingConstraints(data))
        .catch(() => setFundingConstraints([]));
    } else {
      setFundingConstraints([]);
    }
  }, [entityType, initialData]);

  // Re-derive the field set when the in-form Asset Class selection changes
  useEffect(() => {
    if (!formData.category_id) return;
    setFields(buildFieldSet(formData.policy_type || 'Life'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.category_id]);

  const handleChange = (key: string, val: any) => {
    if (key === 'policy_type') {
      const nextFields = buildFieldSet(val);
      setFields(nextFields);
      setFormData((prev: any) => {
        const next = { ...prev, [key]: val };
        Object.keys(nextFields).forEach((k) => {
          if (next[k] === undefined) {
            next[k] = nextFields[k] === 'number' ? 0 : '';
          }
        });
        return next;
      });
      return;
    }
    if (key === 'fund_type') {
      // The fund type sets the risk level, so the two can't disagree.
      setFormData((prev: any) => ({ ...prev, fund_type: val, risk_level: FUND_TYPE_RISK[val] ?? prev.risk_level }));
      return;
    }
    setFormData((prev: any) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { ...formData };
    if (isHolding) {
      payload.holding_lots = holdingLots;
    }
    if (isProperty) {
      payload.rental_ledger = rentalLedger;
    }
    if (isInsurance) {
      payload.insurance_claims = insuranceClaims;
      payload.premium_payments = premiumPayments;
    }
    if (entityType === 'goals') {
      payload.funding_constraints = fundingConstraints;
    }
    if (isEpf) {
      // EPF balance = your share + the employer's; the pension (EPS) part isn't counted.
      // A transferred account's money now sits in the current one, so it counts as nil.
      const transferred = payload.transfer_status === 'Transferred';
      payload.current_value = transferred ? 0 : (Number(payload.employee_share) || 0) + (Number(payload.employer_share) || 0);
      payload.status = transferred ? 'Closed' : 'Active';
    }
    onSubmit(payload);
  };

  const customDefs = (): any[] => {
    if (!currentCategory?.fields_definition) return [];
    try {
      const defs = typeof currentCategory.fields_definition === 'string'
        ? JSON.parse(currentCategory.fields_definition)
        : currentCategory.fields_definition;
      return Array.isArray(defs) ? defs : [];
    } catch {
      return [];
    }
  };

  const getLabel = (key: string) => {
    const found = customDefs().find((item: any) => item && item.name === key);
    // The input shows the unit itself, so drop a "(%)"-style unit from custom labels.
    if (found?.label) return String(found.label).replace(/\s*\((%|₹|months?)\)\s*$/i, '');

    const knownLabels: Record<string, string> = {
      name: 'Name',
      institution_id: entityType === 'accounts' ? 'Bank' : 'Held with',
      lender_institution_id: isCreditCard ? 'Card issuer' : 'Lender',
      owner_id: 'Owner',
      current_balance: 'Opening balance',
      opening_balance: 'Opening balance',
      current_value: 'Current value',
      invested_amount: 'Amount invested',
      acquisition_date: 'Bought on',
      risk_level: 'Risk',
      goal_mapping: 'Counts towards goal',
      fund_type: 'Fund type',
      low_risk_only: 'Only low-risk holdings',
      linked_liability_ids: 'Loans on this property',
      linked_asset_id: 'Property it paid for',
      outstanding: isCreditCard ? 'Balance now' : 'Still owed',
      interest_rate: 'Interest rate',
      emi: 'Monthly EMI',
      tenure_months: 'Original tenure',
      premium: 'Premium',
      frequency: entityType === 'assets' ? 'Paid' : 'How often',
      renewal_date: 'Next renewal',
      sum_assured: 'Sum assured',
      surrender_value: 'Surrender value',
      sum_insured: 'Sum insured',
      claims_made: 'Claims made',
      claims_amount: 'Claimed so far',
      idv: 'Insured declared value (IDV)',
      vehicle_registration: 'Registration number',
      credit_limit: 'Credit limit',
      statement_balance: 'Last statement',
      statement_date: 'Statement day',
      due_date: 'Payment due day',
      annual_fee: 'Annual fee',
      policy_type: 'Policy type',
      policy_number: 'Policy number',
      target_amount: 'Target',
      current_amount: 'Saved so far',
      monthly_contribution: 'Putting in each month',
      target_date: 'Aim to reach by',
      priority: 'Priority',
      amount: entityType === 'income' ? 'Amount per period (gross)' : 'Amount per period',
      taxable: 'Taxable income',
      currency: 'Currency',
      status: 'Status',
    };
    if (knownLabels[key]) return knownLabels[key];
    if (key === entityType) return ({ accounts: 'Account', assets: 'Asset', liabilities: 'Loan', income: 'Income', expenses: 'Expense', goals: 'Goal' } as Record<string, string>)[key] ?? key;

    const words = key.split('_').join(' ');
    return words.charAt(0).toUpperCase() + words.slice(1);
  };

  // A line of help under fields whose meaning isn't obvious.
  const HINTS: Record<string, string> = {
    current_balance: 'What the account held when you started tracking it. Later changes come from transactions.',
    opening_balance: 'What the account held when you started tracking it. Later changes come from transactions.',
    statement_balance: 'The amount on your most recent statement.',
    tenure_months: 'The full term when the loan began.',
    goal_mapping: 'Counts this asset towards one of your goals.',
    linked_asset_id: 'A property can carry more than one loan, such as a home loan and a top-up.',
    surrender_value: 'What the insurer would pay if you surrendered the policy today.',
    employee_share: 'From your EPFO passbook, including interest. This and the employer\'s share make up the account\'s value.',
    pension_share: 'Recorded for reference only: a pension entitlement, not a balance you can withdraw, so it isn\'t counted in net worth.',
    uan: 'Your one UAN covers every employer; each employer gets its own member ID.',
    low_risk_only: 'For money you can\'t afford to see fall, like a reserve: Artha flags any holding counted towards this goal that isn\'t low risk (liquid or debt funds, FDs, PPF, EPF are).',
  };

  // How each field is entered: money with ₹ and Indian grouping, rates as %, terms in months.
  const MONEY = new Set([
    'current_balance', 'opening_balance', 'current_value', 'invested_amount', 'outstanding', 'credit_limit', 'statement_balance',
    'annual_fee', 'emi', 'premium', 'sum_assured', 'surrender_value', 'sum_insured', 'claims_amount', 'idv',
    'target_amount', 'current_amount', 'monthly_contribution', 'amount', 'employee_share', 'employer_share', 'pension_share',
  ]);
  const SUFFIX: Record<string, string> = { interest_rate: '%', tenure_months: 'months' };
  const DAY_OF_MONTH = new Set(['statement_date', 'due_date']);

  // Two sections: who/what the record is, then its figures and dates. Category-defined
  // custom fields follow the same rule by type.
  const isFigure = (k: string) => fields[k] === 'number' || fields[k] === 'date' || DAY_OF_MONTH.has(k);
  const keys = Object.keys(fields);
  const detailKeys = keys.filter((k) => !isFigure(k));
  const figureKeys = keys.filter(isFigure);

  // Property's "linked_liability_ids" is a form-only field: the loans to point at this
  // property. There is no such column on assets — liabilities.linked_asset_id is the single
  // source of truth (see EntityGrid's dispatchSatelliteData). Any home loan can be ticked;
  // one already on another property moves here. A property may carry several loans.
  const availableHomeLoans = liabilities.filter((l) => l.category_name === 'Home Loan' || l.linked_asset_id === initialData?.id);
  const availableProperties = properties;
  const propertyName = (id: number | null | undefined) => properties.find((p) => p.id === id)?.name;

  const field = (k: string, control: React.ReactNode, opts: { wide?: boolean; noLabelFor?: boolean } = {}) => (
    <div key={k} className={`df-field${opts.wide ? ' df-wide' : ''}`}>
      {opts.noLabelFor ? <span className="df-label">{getLabel(k)}</span> : <label htmlFor={`field-${k}`} className="df-label">{getLabel(k)}</label>}
      {control}
      {HINTS[k] && <span className="df-hint">{HINTS[k]}</span>}
    </div>
  );

  const select = (k: string, value: any, onChange: (v: string) => void, options: { value: any; label: string }[], required = false) => (
    <select id={`field-${k}`} className="form-control" value={value ?? ''} onChange={(e) => onChange(e.target.value)} required={required}>
      {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
    </select>
  );
  const toId = (v: string) => (v ? parseInt(v) : null);

  const renderField = (k: string) => {
    const type = fields[k];

    if (type === 'institution_select') {
      const required = entityType === 'accounts';
      const sorted = [...institutions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
      return field(k, select(k, formData[k] || '', (v) => handleChange(k, toId(v)), [
        { value: '', label: required ? 'Choose a bank' : entityType === 'liabilities' ? 'Not set' : 'None (held yourself)' }, ...sorted.map((i) => ({ value: i.id, label: i.name })),
      ], required));
    }
    if (type === 'person_select') {
      return field(k, select(k, formData[k] || '', (v) => handleChange(k, parseInt(v)), [
        { value: '', label: 'Choose a person' },
        ...people.map((p) => ({ value: p.id, label: p.role === 'Primary Owner' ? p.name : `${p.name} (${p.role})` })),
      ], true));
    }
    if (type === 'category_select') {
      const catEntityType = ({ accounts: 'Account', liabilities: 'Liability', income: 'Income', expenses: 'Expense' } as Record<string, string>)[entityType] ?? 'Asset';
      // assets.category_id is NOT NULL; accounts.category_id is nullable —
      // an account that fits no defined type may stay uncategorized.
      const required = entityType !== 'accounts';
      const label = entityType === 'accounts' ? 'Account type' : entityType === 'assets' ? 'Kind of asset' : entityType === 'liabilities' ? (isCreditCard ? 'Type' : 'Loan type') : 'Category';
      return (
        <div key={k} className="df-field">
          <label htmlFor={`field-${k}`} className="df-label">{label}</label>
          {select(k, formData[k] || '', (v) => handleChange(k, toId(v)), [
            { value: '', label: required ? 'Choose one' : 'Uncategorised' },
            ...(categories || []).filter((c) => c.entity_type === catEntityType).map((c) => ({ value: c.id, label: c.name })),
          ], required)}
        </div>
      );
    }
    if (type === 'select_frequency') {
      const current = formData[k] || 'Monthly';
      const options: string[] = (FREQUENCIES as readonly string[]).includes(current) ? [...FREQUENCIES] : [current, ...FREQUENCIES];
      return field(k, select(k, current, (v) => handleChange(k, v), options.map((f) => ({ value: f, label: f }))));
    }
    if (type === 'checkbox') {
      const toggle = (
        <div key={k} className="df-field df-switch">
          <span className="df-label">{getLabel(k)}</span>
          <Switch checked={!!Number(formData[k])} onChange={(v) => handleChange(k, v ? 1 : 0)} label={getLabel(k)} />
        </div>
      );
      return HINTS[k] ? <div key={k} className="df-field df-wide">{toggle}<span className="df-hint">{HINTS[k]}</span></div> : toggle;
    }
    if (type === 'goal_select') {
      return field(k, select(k, formData[k] || '', (v) => handleChange(k, v), [
        { value: '', label: 'None' }, ...(goals || []).map((g) => ({ value: g.name, label: g.name })),
      ]));
    }
    if (type === 'home_loan_multi') {
      const ticked: number[] = Array.isArray(formData[k]) ? formData[k] : [];
      return (
        <div key={k} className="df-field df-wide">
          <span className="df-label">{getLabel(k)}</span>
          {availableHomeLoans.length === 0 ? <span className="df-hint">No home loans yet. Add one under Liabilities, then tick it here.</span> : (
            <div className="df-checks">
              {availableHomeLoans.map((l) => {
                const elsewhere = l.linked_asset_id && l.linked_asset_id !== initialData?.id ? propertyName(l.linked_asset_id) : null;
                return (
                  <label key={l.id} className="df-check">
                    <input type="checkbox" checked={ticked.includes(l.id)}
                      onChange={(e) => handleChange(k, e.target.checked ? [...ticked, l.id] : ticked.filter((id) => id !== l.id))} />
                    <span>{l.name}<small>{[`₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(l.outstanding || 0)} owed`, elsewhere ? `now on ${elsewhere}; ticking moves it here` : null].filter(Boolean).join(' · ')}</small></span>
                  </label>
                );
              })}
            </div>
          )}
        </div>
      );
    }
    if (type === 'property_select') {
      return field(k, select(k, formData[k] || '', (v) => handleChange(k, toId(v)), [
        { value: '', label: 'None' }, ...availableProperties.map((p) => ({ value: p.id, label: p.name })),
      ]));
    }
    if (type === 'select_status') {
      const options = ['Active', 'Closed', 'Matured'];
      const current = formData[k] || 'Active';
      return field(k, select(k, current, (v) => handleChange(k, v), (options.includes(current) ? options : [current, ...options]).map((o) => ({ value: o, label: o }))));
    }
    if (type === 'select_fund_type') {
      const value = formData[k] || '';
      return field(k, (
        <>
          {select(k, value, (v) => handleChange(k, v), [{ value: '', label: 'Choose a type' }, ...FUND_TYPES])}
          <span className="df-hint">{value
            ? `${FUND_TYPE_RISK[value]} risk.${value === 'Equity' || value === 'Hybrid' ? '' : ' Its gains are taxed differently from equity funds.'}`
            : 'Sets the fund\'s risk, and how its gains are taxed.'}</span>
        </>
      ));
    }
    if (type === 'select_risk' && fields.fund_type && formData.fund_type) return null; // set by the fund type
    if (type === 'select_epf_status') {
      const status = formData[k] || 'Active';
      return field(k, (
        <>
          {select(k, status, (v) => handleChange(k, v), [
            { value: 'Active', label: 'Current employer' },
            { value: 'Unmerged', label: 'Previous employer, not merged yet' },
            { value: 'Transferred', label: 'Transferred to my current account' },
          ])}
          <span className="df-hint">{status === 'Unmerged'
            ? 'Merge it online with Form 13 on the EPFO member portal, so your service stays continuous.'
            : status === 'Transferred' ? 'Counts as nil: its money is now in your current account.' : 'Contributions are still going in.'}</span>
        </>
      ));
    }
    if (type === 'loan_share') return null; // shown inside "Used for"
    if (type === 'select_loan_use') {
      const share = Number(formData.house_share_pct ?? 100);
      const partial = showShare || share < 100;
      const use = formData[k] || 'purchase';
      return (
        <div key={k} className="df-field df-wide">
          <label htmlFor={`field-${k}`} className="df-label">Used for</label>
          {select(k, use, (v) => handleChange(k, v), [
            { value: 'purchase', label: 'Buying or building the house' },
            { value: 'repair', label: 'Repairs or renovation' },
            { value: 'other', label: 'Something else (car, education, wedding…)' },
          ])}
          <span className="df-hint">{LOAN_USE_HINT[use]}</span>
          {use !== 'other' && (partial ? (
            <span className="df-share">
              <label htmlFor="field-house_share_pct" className="df-label">Share that went into the house</label>
              <AmountInput id="field-house_share_pct" label="Share used for the house" suffix="%" width={60}
                value={share} onChange={(v) => handleChange('house_share_pct', Math.min(v, 100))} />
              <button type="button" className="settings-link" onClick={() => { handleChange('house_share_pct', 100); setShowShare(false); }}>All of it</button>
            </span>
          ) : (
            <button type="button" className="settings-link df-share-link" onClick={() => setShowShare(true)}>Only part of it?</button>
          ))}
        </div>
      );
    }
    if (type === 'select_priority') {
      return field(k, select(k, formData[k] || 'Medium', (v) => handleChange(k, v), ['High', 'Medium', 'Low'].map((o) => ({ value: o, label: o }))));
    }
    if (type === 'select_risk') {
      return field(k, select(k, formData[k] || 'Medium', (v) => handleChange(k, v), ['Low', 'Medium', 'High'].map((o) => ({ value: o, label: o }))));
    }
    if (type === 'select_policy_type') {
      return field(k, select(k, formData[k] || 'Life', (v) => handleChange(k, v), ['Life', 'Term', 'Health', 'Vehicle'].map((o) => ({ value: o, label: o }))));
    }
    if (DAY_OF_MONTH.has(k)) {
      const day = Number(formData[k]) || 0;
      return field(k, select(k, day || '', (v) => handleChange(k, v ? parseInt(v) : 0), [
        { value: '', label: 'Not set' }, ...Array.from({ length: 31 }, (_, i) => ({ value: i + 1, label: `${i + 1}${['th', 'st', 'nd', 'rd'][(i + 1) % 10 > 3 || [11, 12, 13].includes(i + 1) ? 0 : (i + 1) % 10]} of the month` })),
      ]));
    }
    if (type === 'number' && (MONEY.has(k) || SUFFIX[k])) {
      return field(k, (
        <AmountInput id={`field-${k}`} label={getLabel(k)} value={Number(formData[k]) || 0} onChange={(v) => handleChange(k, v)}
          prefix={MONEY.has(k) ? '₹' : undefined} suffix={SUFFIX[k]} allowNegative={k === 'current_balance' || k === 'opening_balance'} />
      ));
    }
    return field(k, (
      <input
        id={`field-${k}`}
        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
        step={type === 'number' ? 'any' : undefined}
        className="form-control"
        value={formData[k] !== undefined && formData[k] !== null ? formData[k] : ''}
        onChange={(e) => handleChange(k, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
        required={k === 'name'}
        autoFocus={k === 'name' && !initialData}
      />
    ), { wide: k === 'name' });
  };

  const hasDocuments = (entityType === 'accounts' || entityType === 'assets' || entityType === 'liabilities' || entityType === 'goals') && !!initialData?.id;
  const hasExtras = isHolding || isProperty || isInsurance || entityType === 'goals' || hasDocuments;

  return (
    <form onSubmit={handleSubmit} className="glass-panel df-form">
      <div className="df-head">
        <h3>{initialData ? `Edit ${initialData.name || getLabel(entityType).toLowerCase()}` : `Add ${((n: string) => (n === n.toUpperCase() ? n : n.toLowerCase()))(currentCategory?.name || getLabel(entityType))}`}</h3>
        {initialData && currentCategory && <span className="cc-note">{currentCategory.name}</span>}
      </div>

      <div className="df-body">
        <section className="df-section" aria-label="Details">
          <div className="df-grid">{detailKeys.map(renderField)}</div>
        </section>

        {figureKeys.length > 0 && (
          <section className="df-section" aria-label="Amounts and dates">
            <h4>Amounts and dates</h4>
            <div className="df-grid">{figureKeys.map(renderField)}</div>
          </section>
        )}

        {hasExtras && (
          <div className="df-grid df-extras">
            {isHolding && (
              <HoldingLotsEditor lots={holdingLots} onChange={setHoldingLots} xirr={initialData?.xirr} />
            )}

            {isProperty && (
              <PropertyRentalLedgerEditor entries={rentalLedger} onChange={setRentalLedger} />
            )}

            {isInsurance && (
              <>
                <InsuranceClaimsEditor claims={insuranceClaims} onChange={setInsuranceClaims} />
                <InsurancePremiumPaymentsEditor payments={premiumPayments} onChange={setPremiumPayments} />
              </>
            )}

            {entityType === 'goals' && categories && (
              <GoalFundingConstraintsEditor
                categories={categories}
                constraints={fundingConstraints}
                onChange={setFundingConstraints}
              />
            )}

            {/* Documents apply generically at the entity-type level (not per-category, unlike
                most other satellite editors) and manage their own upload/download/delete
                calls directly rather than staging through the JSON satellite-dispatch flow,
                since file bytes can't travel inside the form's JSON payload. Only shown once
                the entity actually has an id — an unsaved new entity has nothing to attach to. */}
            {hasDocuments && (
              <DocumentsEditor entityType={entityType} entityId={initialData.id} />
            )}
          </div>
        )}
      </div>

      <div className="df-foot">
        <div>{footerStart}</div>
        <div className="df-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary">{initialData ? 'Save changes' : 'Add'}</button>
        </div>
      </div>
    </form>
  );
};
