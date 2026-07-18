import React, { useState } from 'react';
import { Category, Institution, Asset, Liability, Goal, Person } from '../types';
import { DynamicForm } from './DynamicForm';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { API_BASE_URL } from '../config';
import { useModalA11y } from '../hooks/useModalA11y';

interface EntityGridProps {
  entityType: 'accounts' | 'assets' | 'liabilities' | 'income' | 'expenses' | 'goals';
  entities: any[];
  categories: Category[];
  institutions: Institution[];
  people?: Person[];
  goals?: Goal[];
  liabilities?: Liability[];
  properties?: Asset[];
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
}

interface Column {
  label: string;
  key: string;
  alignRight?: boolean;
  suffix?: string;
}

const COMMON_COLUMNS: Record<string, Column[]> = {
  accounts: [
    { label: 'Name', key: 'name' },
    { label: 'Institution', key: 'institution_name' },
    { label: 'Balance', key: 'current_balance', alignRight: true },
    { label: 'Owner', key: 'owner_name' },
    { label: 'Status', key: 'status' },
  ],
  assets: [
    { label: 'Name', key: 'name' },
    { label: 'Category', key: 'category_name' },
    { label: 'Institution', key: 'institution_name' },
    { label: 'Current Value', key: 'current_value', alignRight: true },
    { label: 'Owner', key: 'owner_name' },
  ],
  liabilities: [
    { label: 'Name', key: 'name' },
    { label: 'Category', key: 'category_name' },
    { label: 'Lender', key: 'lender_name' },
    { label: 'Outstanding Balance', key: 'outstanding', alignRight: true },
    { label: 'Owner', key: 'owner_name' },
    { label: 'Status', key: 'status' },
  ],
  goals: [
    { label: 'Goal Name', key: 'name' },
    { label: 'Target Amount', key: 'target_amount', alignRight: true },
    { label: 'Current Amount', key: 'current_amount', alignRight: true },
    { label: 'Monthly SIP', key: 'monthly_contribution', alignRight: true },
    { label: 'Expected Date', key: 'expected_completion' },
  ],
};

const CATEGORY_COLUMNS: Record<string, Column[]> = {
  'Stock': [{ label: 'Ticker', key: 'ticker' }, { label: 'Quantity', key: 'quantity', alignRight: true }, { label: 'XIRR', key: 'xirr', alignRight: true, suffix: '%' }],
  'Mutual Fund': [{ label: 'Scheme Code', key: 'ticker' }, { label: 'Units', key: 'quantity', alignRight: true }, { label: 'XIRR', key: 'xirr', alignRight: true, suffix: '%' }],
  'Insurance': [{ label: 'Policy Type', key: 'policy_type' }, { label: 'Premium', key: 'premium', alignRight: true }],
  'Property': [{ label: 'Rental Income', key: 'rental_income', alignRight: true }],
  'Home Loan': [
    { label: 'Rate (ROI)', key: 'interest_rate', suffix: '%' },
    { label: 'Monthly EMI', key: 'emi', alignRight: true },
  ],
  'Personal Loan': [
    { label: 'Rate (ROI)', key: 'interest_rate', suffix: '%' },
    { label: 'Monthly EMI', key: 'emi', alignRight: true },
  ],
  'Car Loan': [
    { label: 'Rate (ROI)', key: 'interest_rate', suffix: '%' },
    { label: 'Monthly EMI', key: 'emi', alignRight: true },
  ],
  'Credit Card': [
    { label: 'Credit Limit', key: 'credit_limit', alignRight: true },
    { label: 'Due Date', key: 'due_date' },
  ],
};

export const EntityGrid: React.FC<EntityGridProps> = ({
  entityType,
  entities,
  categories,
  institutions,
  people = [],
  goals,
  liabilities = [],
  properties = [],
  onRefresh,
  showToast,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingEntityId, setDeletingEntityId] = useState<number | null>(null);
  const modalRef = useModalA11y(isAdding || !!editingEntity, () => {
    setIsAdding(false);
    setEditingEntity(null);
  });

  const typeCategories = categories.filter((c) => c.entity_type.toLowerCase() === entityType.replace(/s$/, '').toLowerCase());

  // Filter entities
  const filteredEntities = entities.filter((e) => {
    const matchesCategory = selectedCategoryId === 'all' || e.category_id === selectedCategoryId;
    const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.institution_name && e.institution_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.lender_name && e.lender_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/${entityType}/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
        const singularType = entityType.replace(/s$/, '');
        if (showToast) showToast(`${singularType.charAt(0).toUpperCase() + singularType.slice(1)} deleted successfully!`, "success");
      } else {
        if (showToast) showToast('Failed to delete entity', "error");
        else alert('Failed to delete entity');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const dispatchSatelliteData = async (entityId: number, categoryName: string | undefined, formData: any) => {
    if (entityType === 'goals') {
      const existing = await fetch(`${API_BASE_URL}/api/goals/${entityId}/funding-constraints`).then((r) => r.json());
      const existingIds = new Set(existing.map((c: any) => c.excluded_category_id));
      const submittedIds = new Set((formData.funding_constraints || []).map((c: any) => c.excluded_category_id));

      for (const categoryId of submittedIds) {
        if (!existingIds.has(categoryId)) {
          await fetch(`${API_BASE_URL}/api/goals/${entityId}/funding-constraints`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ excluded_category_id: categoryId }),
          });
        }
      }
      for (const categoryId of existingIds) {
        if (!submittedIds.has(categoryId)) {
          await fetch(`${API_BASE_URL}/api/goals/${entityId}/funding-constraints/${categoryId}`, { method: 'DELETE' });
        }
      }
    }
    if (entityType === 'assets' && categoryName === 'Insurance') {
      await fetch(`${API_BASE_URL}/api/assets/${entityId}/insurance-details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          policy_type: formData.policy_type || 'Life',
          policy_number: formData.policy_number || '',
          premium: formData.premium || 0,
          frequency: formData.frequency || 'Yearly',
          renewal_date: formData.renewal_date || null,
          sum_assured: formData.sum_assured || 0,
          surrender_value: formData.surrender_value || 0,
          sum_insured: formData.sum_insured || 0,
          claims_made: formData.claims_made || 0,
          claims_amount: formData.claims_amount || 0,
          idv: formData.idv || 0,
          vehicle_registration: formData.vehicle_registration || '',
        }),
      });

      const existingClaims = await fetch(`${API_BASE_URL}/api/assets/${entityId}/insurance-claims`).then((r) => r.json());
      const existingClaimIds = new Set(existingClaims.map((c: any) => c.id));
      const submittedClaimIds = new Set((formData.insurance_claims || []).filter((c: any) => c.id).map((c: any) => c.id));
      for (const claim of formData.insurance_claims || []) {
        const body = JSON.stringify({
          claim_date: claim.claim_date,
          claim_amount: claim.claim_amount,
          status: claim.status || 'Filed',
          description: claim.description || '',
        });
        if (claim.id) {
          await fetch(`${API_BASE_URL}/api/insurance-claims/${claim.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        } else {
          await fetch(`${API_BASE_URL}/api/assets/${entityId}/insurance-claims`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        }
      }
      for (const existingId of existingClaimIds) {
        if (!submittedClaimIds.has(existingId)) {
          await fetch(`${API_BASE_URL}/api/insurance-claims/${existingId}`, { method: 'DELETE' });
        }
      }

      const existingPayments = await fetch(`${API_BASE_URL}/api/assets/${entityId}/premium-payments`).then((r) => r.json());
      const existingPaymentIds = new Set(existingPayments.map((p: any) => p.id));
      const submittedPaymentIds = new Set((formData.premium_payments || []).filter((p: any) => p.id).map((p: any) => p.id));
      for (const payment of formData.premium_payments || []) {
        const body = JSON.stringify({
          payment_date: payment.payment_date,
          amount: payment.amount,
          notes: payment.notes || '',
        });
        if (payment.id) {
          await fetch(`${API_BASE_URL}/api/premium-payments/${payment.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        } else {
          await fetch(`${API_BASE_URL}/api/assets/${entityId}/premium-payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        }
      }
      for (const existingId of existingPaymentIds) {
        if (!submittedPaymentIds.has(existingId)) {
          await fetch(`${API_BASE_URL}/api/premium-payments/${existingId}`, { method: 'DELETE' });
        }
      }
    } else if (entityType === 'assets' && categoryName === 'Property') {
      const existingEntries = await fetch(`${API_BASE_URL}/api/assets/${entityId}/rental-entries`).then((r) => r.json());
      const existingEntryIds = new Set(existingEntries.map((e: any) => e.id));
      const submittedEntryIds = new Set((formData.rental_ledger || []).filter((e: any) => e.id).map((e: any) => e.id));
      for (const entry of formData.rental_ledger || []) {
        const body = JSON.stringify({
          month: entry.month,
          rent_amount: entry.rent_amount,
          expenses_amount: entry.expenses_amount,
          notes: entry.notes || '',
        });
        if (entry.id) {
          await fetch(`${API_BASE_URL}/api/rental-entries/${entry.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        } else {
          await fetch(`${API_BASE_URL}/api/assets/${entityId}/rental-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        }
      }
      for (const existingId of existingEntryIds) {
        if (!submittedEntryIds.has(existingId)) {
          await fetch(`${API_BASE_URL}/api/rental-entries/${existingId}`, { method: 'DELETE' });
        }
      }
    } else if (entityType === 'assets' && (categoryName === 'Stock' || categoryName === 'Mutual Fund')) {
      const existingLots = await fetch(`${API_BASE_URL}/api/assets/${entityId}/holdings`).then((r) => r.json());
      const existingIds = new Set(existingLots.map((l: any) => l.id));
      const submittedIds = new Set((formData.holding_lots || []).filter((l: any) => l.id).map((l: any) => l.id));

      for (const lot of formData.holding_lots || []) {
        const body = JSON.stringify({
          purchase_date: lot.purchase_date,
          quantity: lot.quantity,
          price_per_unit: lot.price_per_unit,
          notes: lot.notes || '',
        });
        if (lot.id) {
          await fetch(`${API_BASE_URL}/api/holdings/${lot.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
        } else {
          await fetch(`${API_BASE_URL}/api/assets/${entityId}/holdings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
        }
      }
      for (const existingId of existingIds) {
        if (!submittedIds.has(existingId)) {
          await fetch(`${API_BASE_URL}/api/holdings/${existingId}`, { method: 'DELETE' });
        }
      }
    } else if (entityType === 'liabilities' && categoryName === 'Credit Card') {
      await fetch(`${API_BASE_URL}/api/liabilities/${entityId}/credit-card-details`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credit_limit: formData.credit_limit || 0,
          statement_balance: formData.statement_balance || 0,
          statement_date: formData.statement_date || null,
          due_date: formData.due_date || null,
          annual_fee: formData.annual_fee || 0,
          reward_points: formData.reward_points || 0,
          point_value: formData.point_value || 0.25,
        }),
      });
    }

    // Property -> Home Loan link: liabilities.linked_asset_id is the single source of
    // truth for this relationship (assets has no linked_liability_id column), so this is
    // only ever written from the Property side. When editing from the Home Loan side,
    // formData.linked_asset_id is already part of the primary liability save above —
    // no second write is needed or valid here.
    if (entityType === 'assets' && categoryName === 'Property' && formData.linked_liability_id) {
      await fetch(`${API_BASE_URL}/api/entities/liabilities/${formData.linked_liability_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ linked_asset_id: entityId }),
      });
    }
  };

  const handleFormSubmit = async (formData: any) => {
    try {
      const isEdit = !!editingEntity;
      const url = isEdit
        ? `${API_BASE_URL}/api/entities/${entityType}/${editingEntity.id}`
        : `${API_BASE_URL}/api/entities/${entityType}`;

      // Ensure category_id is set if not 'all'
      if (!formData.category_id && selectedCategoryId !== 'all') {
        formData.category_id = selectedCategoryId;
      } else if (!formData.category_id && typeCategories.length > 0) {
        formData.category_id = typeCategories[0].id;
      }

      const categoryName = categories.find((c) => c.id === formData.category_id)?.name;
      const { holding_lots, funding_constraints, rental_ledger, insurance_claims, premium_payments, ...primaryPayload } = formData;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryPayload),
      });

      if (res.ok) {
        const data = await res.json();
        const entityId = isEdit ? editingEntity.id : data.id;
        await dispatchSatelliteData(entityId, categoryName, formData);
        setIsAdding(false);
        setEditingEntity(null);
        onRefresh();
        const singularType = entityType.replace(/s$/, '');
        if (showToast) showToast(`${singularType.charAt(0).toUpperCase() + singularType.slice(1)} saved successfully!`, "success");
      } else {
        const errorData = await res.json();
        const msg = `Error saving entity: ${errorData.detail || 'Unknown error'}`;
        if (showToast) showToast(msg, "error");
        else alert(msg);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getFormatValue = (val: any) => {
    if (typeof val === 'number') {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);
    }
    return val?.toString() || '—';
  };

  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

  // Determine key columns: common columns for the entity type, plus category-specific
  // columns appended when a single category is selected (not "All Categories").
  const getColumns = (): Column[] => {
    const common = COMMON_COLUMNS[entityType] || [{ label: 'Name', key: 'name' }];
    if (activeCategory && CATEGORY_COLUMNS[activeCategory.name]) {
      return [...common, ...CATEGORY_COLUMNS[activeCategory.name]];
    }
    return common;
  };
  const columns = getColumns();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: 'Inter, sans-serif' }}>

      {/* Upper Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#f8fafc', textTransform: 'capitalize' }}>
            {entityType}
          </h2>
          <span style={{ fontSize: '12px', background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa', padding: '4px 10px', borderRadius: '20px', fontWeight: 500 }}>
            {filteredEntities.length} Total
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Search bar */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Search..."
              className="form-control"
              style={{ paddingLeft: '36px', width: '220px', fontSize: '13px' }}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <button
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
            onClick={() => {
              setEditingEntity(null);
              setIsAdding(true);
            }}
          >
            <Plus size={16} /> Add Entity
          </button>
        </div>
      </div>

      {/* Visual Goal Timeline Planner */}
      {entityType === 'goals' && entities.length > 0 && (
        <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#f8fafc', marginBottom: '20px' }}>
            Goal Milestones Chronological Timeline
          </h3>
          <div style={{ display: 'flex', gap: '32px', paddingBottom: '16px', position: 'relative', minWidth: 'max-content' }}>
            {/* The Timeline connection line */}
            <div style={{
              position: 'absolute',
              top: '40px',
              left: '20px',
              right: '20px',
              height: '3px',
              background: 'linear-gradient(90deg, #8b5cf6 0%, #10b981 100%)',
              opacity: 0.3,
              zIndex: 1
            }}></div>

            {[...entities]
              .sort((a, b) => {
                if (a.expected_date === 'Never') return 1;
                if (b.expected_date === 'Never') return -1;
                return new Date(a.expected_date).getTime() - new Date(b.expected_date).getTime();
              })
              .map((goal) => {
                const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
                const formattedTarget = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(goal.target_amount);
                const formattedCurrent = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(goal.current_amount);
                
                let dateStr = 'Never';
                if (goal.expected_date && goal.expected_date !== 'Never') {
                  const d = new Date(goal.expected_date);
                  dateStr = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                }

                return (
                  <div key={goal.id} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '220px' }}>
                    {/* Timeline Node dot */}
                    <div style={{
                      width: '18px',
                      height: '18px',
                      borderRadius: '50%',
                      background: goal.expected_date === 'Never' ? 'var(--danger)' : '#10b981',
                      border: '4px solid #0f172a',
                      boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
                      marginBottom: '20px'
                    }}></div>

                    {/* Card box */}
                    <div className="glass-card" style={{
                      width: '100%',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: '10px',
                      transition: 'transform 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                          {dateStr}
                        </span>
                        <span style={{
                          fontSize: '9px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 600,
                          background: goal.priority === 'High' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: goal.priority === 'High' ? 'var(--danger-light)' : 'var(--warning-light)'
                        }}>
                          {goal.priority}
                        </span>
                      </div>

                      <h4 style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={goal.name}>
                        {goal.name}
                      </h4>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: 'var(--text-secondary)' }}>
                        <span>Current: {formattedCurrent}</span>
                        <span>Target: {formattedTarget}</span>
                      </div>

                      {/* Progress Bar */}
                      <div style={{ height: '5px', background: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                        <div style={{
                          width: `${Math.min(progress, 100)}%`,
                          height: '100%',
                          background: 'linear-gradient(90deg, #3b82f6 0%, #10b981 100%)',
                          boxShadow: '0 0 8px rgba(16, 185, 129, 0.3)'
                        }}></div>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: 'var(--text-muted)' }}>
                        <span>Progress</span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Category Tabs (Dynamic Filters) */}
      {typeCategories.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '12px', overflowX: 'auto' }}>
          <button
            className={`btn ${selectedCategoryId === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 16px', fontSize: '12px', borderRadius: '20px' }}
            onClick={() => setSelectedCategoryId('all')}
          >
            All Categories
          </button>
          {typeCategories.map((cat) => (
            <button
              key={cat.id}
              className={`btn ${selectedCategoryId === cat.id ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 16px', fontSize: '12px', borderRadius: '20px' }}
              onClick={() => setSelectedCategoryId(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Modal/Form overlay */}
      {(isAdding || editingEntity) && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(7, 9, 14, 0.8)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div
            style={{ width: '100%', maxWidth: '600px' }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label="Edit entity form"
            tabIndex={-1}
          >
            <DynamicForm
              entityType={entityType}
              category={activeCategory || typeCategories[0]}
              categories={categories}
              institutions={institutions}
              people={people}
              goals={goals}
              initialData={editingEntity}
              liabilities={liabilities}
              properties={properties}
              onSubmit={handleFormSubmit}
              onCancel={() => {
                setIsAdding(false);
                setEditingEntity(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="table-responsive card" style={{ padding: '16px', borderRadius: '12px' }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{
                    color: 'var(--text-muted)',
                    fontWeight: 600,
                    fontSize: '12px',
                    padding: '12px 16px',
                    textAlign: col.alignRight ? 'right' : 'left'
                  }}
                >
                  {col.label}
                </th>
              ))}
              <th style={{ color: 'var(--text-muted)', fontWeight: 600, fontSize: '12px', padding: '12px 16px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntities.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No entities found matching active filters.
                </td>
              </tr>
            ) : (
              filteredEntities.map((ent) => (
                <tr key={ent.id} style={{ borderBottom: '1px solid var(--border-glass)' }} className="table-row">
                  {columns.map((col) => {
                    const rawVal = ent[col.key];
                    const val = col.suffix ? `${rawVal}${col.suffix}` : getFormatValue(rawVal);
                    return (
                      <td
                        key={col.key}
                        style={{
                          fontSize: '13px',
                          color: '#e2e8f0',
                          padding: '14px 16px',
                          textAlign: col.alignRight ? 'right' : 'left'
                        }}
                      >
                        {val}
                      </td>
                    );
                  })}
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      {deletingEntityId === ent.id ? (
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                          <span style={{ color: 'var(--danger-light)', fontSize: '11px', fontWeight: 500 }}>Confirm?</span>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                            onClick={() => {
                              handleDelete(ent.id);
                              setDeletingEntityId(null);
                            }}
                          >
                            Yes
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '3px 8px', fontSize: '10px', minWidth: 'auto', borderRadius: '6px' }}
                            onClick={() => setDeletingEntityId(null)}
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                            onClick={() => setEditingEntity(ent)}
                          >
                            <Edit2 size={13} style={{ color: '#a78bfa' }} />
                          </button>
                          <button
                            className="btn btn-secondary"
                            style={{ padding: '6px', minWidth: 'auto', borderRadius: '8px' }}
                            onClick={() => setDeletingEntityId(ent.id)}
                          >
                            <Trash2 size={13} style={{ color: '#ef4444' }} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};
