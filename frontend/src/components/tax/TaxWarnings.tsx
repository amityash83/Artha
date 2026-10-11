import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { TaxWarning } from '../../types';

/** The engine's checks and notes, warnings first. */
export const WarningList: React.FC<{ warnings: TaxWarning[] }> = ({ warnings }) => {
  if (!warnings.length) return null;
  const sorted = [...warnings].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1));
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {sorted.map((w, i) => (
        <li key={`${w.code}-${w.regime}-${i}`} style={{ display: 'flex', gap: '8px', fontSize: '12px', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {w.severity === 'warning'
            ? <AlertTriangle size={14} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: '2px' }} />
            : <Info size={14} style={{ color: 'var(--info)', flexShrink: 0, marginTop: '2px' }} />}
          <span>{w.regime && <strong style={{ color: 'var(--text-primary)' }}>{w.regime === 'old' ? 'Old regime: ' : 'New regime: '}</strong>}{w.message}</span>
        </li>
      ))}
    </ul>
  );
};
