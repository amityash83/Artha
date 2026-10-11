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

  // Checkboxes, not toggle pills: a highlighted pill didn't read as "excluded".
  return (
    <div className="df-field df-wide">
      <span className="df-label">Never count these kinds of asset towards this goal</span>
      <div className="df-check-grid">
        {assetCategories.map((cat) => (
          <label key={cat.id} className="df-check">
            <input type="checkbox" checked={excludedIds.has(cat.id)} onChange={() => toggleCategory(cat.id, cat.name)} />
            <span>{cat.name}</span>
          </label>
        ))}
      </div>
      <span className="df-hint">
        {constraints.length === 0
          ? 'None ticked: any kind of asset can count towards this goal.'
          : `Ticked kinds never count, whatever else is set. To keep only safe holdings, "Only low-risk holdings" above is usually the better rule.`}
      </span>
    </div>
  );
};
