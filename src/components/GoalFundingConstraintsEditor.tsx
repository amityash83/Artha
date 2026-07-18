import React from 'react';
import { Category } from '../types';

interface GoalFundingConstraint {
  excluded_category_id: number;
  category_name?: string;
}

interface GoalFundingConstraintsEditorProps {
  categories: Category[];
  constraints: GoalFundingConstraint[];
  onChange: (constraints: GoalFundingConstraint[]) => void;
}

export const GoalFundingConstraintsEditor: React.FC<GoalFundingConstraintsEditorProps> = ({
  categories,
  constraints,
  onChange,
}) => {
  const assetCategories = categories.filter((c) => c.entity_type === 'Asset');
  const excludedIds = new Set(constraints.map((c) => c.excluded_category_id));

  const toggleCategory = (categoryId: number, categoryName: string) => {
    if (excludedIds.has(categoryId)) {
      onChange(constraints.filter((c) => c.excluded_category_id !== categoryId));
    } else {
      onChange([...constraints, { excluded_category_id: categoryId, category_name: categoryName }]);
    }
  };

  return (
    <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <label style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        Funding Restrictions — never fund this goal from these asset categories
      </label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {assetCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            className={`btn ${excludedIds.has(cat.id) ? 'btn-primary' : 'btn-secondary'}`}
            style={{ padding: '6px 14px', fontSize: '12px', borderRadius: '20px' }}
            onClick={() => toggleCategory(cat.id, cat.name)}
          >
            {cat.name}
          </button>
        ))}
      </div>
      {constraints.length === 0 ? (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          No restrictions — this goal can be funded from any asset category.
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
          Excluded: {constraints.map((c) => c.category_name).join(', ')}
        </div>
      )}
    </div>
  );
};
