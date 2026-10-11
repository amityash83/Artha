import React, { useEffect, useState } from 'react';
import { InitData } from '../types';
import { API_BASE_URL } from '../config';
import { formatINR } from '../format';
import { AmountInput, Group, Row } from './settings/ui';

interface SnapshotProps {
  data: InitData;
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Months (YYYY-MM) already recorded, to warn before replacing one. */
  recordedMonths?: string[];
  onCancel: () => void;
  onDone: () => void;
}

const thisMonth = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};
const monthName = (ym: string) => {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : ym;
};

/**
 * Record a month: bring asset values and outstanding balances up to date, then freeze
 * them (with the ledger-derived account balances) as that month's snapshot. Shown in a
 * panel from the Dashboard's net worth card.
 */
export const Snapshot: React.FC<SnapshotProps> = ({ data, onRefresh, showToast, recordedMonths = [], onCancel, onDone }) => {
  const [month, setMonth] = useState(thisMonth);
  const [saving, setSaving] = useState(false);
  // Accounts have no editable balance here: current_balance is derived server-side
  // from the transactions ledger, so it's shown read-only rather than collected as input.
  const [assetValues, setAssetValues] = useState<Record<number, number>>({});
  const [liabilityBalances, setLiabilityBalances] = useState<Record<number, number>>({});

  useEffect(() => {
    setAssetValues(Object.fromEntries(data.assets.map((a) => [a.id, a.current_value || 0])));
    setLiabilityBalances(Object.fromEntries(data.liabilities.map((l) => [l.id, l.outstanding || 0])));
  }, [data]);

  const assetValue = (a: InitData['assets'][number]) => assetValues[a.id] ?? a.current_value ?? 0;
  const owedOn = (l: InitData['liabilities'][number]) => liabilityBalances[l.id] ?? l.outstanding ?? 0;
  const cash = data.accounts.reduce((s, a) => s + (a.current_balance || 0), 0);
  const owned = cash + data.assets.reduce((s, a) => s + assetValue(a), 0);
  const owed = data.liabilities.reduce((s, l) => s + owedOn(l), 0);
  const changed = data.assets.filter((a) => assetValue(a) !== (a.current_value || 0)).length
    + data.liabilities.filter((l) => owedOn(l) !== (l.outstanding || 0)).length;
  const replacing = recordedMonths.includes(month);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    setSaving(true);
    try {
      // Write back only the values that changed; accounts are derived, so never written.
      for (const asset of data.assets) {
        const val = assetValues[asset.id];
        if (val !== undefined && val !== asset.current_value) {
          await fetch(`${API_BASE_URL}/api/entities/assets/${asset.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...asset, current_value: val }),
          });
        }
      }
      for (const liab of data.liabilities) {
        const bal = liabilityBalances[liab.id];
        if (bal !== undefined && bal !== liab.outstanding) {
          await fetch(`${API_BASE_URL}/api/entities/liabilities/${liab.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...liab, outstanding: bal }),
          });
        }
      }

      const snapshotPayload = {
        accounts: data.accounts,
        assets: data.assets.map((a) => ({ ...a, current_value: assetValue(a) })),
        liabilities: data.liabilities.map((l) => ({ ...l, outstanding: owedOn(l) })),
        goals: data.goals,
      };
      const formData = new FormData();
      formData.append('month', month);
      formData.append('snapshot_data_str', JSON.stringify(snapshotPayload));
      const res = await fetch(`${API_BASE_URL}/api/snapshots`, { method: 'POST', body: formData });
      if (res.ok) {
        onRefresh();
        showToast?.(`${monthName(month)} recorded`, 'success');
        onDone();
      } else {
        showToast?.("Couldn't save the snapshot", 'error');
      }
    } catch (err) {
      console.error(err);
      showToast?.("Couldn't save the snapshot", 'error');
    } finally {
      setSaving(false);
    }
  };

  const meta = (kind: string, now: number, before: number) => (
    <>{kind}{now !== before && <> · <span className="snap-was">was {formatINR(before)}</span></>}</>
  );

  return (
    <form className="glass-panel snap" onSubmit={handleSave}>
      <div className="snap-head">
        <div>
          <h2>Record this month</h2>
          <p className="cc-note">Update what each investment is worth and what you still owe, then save. Account balances come from your transactions.</p>
        </div>
        <label className="snap-month">
          <span>Month</span>
          <input type="month" className="form-control" value={month} onChange={(e) => setMonth(e.target.value)} required />
        </label>
      </div>
      {replacing && <p className="snap-warn">{monthName(month)} is already recorded. Saving replaces it.</p>}

      <div className="snap-groups">
        {data.assets.length > 0 && (
          <Group title="Investments and property" description="Today's value of each.">
            {data.assets.map((a) => (
              <Row key={a.id} htmlFor={`snap-a-${a.id}`} label={a.name} description={meta(a.category_name || 'Asset', assetValue(a), a.current_value || 0)}>
                <AmountInput id={`snap-a-${a.id}`} label={`${a.name} value`} prefix="₹" width={130}
                  value={assetValue(a)} onChange={(v) => setAssetValues((s) => ({ ...s, [a.id]: v }))} />
              </Row>
            ))}
          </Group>
        )}

        {data.liabilities.length > 0 && (
          <Group title="Loans and cards" description="What's still outstanding on each.">
            {data.liabilities.map((l) => (
              <Row key={l.id} htmlFor={`snap-l-${l.id}`} label={l.name} description={meta(l.category_name || 'Loan', owedOn(l), l.outstanding || 0)}>
                <AmountInput id={`snap-l-${l.id}`} label={`${l.name} outstanding`} prefix="₹" width={130}
                  value={owedOn(l)} onChange={(v) => setLiabilityBalances((s) => ({ ...s, [l.id]: v }))} />
              </Row>
            ))}
          </Group>
        )}

        {data.accounts.length > 0 && (
          <Group title="Bank accounts" description="Worked out from your transactions; record a transaction to change one.">
            {data.accounts.map((a) => (
              <Row key={a.id} label={a.name} description={a.institution_name || undefined}>
                <span className="snap-readonly">{formatINR(a.current_balance || 0)}</span>
              </Row>
            ))}
          </Group>
        )}

        {data.assets.length + data.liabilities.length + data.accounts.length === 0 && (
          <p className="cc-note">Nothing to record yet. Add accounts, assets or loans first.</p>
        )}
      </div>

      <div className="snap-foot">
        <div>
          <span className="cc-label">Net worth for {monthName(month)}</span>
          <strong className="eg-figure">{formatINR(owned - owed)}</strong>
          <span className="cc-note">{changed === 0 ? 'No values changed' : `${changed} value${changed === 1 ? '' : 's'} updated`}</span>
        </div>
        <div className="snap-actions">
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : replacing ? 'Replace snapshot' : 'Save snapshot'}</button>
        </div>
      </div>
    </form>
  );
};
