import React, { useState, useEffect } from 'react';
import { Category, Institution } from '../types';

interface DynamicFormProps {
  entityType: 'accounts' | 'assets' | 'liabilities' | 'income' | 'expenses' | 'goals';
  category?: Category;
  institutions: Institution[];
  initialData?: any;
  onSubmit: (data: any) => void;
  onCancel: () => void;
}

export const DynamicForm: React.FC<DynamicFormProps> = ({
  entityType,
  category,
  institutions,
  initialData,
  onSubmit,
  onCancel,
}) => {
  const [formData, setFormData] = useState<any>({});
  const [fields, setFields] = useState<Record<string, string>>({});

  useEffect(() => {
    // 1. Establish the standard fields based on entity type
    const standardFields: Record<string, string> = {
      name: 'text',
    };

    if (entityType === 'accounts') {
      standardFields['institution_id'] = 'institution_select';
      standardFields['current_balance'] = 'number';
      standardFields['currency'] = 'text';
      standardFields['status'] = 'select_status';
      standardFields['owner'] = 'text';
      standardFields['tags'] = 'text';
    } else if (entityType === 'assets') {
      standardFields['institution_id'] = 'institution_select';
      standardFields['current_value'] = 'number';
      standardFields['invested_amount'] = 'number';
      standardFields['acquisition_date'] = 'date';
      standardFields['status'] = 'select_status';
      standardFields['owner'] = 'text';
    } else if (entityType === 'liabilities') {
      standardFields['lender_institution_id'] = 'institution_select';
      standardFields['outstanding'] = 'number';
      standardFields['interest_rate'] = 'number';
      standardFields['emi'] = 'number';
      standardFields['tenure_months'] = 'number';
      standardFields['status'] = 'select_status';
      standardFields['owner'] = 'text';
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

    // 2. Append custom fields defined in metadata
    if (category && category.fields_definition) {
      try {
        const customDefs = typeof category.fields_definition === 'string' 
          ? JSON.parse(category.fields_definition) 
          : category.fields_definition;
          
        if (Array.isArray(customDefs)) {
          customDefs.forEach((item: any) => {
            if (item && item.name && !standardFields[item.name]) {
              standardFields[item.name] = item.type || 'text';
            }
          });
        } else if (typeof customDefs === 'object' && customDefs !== null) {
          Object.keys(customDefs).forEach((k) => {
            // Avoid overwriting standard fields
            if (!standardFields[k]) {
              standardFields[k] = customDefs[k];
            }
          });
        }
      } catch (e) {
        console.error("Error parsing fields_definition:", e);
      }
    }

    setFields(standardFields);

    // 3. Populate default or initial values
    const defaultData: any = {};
    Object.keys(standardFields).forEach((k) => {
      const type = standardFields[k];
      if (initialData && initialData[k] !== undefined) {
        defaultData[k] = initialData[k];
      } else if (type === 'number') {
        defaultData[k] = 0;
      } else if (type === 'institution_select') {
        defaultData[k] = institutions[0]?.id || '';
      } else if (type === 'select_status') {
        defaultData[k] = 'Active';
      } else if (type === 'select_priority') {
        defaultData[k] = 'Medium';
      } else {
        defaultData[k] = '';
      }
    });

    // Populate extra fields from metadata if they exist
    if (initialData && initialData.metadata_json) {
      const meta = typeof initialData.metadata_json === 'string'
        ? JSON.parse(initialData.metadata_json)
        : initialData.metadata_json;
      Object.assign(defaultData, meta);
    }

    setFormData(defaultData);
  }, [entityType, category, institutions, initialData]);

  const handleChange = (key: string, val: any) => {
    setFormData((prev: any) => ({
      ...prev,
      [key]: val,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const getLabel = (key: string) => {
    if (category && category.fields_definition) {
      try {
        const customDefs = typeof category.fields_definition === 'string'
          ? JSON.parse(category.fields_definition)
          : category.fields_definition;
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

    return key
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '24px', borderRadius: '12px', border: '1px solid var(--border-glass)' }}>
      <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#f8fafc', marginBottom: '20px' }}>
        {initialData ? 'Modify' : 'Add New'} {category ? category.name : getLabel(entityType)}
      </h3>
      
      {category && category.fields_definition && (
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
                const parsed = typeof category.fields_definition === 'string'
                  ? JSON.parse(category.fields_definition)
                  : category.fields_definition;
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
                  {institutions.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name}
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

          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{getLabel(k)}</label>
              <input
                type={type === 'number' ? 'number' : 'text'}
                step={type === 'number' ? 'any' : undefined}
                className="form-control"
                value={formData[k] !== undefined ? formData[k] : ''}
                onChange={(e) => handleChange(k, type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
                required={k === 'name'}
              />
            </div>
          );
        })}
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
