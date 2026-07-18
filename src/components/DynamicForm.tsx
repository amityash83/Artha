import React, { useState, useEffect } from 'react';
import { Category, Institution, Liability, Goal, Person } from '../types';
import { HoldingLotsEditor } from './HoldingLotsEditor';
import { GoalFundingConstraintsEditor } from './GoalFundingConstraintsEditor';
import { PropertyRentalLedgerEditor } from './PropertyRentalLedgerEditor';
import { InsuranceClaimsEditor } from './InsuranceClaimsEditor';
import { InsurancePremiumPaymentsEditor } from './InsurancePremiumPaymentsEditor';
import { API_BASE_URL } from '../config';

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
}

const HOLDING_CATEGORIES = ['Stock', 'Mutual Fund'];

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
}) => {
  const [formData, setFormData] = useState<any>({});
  const [fields, setFields] = useState<Record<string, string>>({});
  const [holdingLots, setHoldingLots] = useState<any[]>([]);
  const [fundingConstraints, setFundingConstraints] = useState<any[]>([]);
  const [rentalLedger, setRentalLedger] = useState<any[]>([]);
  const [insuranceClaims, setInsuranceClaims] = useState<any[]>([]);
  const [premiumPayments, setPremiumPayments] = useState<any[]>([]);

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

  const buildFieldSet = (policyType?: string) => {
    const standardFields: Record<string, string> = {
      name: 'text',
    };

    if (entityType === 'accounts') {
      standardFields['institution_id'] = 'institution_select';
      standardFields['owner_id'] = 'person_select';
      standardFields['currency'] = 'text';
      standardFields['status'] = 'select_status';
      // Opening balance only applies at creation time: the backend turns this into a
      // one-off "Initial Balance" credit transaction (see create_entity in main.py).
      // Balance afterwards is always derived from the transactions ledger, so this
      // field would silently do nothing on an edit — only show it when adding new.
      if (!initialData) {
        standardFields['current_balance'] = 'number';
      }
    } else if (entityType === 'assets') {
      standardFields['category_id'] = 'category_select';
      if (isInsurance) {
        standardFields['policy_type'] = 'select_policy_type';
        standardFields['institution_id'] = 'institution_select';
        standardFields['policy_number'] = 'text';
        standardFields['premium'] = 'number';
        standardFields['frequency'] = 'text';
        standardFields['renewal_date'] = 'date';
        (INSURANCE_TYPE_FIELDS[policyType || 'Life'] || []).forEach((f) => {
          standardFields[f] = f === 'vehicle_registration' ? 'text' : 'number';
        });
        standardFields['status'] = 'select_status';
        standardFields['owner'] = 'text';
      } else if (isHolding) {
        standardFields['institution_id'] = 'institution_select';
        standardFields['acquisition_date'] = 'date';
        standardFields['current_value'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner'] = 'text';
      } else {
        standardFields['institution_id'] = 'institution_select';
        standardFields['current_value'] = 'number';
        standardFields['invested_amount'] = 'number';
        standardFields['acquisition_date'] = 'date';
        standardFields['status'] = 'select_status';
        standardFields['owner'] = 'text';
        if (isProperty) {
          standardFields['linked_liability_id'] = 'home_loan_select';
        }
      }
      standardFields['goal_mapping'] = 'goal_select';
    } else if (entityType === 'liabilities') {
      if (isCreditCard) {
        standardFields['lender_institution_id'] = 'institution_select';
        standardFields['outstanding'] = 'number';
        standardFields['credit_limit'] = 'number';
        standardFields['statement_balance'] = 'number';
        standardFields['statement_date'] = 'number';
        standardFields['due_date'] = 'number';
        standardFields['annual_fee'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner'] = 'text';
      } else {
        standardFields['lender_institution_id'] = 'institution_select';
        standardFields['outstanding'] = 'number';
        standardFields['interest_rate'] = 'number';
        standardFields['emi'] = 'number';
        standardFields['tenure_months'] = 'number';
        standardFields['status'] = 'select_status';
        standardFields['owner'] = 'text';
        if (isHomeLoan) {
          standardFields['linked_asset_id'] = 'property_select';
        }
      }
    } else if (entityType === 'goals') {
      standardFields['target_amount'] = 'number';
      standardFields['current_amount'] = 'number';
      standardFields['monthly_contribution'] = 'number';
      standardFields['target_date'] = 'date';
      standardFields['priority'] = 'select_priority';
    } else if (entityType === 'income' || entityType === 'expenses') {
      standardFields['amount'] = 'number';
      standardFields['frequency'] = 'text';
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
        defaultData[k] = institutions[0]?.id || '';
      } else if (type === 'person_select') {
        defaultData[k] = people[0]?.id || '';
      } else if (type === 'category_select') {
        defaultData[k] = initialData?.category_id || category?.id || '';
      } else if (type === 'select_status') {
        defaultData[k] = 'Active';
      } else if (type === 'select_priority') {
        defaultData[k] = 'Medium';
      } else if (type === 'select_policy_type') {
        defaultData[k] = 'Life';
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

    if (isProperty && 'linked_liability_id' in standardFields) {
      const linkedLoan = liabilities.find((l) => l.category_name === 'Home Loan' && l.linked_asset_id === initialData?.id);
      defaultData['linked_liability_id'] = linkedLoan?.id || '';
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
    onSubmit(payload);
  };

  const getLabel = (key: string) => {
    if (currentCategory && currentCategory.fields_definition) {
      try {
        const customDefs = typeof currentCategory.fields_definition === 'string'
          ? JSON.parse(currentCategory.fields_definition)
          : currentCategory.fields_definition;
        if (Array.isArray(customDefs)) {
          const found = customDefs.find((item: any) => item && item.name === key);
          if (found && found.label) {
            return found.label;
          }
        }
      } catch (e) {
        // Fallback to normal key split
      }
    }

    const knownLabels: Record<string, string> = {
      linked_liability_id: 'Linked Home Loan',
      linked_asset_id: 'Linked Property',
      sum_assured: 'Sum Assured',
      surrender_value: 'Surrender Value',
      sum_insured: 'Sum Insured',
      claims_made: 'Claims Made',
      claims_amount: 'Claims Amount',
      idv: 'Insured Declared Value (IDV)',
      vehicle_registration: 'Vehicle Registration No.',
      credit_limit: 'Credit Limit',
      statement_balance: 'Statement Balance',
      statement_date: 'Statement Day of Month',
      due_date: 'Due Day of Month',
      annual_fee: 'Annual Fee',
      policy_type: 'Policy Type',
      policy_number: 'Policy Number',
      owner_id: 'Owner',
      current_balance: 'Opening Balance',
    };
    if (knownLabels[key]) return knownLabels[key];

    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Property's "linked_liability_id" is a form-only convenience field: it selects which Home
  // Loan liability should have its linked_asset_id set to this property. There is no
  // linked_liability_id column on assets — liabilities.linked_asset_id is the single source
  // of truth for this relationship (see EntityGrid's dispatchSatelliteData).
  const availableHomeLoans = liabilities.filter(
    (l) => l.category_name === 'Home Loan' && (!l.linked_asset_id || l.linked_asset_id === initialData?.id)
  );
  const availableProperties = properties.filter(
    (p) => !liabilities.some((l) => l.linked_asset_id === p.id && l.id !== initialData?.id)
  );

  return (
    <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '20px' }}>
        {initialData ? 'Modify' : 'Add New'} {currentCategory ? currentCategory.name : getLabel(entityType)}
      </h3>

      {currentCategory && currentCategory.fields_definition && (
        <div style={{
          background: 'rgba(167, 139, 250, 0.05)',
          border: '1px solid rgba(167, 139, 250, 0.15)',
          borderRadius: '8px',
          padding: '12px',
          marginBottom: '20px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}>
          <strong>Category Specifications:</strong> Opens additional custom fields: {' '}
          <span style={{ color: 'var(--accent-light)' }}>
            {(() => {
              try {
                const parsed = typeof currentCategory.fields_definition === 'string'
                  ? JSON.parse(currentCategory.fields_definition)
                  : currentCategory.fields_definition;
                if (Array.isArray(parsed)) {
                  return parsed.map((f: any) => `${f.label || f.name} (${f.type})`).join(', ');
                }
              } catch(e) {}
              return 'None';
            })()}
          </span>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        {Object.keys(fields).map((k) => {
          const type = fields[k];

          if (type === 'institution_select') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, parseInt(e.target.value))}
                  required
                >
                  <option value="">Select Institution</option>
                  {[...institutions].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })).map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'person_select') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, parseInt(e.target.value))}
                  required
                >
                  <option value="">Select Owner</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.role})
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'category_select') {
            const assetCategories = categories ? categories.filter((c) => c.entity_type === 'Asset') : [];
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Asset Class (Category)</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, parseInt(e.target.value))}
                  required
                >
                  <option value="">Select Category</option>
                  {assetCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'goal_select') {
            const activeGoals = goals || [];
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Linked Financial Goal</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, e.target.value)}
                >
                  <option value="">None (Unmapped)</option>
                  {activeGoals.map((g) => (
                    <option key={g.id} value={g.name}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'home_loan_select') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">None</option>
                  {availableHomeLoans.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'property_select') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
                <select
                  className="form-control"
                  value={formData[k] || ''}
                  onChange={(e) => handleChange(k, e.target.value ? parseInt(e.target.value) : null)}
                >
                  <option value="">None</option>
                  {availableProperties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            );
          }

          if (type === 'select_status') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Status</label>
                <select
                  className="form-control"
                  value={formData[k] || 'Active'}
                  onChange={(e) => handleChange(k, e.target.value)}
                >
                  <option value="Active">Active</option>
                  <option value="Closed">Closed</option>
                  <option value="Matured">Matured</option>
                </select>
              </div>
            );
          }

          if (type === 'select_priority') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Priority</label>
                <select
                  className="form-control"
                  value={formData[k] || 'Medium'}
                  onChange={(e) => handleChange(k, e.target.value)}
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
            );
          }

          if (type === 'select_policy_type') {
            return (
              <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Policy Type</label>
                <select
                  className="form-control"
                  value={formData[k] || 'Life'}
                  onChange={(e) => handleChange(k, e.target.value)}
                >
                  <option value="Life">Life</option>
                  <option value="Term">Term</option>
                  <option value="Health">Health</option>
                  <option value="Vehicle">Vehicle</option>
                </select>
              </div>
            );
          }

          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
              <input
                type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                step={type === 'number' ? 'any' : undefined}
                className="form-control"
                value={formData[k] !== undefined ? formData[k] : ''}
                onChange={(e) => handleChange(k, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                required={k === 'name'}
              />
            </div>
          );
        })}

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
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save Entity
        </button>
      </div>
    </form>
  );
};
