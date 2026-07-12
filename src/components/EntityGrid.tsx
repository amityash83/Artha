import React, { useState } from 'react';
import { Category, Institution } from '../types';
import { DynamicForm } from './DynamicForm';
import { Plus, Edit2, Trash2, Search } from 'lucide-react';
import { API_BASE_URL } from '../config';

interface EntityGridProps {
  entityType: 'accounts' | 'assets' | 'liabilities' | 'income' | 'expenses' | 'goals';
  entities: any[];
  categories: Category[];
  institutions: Institution[];
  onRefresh: () => void;
}

export const EntityGrid: React.FC<EntityGridProps> = ({
  entityType,
  entities,
  categories,
  institutions,
  onRefresh,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  // Filter categories by the corresponding entity type
  const typeCategories = categories.filter((c) => c.entity_type.toLowerCase() === entityType.replace(/s$/, '').toLowerCase() || (entityType === 'accounts' && c.entity_type === 'Asset')); // accounts seed under Asset institution details

  // Filter entities
  const filteredEntities = entities.filter((e) => {
    const matchesCategory = selectedCategoryId === 'all' || e.category_id === selectedCategoryId;
    const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (e.institution_name && e.institution_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (e.lender_name && e.lender_name.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this entity?')) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/entities/${entityType}/${id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
      } else {
        alert('Failed to delete entity');
      }
    } catch (err) {
      console.error(err);
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

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setIsAdding(false);
        setEditingEntity(null);
        onRefresh();
      } else {
        const errorData = await res.json();
        alert(`Error saving entity: ${errorData.detail || 'Unknown error'}`);
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

  // Determine key columns depending on entity type
  const getColumns = () => {
    if (entityType === 'accounts') {
      return [
        { label: 'Name', key: 'name' },
        { label: 'Institution', key: 'institution_name' },
        { label: 'Balance', key: 'current_balance', alignRight: true },
        { label: 'Owner', key: 'owner' },
        { label: 'Status', key: 'status' },
      ];
    } else if (entityType === 'assets') {
      return [
        { label: 'Name', key: 'name' },
        { label: 'Category', key: 'category_name' },
        { label: 'Institution', key: 'institution_name' },
        { label: 'Current Value', key: 'current_value', alignRight: true },
        { label: 'Invested', key: 'invested_amount', alignRight: true },
        { label: 'Owner', key: 'owner' },
      ];
    } else if (entityType === 'liabilities') {
      return [
        { label: 'Name', key: 'name' },
        { label: 'Category', key: 'category_name' },
        { label: 'Lender', key: 'lender_name' },
        { label: 'Outstanding Balance', key: 'outstanding', alignRight: true },
        { label: 'Rate (ROI)', key: 'interest_rate', suffix: '%' },
        { label: 'Monthly EMI', key: 'emi', alignRight: true },
        { label: 'Status', key: 'status' },
      ];
    } else if (entityType === 'goals') {
      return [
        { label: 'Goal Name', key: 'name' },
        { label: 'Target Amount', key: 'target_amount', alignRight: true },
        { label: 'Current Amount', key: 'current_amount', alignRight: true },
        { label: 'Monthly SIP', key: 'monthly_contribution', alignRight: true },
        { label: 'Expected Date', key: 'expected_completion' },
      ];
    }
    return [{ label: 'Name', key: 'name' }];
  };

  const activeCategory = categories.find((c) => c.id === selectedCategoryId);

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
          <div style={{ width: '100%', maxWidth: '600px' }}>
            <DynamicForm
              entityType={entityType}
              category={activeCategory || typeCategories[0]}
              institutions={institutions}
              initialData={editingEntity}
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
              {getColumns().map((col) => (
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
                <td colSpan={getColumns().length + 1} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  No entities found matching active filters.
                </td>
              </tr>
            ) : (
              filteredEntities.map((ent) => (
                <tr key={ent.id} style={{ borderBottom: '1px solid var(--border-glass)' }} className="table-row">
                  {getColumns().map((col) => {
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
                        onClick={() => handleDelete(ent.id)}
                      >
                        <Trash2 size={13} style={{ color: '#ef4444' }} />
                      </button>
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
