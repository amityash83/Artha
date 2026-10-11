import React, { useEffect, useState } from 'react';
import { Account, Category, Institution, Asset, Liability, Goal, Person } from '../types';
import { DynamicForm } from './DynamicForm';
import { Plus, Search } from 'lucide-react';
import { ConfirmAction } from './settings/ui';
import { formatDate, formatINR } from '../format';
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
  /** Bank accounts, for a loan's "Paid from" (automatic EMIs). */
  accounts?: Account[];
  onRefresh: () => void;
  showToast?: (msg: string, type: 'success' | 'error' | 'info') => void;
  /** Open the add form (from "+ New", Go-to search or the desktop menu); each new value re-opens it. */
  addRequest?: number;
  /** Filter to a record (Go-to search). */
  searchSeed?: { text: string; nonce: number } | null;
}

// Page wording for each kind of record this grid shows.
const PAGE_TEXT: Record<EntityGridProps['entityType'], { title: string; noun: string; intro: string; add: string; empty: string }> = {
  accounts: { noun: 'Account', title: 'Accounts', intro: 'Bank accounts and wallets. Balances are worked out from your transactions.', add: 'Add account', empty: 'No accounts yet. Add your bank accounts to start tracking balances.' },
  assets: { noun: 'Asset', title: 'Assets', intro: 'What you own: investments, property, insurance, gold and more.', add: 'Add asset', empty: 'No assets yet. Add investments, property or insurance policies.' },
  liabilities: { noun: 'Loan', title: 'Liabilities', intro: 'What you owe: home, car and personal loans, and credit cards.', add: 'Add loan', empty: 'No loans yet.' },
  income: { noun: 'Income', title: 'Income', intro: 'Regular income.', add: 'Add income', empty: 'No income entries yet.' },
  expenses: { noun: 'Expense', title: 'Expenses', intro: 'Regular expenses.', add: 'Add expense', empty: 'No expense entries yet.' },
  goals: { noun: 'Goal', title: 'Goals', intro: "What you're saving for, and how far along you are.", add: 'Add goal', empty: 'No goals yet. Add one, for example an emergency fund or a child\'s education.' },
};

type Kind = EntityGridProps['entityType'];

const CARD_CATEGORIES = ['Credit Card'];
// categories.entity_type for each kind ("liabilities" doesn't singularise by dropping the s).
const CATEGORY_ENTITY_TYPE: Record<Kind, string> = { accounts: 'account', assets: 'asset', liabilities: 'liability', income: 'income', expenses: 'expense', goals: 'goal' };
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
const units = (n: number, category: string) => `${n.toLocaleString('en-IN', { maximumFractionDigits: 3 })} ${category === 'Stock' ? (n === 1 ? 'share' : 'shares') : n === 1 ? 'unit' : 'units'}`;
const monthYear = (iso: string) => {
  const m = /^(\d{4})-(\d{2})/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) : '';
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;
const yearsLeft = (months: number) => (months < 12 ? `${Math.ceil(months)} months left` : `${(months / 12).toFixed(months < 120 ? 1 : 0)} years left`);

/** The figure each kind of record is listed and totalled by. */
const valueOf = (kind: Kind, e: any): number => {
  if (kind === 'accounts') return num(e.current_balance);
  if (kind === 'assets') return num(e.current_value);
  if (kind === 'liabilities') return num(e.outstanding);
  if (kind === 'goals') return num(e.current_amount);
  return num(e.amount);
};

/** The short line under a record's name: only the details that matter for its category. */
const metaOf = (kind: Kind, e: any, showOwner: boolean, entitiesById: Map<number, any> = new Map()): string => {
  const cat = e.category_name || '';
  const parts: (string | null | undefined)[] = [];
  if (kind === 'accounts') {
    parts.push(e.institution_name, e.status && e.status !== 'Active' ? e.status : null);
  } else if (kind === 'assets') {
    if (cat === 'Stock' || cat === 'Mutual Fund') {
      parts.push(cat === 'Mutual Fund' && e.fund_type ? `${String(e.fund_type).toLowerCase()} fund` : null, e.ticker, num(e.quantity) > 0 && num(e.cost_price) > 0 ? units(num(e.quantity), cat) : num(e.quantity) > 0 ? 'add purchase lots for units and return' : null,
        e.xirr != null && num(e.quantity) > 0 && num(e.cost_price) > 0 ? `${num(e.xirr).toFixed(1)}% a year` : null);
    } else if (cat === 'Insurance') {
      parts.push(e.policy_type, e.institution_name, num(e.cover) > 0 ? `cover ${formatINR(e.cover)}` : null,
        num(e.premium) > 0 ? `premium ${formatINR(e.premium)}${e.frequency ? ` ${String(e.frequency).toLowerCase()}` : ''}` : null,
        e.renewal_date ? `renews ${formatDate(e.renewal_date)}` : null);
    } else if (cat === 'Property') {
      parts.push(num(e.rental_income) > 0 ? `rent ${formatINR(e.rental_income)}/mo` : null);
    } else if (cat === 'EPF') {
      parts.push(e.employer_name, e.transfer_status === 'Unmerged' ? 'not merged yet' : e.transfer_status === 'Transferred' ? 'transferred' : null,
        e.member_id ? `member ${e.member_id}` : null, e.balance_as_of ? `as of ${formatDate(e.balance_as_of)}` : null);
    } else {
      parts.push(e.institution_name);
    }
  } else if (kind === 'liabilities') {
    if (cat === 'Credit Card') {
      parts.push(e.lender_name, num(e.credit_limit) > 0 ? `limit ${formatINR(e.credit_limit)}` : null, e.due_date ? `due on the ${e.due_date}` : null);
    } else {
      const movedTo = e.transferred_to ? entitiesById.get(Number(e.transferred_to))?.name : null;
      parts.push(e.lender_name, movedTo ? `moved to ${movedTo}` : null, e.loan_use === 'repair' ? 'for repairs' : e.loan_use === 'other' ? 'not for the house' : null,
        num(e.house_share_pct) > 0 && num(e.house_share_pct) < 100 ? `${num(e.house_share_pct)}% for the house` : null,
        num(e.interest_rate) > 0 ? `${num(e.interest_rate)}%` : null,
        num(e.emi) > 0 ? `EMI ${formatINR(e.emi)}${num(e.emi_day) > 0 ? ` on the ${ordinal(num(e.emi_day))}` : ''}` : null,
        num(e.remaining_tenure) > 0 ? yearsLeft(num(e.remaining_tenure)) : null);
    }
  } else if (kind === 'goals') {
    parts.push(e.priority ? `${e.priority} priority` : null, e.low_risk_only ? 'low-risk only' : null, num(e.monthly_contribution) > 0 ? `${formatINR(e.monthly_contribution)}/mo` : null,
      e.target_date ? `aim ${monthYear(e.target_date)}` : null);
  }
  if (showOwner) parts.push(e.owner_name);
  return parts.filter(Boolean).join(' · ');
};

/** Goal outlook from /api/init's expected_date ("Never" when nothing is being put in). */
const goalOutlook = (g: any): { text: string; late: boolean } => {
  const gap = num(g.target_amount) - num(g.current_amount);
  if (gap <= 0) return { text: 'Reached', late: false };
  if (!g.expected_date || g.expected_date === 'Never') return { text: 'Add a monthly amount to get there', late: true };
  const when = monthYear(g.expected_date);
  if (!when) return { text: 'Too far off at this pace', late: true };
  const late = !!g.target_date && g.expected_date > g.target_date;
  return { text: `${late ? 'Late: ' : ''}reached by ${when}`, late };
};

const Summary: React.FC<{ kind: Kind; items: any[] }> = ({ kind, items }) => {
  const sum = (f: (e: any) => number) => items.reduce((t, e) => t + f(e), 0);
  const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  let main: React.ReactNode;
  let stats: { label: string; value: string; note: string }[] = [];
  if (kind === 'accounts') {
    const active = items.filter((e) => !e.status || e.status === 'Active');
    main = <><div className="cc-label">Total balance</div><strong className="eg-figure">{formatINR(sum((e) => valueOf(kind, e)))}</strong>
      <span className="cc-note">across {count(active.length, 'active account', 'active accounts')}</span></>;
    const top = [...items].sort((a, b) => valueOf(kind, b) - valueOf(kind, a))[0];
    stats = [
      { label: 'Largest balance', value: top ? formatINR(valueOf(kind, top)) : '—', note: top?.name ?? '' },
      { label: 'Below zero', value: String(items.filter((e) => valueOf(kind, e) < 0).length), note: 'accounts overdrawn' },
    ];
  } else if (kind === 'assets') {
    const total = sum((e) => valueOf(kind, e));
    const holdings = items.filter((e) => e.category_name === 'Stock' || e.category_name === 'Mutual Fund');
    const cover = sum((e) => (e.category_name === 'Insurance' ? num(e.cover) : 0));
    main = <><div className="cc-label">Total value</div><strong className="eg-figure">{formatINR(total)}</strong>
      <span className="cc-note">{count(items.length, 'asset', 'assets')}</span></>;
    stats = [
      { label: 'Stocks and funds', value: formatINR(sum((e) => (holdings.includes(e) ? valueOf(kind, e) : 0))), note: total > 0 ? `${Math.round((sum((e) => (holdings.includes(e) ? valueOf(kind, e) : 0)) / total) * 100)}% of the total` : '' },
      { label: 'Insurance cover', value: formatINR(cover), note: count(items.filter((e) => e.category_name === 'Insurance').length, 'policy', 'policies') },
    ];
  } else if (kind === 'liabilities') {
    const loans = items.filter((e) => !CARD_CATEGORIES.includes(e.category_name));
    main = <><div className="cc-label">Total owed</div><strong className="eg-figure">{formatINR(sum((e) => valueOf(kind, e)))}</strong>
      <span className="cc-note">{count(loans.length, 'loan', 'loans')}{items.length > loans.length ? ` and ${count(items.length - loans.length, 'card', 'cards')}` : ''}</span></>;
    const dearest = [...loans].filter((e) => num(e.outstanding) > 0).sort((a, b) => num(b.interest_rate) - num(a.interest_rate))[0];
    stats = [
      { label: 'EMIs each month', value: formatINR(sum((e) => (loans.includes(e) && num(e.outstanding) > 0 ? num(e.emi) : 0))), note: 'on loans still running' },
      { label: 'Interest still to pay', value: formatINR(sum((e) => num(e.remaining_interest))), note: 'if you keep paying the EMI' },
      { label: 'Highest rate', value: dearest ? `${num(dearest.interest_rate)}%` : '—', note: dearest?.name ?? '' },
    ];
  } else if (kind === 'goals') {
    const saved = sum((e) => num(e.current_amount));
    const target = sum((e) => num(e.target_amount));
    const behind = items.filter((g) => goalOutlook(g).late).length;
    main = <><div className="cc-label">Saved towards your goals</div>
      <strong className="eg-figure">{formatINR(saved)} <span>of {formatINR(target)}</span></strong>
      <div className="cc-meter"><div style={{ width: `${target > 0 ? Math.min((saved / target) * 100, 100) : 0}%`, background: 'var(--accent)' }} /></div></>;
    stats = [
      { label: 'Going in each month', value: formatINR(sum((e) => num(e.monthly_contribution))), note: 'planned contributions' },
      { label: 'Need attention', value: String(behind), note: behind === 1 ? 'goal is late or unfunded' : 'goals late or unfunded' },
    ];
  }
  return (
    <div className="glass-panel cc-summary eg-summary" style={{ gridTemplateColumns: `minmax(240px, 2fr) repeat(${stats.length}, minmax(140px, 1fr))` }}>
      <div className="cc-summary-main">{main}</div>
      {stats.map((s) => (
        <div key={s.label} className="cc-summary-stat">
          <div className="cc-label">{s.label}</div>
          <strong>{s.value}</strong>
          <span className="cc-note" title={s.note}>{s.note}</span>
        </div>
      ))}
    </div>
  );
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
  accounts = [],
  onRefresh,
  showToast,
  addRequest,
  searchSeed,
}) => {
  const [searchQuery, setSearchQuery] = useState(searchSeed?.text ?? '');
  const [editingEntity, setEditingEntity] = useState<any | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Category the add form opens on (a group's "Add" link or an empty-state button).
  const [addCategory, setAddCategory] = useState<Category | undefined>(undefined);
  const closeForm = () => { setIsAdding(false); setEditingEntity(null); };
  const modalRef = useModalA11y(isAdding || !!editingEntity, closeForm);
  const startAdd = (category?: Category) => { setEditingEntity(null); setAddCategory(category); setIsAdding(true); };

  useEffect(() => {
    if (addRequest) startAdd();
  }, [addRequest]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (searchSeed) setSearchQuery(searchSeed.text);
  }, [searchSeed?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const typeCategories = categories.filter((c) => c.entity_type.toLowerCase() === CATEGORY_ENTITY_TYPE[entityType]);

  const query = searchQuery.trim().toLowerCase();
  const visible = entities.filter((e) => !query || [e.name, e.institution_name, e.lender_name, e.category_name, e.owner_name]
    .some((v) => typeof v === 'string' && v.toLowerCase().includes(query)));
  const showOwner = new Set(entities.map((e) => e.owner_name).filter(Boolean)).size > 1;
  const byId = new Map(entities.map((e) => [e.id, e]));

  // Records grouped by category, in the categories' own order; biggest first within a group.
  const groups: { key: string; title: string; category?: Category; items: any[] }[] = [];
  for (const e of visible) {
    const key = e.category_id ? String(e.category_id) : 'none';
    let g = groups.find((x) => x.key === key);
    if (!g) {
      const category = typeCategories.find((c) => c.id === e.category_id);
      g = { key, title: e.category_name || category?.name || 'Other', category, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }
  const rank = (g: { category?: Category }) => (g.category ? typeCategories.indexOf(g.category) : typeCategories.length);
  groups.sort((a, b) => rank(a) - rank(b));
  for (const g of groups) g.items.sort((a, b) => Math.abs(valueOf(entityType, b)) - Math.abs(valueOf(entityType, a)) || String(a.name).localeCompare(String(b.name)));
  const grouped = entityType !== 'goals' && (groups.length > 1 || typeCategories.length > 1);

  const handleDelete = async (id: number) => {
    try {
      // Accounts, assets and loans go with their ledger entries (the confirmation says so);
      // the backend refuses otherwise, and a loan in a balance transfer either way.
      const withEntries = ['accounts', 'assets', 'liabilities'].includes(entityType) ? '?with_entries=true' : '';
      const res = await fetch(`${API_BASE_URL}/api/entities/${entityType}/${id}${withEntries}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onRefresh();
        if (showToast) showToast(`${PAGE_TEXT[entityType].noun} deleted`, "success");
      } else {
        const reason = (await res.json().catch(() => null))?.detail ?? "Couldn't delete it";
        if (showToast) showToast(reason, "error");
        else alert(reason);
        throw new Error(reason); // keeps the form open
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

    // Property -> loans link: liabilities.linked_asset_id is the single source of truth
    // (assets has no loan column), and a property can carry several loans. From the
    // Property side, point each ticked loan here and release any unticked one that was.
    // The dedicated route changes only that column; the generic entity PUT would rebuild
    // the loan's metadata_json from a partial payload. When editing from the loan side,
    // linked_asset_id is part of the primary liability save above.
    if (entityType === 'assets' && categoryName === 'Property' && Array.isArray(formData.linked_liability_ids)) {
      const ticked: number[] = formData.linked_liability_ids;
      for (const loan of liabilities) {
        const want = ticked.includes(loan.id);
        if (want === (loan.linked_asset_id === entityId)) continue;
        const res = await fetch(`${API_BASE_URL}/api/liabilities/${loan.id}/property`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ asset_id: want ? entityId : null }),
        }).catch(() => null);
        if (!res?.ok) throw new Error(`Couldn't ${want ? 'link' : 'unlink'} ${loan.name}`);
      }
    }
  };

  const handleFormSubmit = async (formData: any) => {
    try {
      const isEdit = !!editingEntity;
      const url = isEdit
        ? `${API_BASE_URL}/api/entities/${entityType}/${editingEntity.id}`
        : `${API_BASE_URL}/api/entities/${entityType}`;

      // Ensure category_id is set. Accounts are exempt: their category is nullable and
      // the form offers an explicit "Uncategorized" choice that a silent fallback here
      // would override.
      if (entityType !== 'accounts' && !formData.category_id) {
        const fallback = addCategory || (entityType === 'liabilities' ? undefined : typeCategories[0]);
        if (fallback) formData.category_id = fallback.id;
      }

      const categoryName = categories.find((c) => c.id === formData.category_id)?.name;
      // Satellite data and form-only fields go to their own routes, not into metadata_json.
      const { holding_lots, funding_constraints, rental_ledger, insurance_claims, premium_payments, linked_liability_ids, linked_liability_id, ...primaryPayload } = formData;

      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(primaryPayload),
      });

      if (res.ok) {
        const data = await res.json();
        const entityId = isEdit ? editingEntity.id : data.id;
        // The record is saved at this point; a failed follow-up write (lots, claims, loan
        // links…) is reported, but the form still closes so a retry can't duplicate it.
        let followUpError: string | null = null;
        try {
          await dispatchSatelliteData(entityId, categoryName, formData);
        } catch (err) {
          console.error(err);
          followUpError = err instanceof Error ? err.message : 'Part of it didn\'t save';
        }
        setIsAdding(false);
        setEditingEntity(null);
        onRefresh();
        const noun = categoryName && CARD_CATEGORIES.includes(categoryName) ? 'Card' : PAGE_TEXT[entityType].noun;
        if (showToast) showToast(followUpError ? `${noun} saved, but: ${followUpError}` : `${noun} saved`, followUpError ? 'error' : 'success');
      } else {
        const errorData = await res.json();
        const msg = `Error saving entity: ${errorData.detail || 'Unknown error'}`;
        if (showToast) showToast(msg, "error");
        else alert(msg);
      }
    } catch (err) {
      console.error(err);
      if (showToast) showToast("Couldn't save. Check the app is still running and try again.", 'error');
    }
  };

  // Loans have several equally likely types, so a plain "Add loan" makes the user pick
  // one in the form instead of quietly defaulting to the first (Home Loan).
  const defaultCategory = entityType === 'liabilities' ? undefined : typeCategories[0];
  const formCategory = editingEntity
    ? categories.find((c) => c.id === editingEntity.category_id) || defaultCategory
    : addCategory || defaultCategory;

  const renderRow = (e: any) => {
    const value = valueOf(entityType, e);
    let right: React.ReactNode;
    if (entityType === 'goals') {
      const target = num(e.target_amount);
      const pct = target > 0 ? Math.min((num(e.current_amount) / target) * 100, 100) : 0;
      const outlook = goalOutlook(e);
      right = (
        <span className="ie-row-amount eg-goal">
          <strong>{formatINR(value)} <small>of {formatINR(target)}</small></strong>
          <span className="cc-meter"><span style={{ width: `${pct}%`, background: pct >= 100 ? 'var(--success)' : 'var(--accent)' }} /></span>
          <span style={outlook.late ? { color: 'var(--warning)' } : undefined}>{outlook.text}</span>
        </span>
      );
    } else {
      const cat = e.category_name;
      let sub: string | null = null;
      if (entityType === 'liabilities' && cat !== 'Credit Card' && num(e.remaining_interest) > 0) sub = `${formatINR(e.remaining_interest)} interest to go`;
      if (entityType === 'liabilities' && cat === 'Credit Card' && num(e.credit_limit) > 0) sub = `${Math.round((value / num(e.credit_limit)) * 100)}% of limit used`;
      if (entityType === 'assets' && cat === 'Insurance' && num(e.premiums_paid) > 0) sub = `${formatINR(e.premiums_paid)} paid in`;
      if (entityType === 'assets' && cat === 'EPF' && e.transfer_status !== 'Transferred' && num(e.pension_share) > 0) sub = `+ ${formatINR(e.pension_share)} pension, not counted`;
      if (entityType === 'assets' && cat === 'Property') {
        const loansOn = liabilities.filter((l) => l.linked_asset_id === e.id && num(l.outstanding) > 0);
        if (loansOn.length) sub = `${formatINR(loansOn.reduce((t, l) => t + num(l.outstanding), 0))} owed on ${loansOn.length === 1 ? 'its loan' : `${loansOn.length} loans`}`;
      }
      if (entityType === 'assets' && (cat === 'Stock' || cat === 'Mutual Fund') && num(e.quantity) > 0 && num(e.cost_price) > 0) {
        const gain = value - num(e.quantity) * num(e.cost_price);
        sub = `${gain >= 0 ? '+' : '−'}${formatINR(Math.abs(gain))} on cost`;
      }
      right = (
        <span className="ie-row-amount">
          <strong style={value < 0 ? { color: '#fca5a5' } : undefined}>{formatINR(value)}</strong>
          {sub && <span>{sub}</span>}
        </span>
      );
    }
    const meta = metaOf(entityType, e, showOwner, byId);
    return (
      <button key={e.id} type="button" className={`ie-row${e.status && !['Active', 'Open'].includes(e.status) && entityType !== 'goals' ? ' ie-row--paused' : ''}`} onClick={() => setEditingEntity(e)}>
        <span className="ie-row-text">
          <strong>{e.name}</strong>
          {meta && <span>{meta}</span>}
        </span>
        {right}
      </button>
    );
  };

  return (
    <div className="eg-page">
      <div className="eg-head">
        <div>
          <h1 className="page-title">{PAGE_TEXT[entityType].title}</h1>
          <p className="page-subtitle">{PAGE_TEXT[entityType].intro}</p>
        </div>
        <div className="eg-head-actions">
          {entities.length > 0 && (
            <div className="eg-search">
              <Search size={14} />
              <input type="search" placeholder="Search" className="form-control" aria-label={`Search ${PAGE_TEXT[entityType].title.toLowerCase()}`}
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
            </div>
          )}
          <button className="btn btn-primary eg-add" onClick={() => startAdd()}>
            <Plus size={15} /> {PAGE_TEXT[entityType].add}
          </button>
        </div>
      </div>

      {entities.length > 0 && <Summary kind={entityType} items={entities} />}

      {entities.length === 0 ? (
        <div className="settings-group">
          <div className="ie-empty">
            <p>{PAGE_TEXT[entityType].empty}</p>
            {entityType !== 'goals' && typeCategories.length > 1 ? (
              <div>
                {typeCategories.slice(0, 8).map((c) => (
                  <button key={c.id} type="button" className="settings-btn" onClick={() => startAdd(c)}><Plus size={12} /> {c.name}</button>
                ))}
              </div>
            ) : (
              <div><button type="button" className="settings-btn" onClick={() => startAdd()}><Plus size={12} /> {PAGE_TEXT[entityType].add}</button></div>
            )}
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div className="settings-group">
          <div className="ie-empty">
            <p>Nothing matches “{searchQuery}”.</p>
            <div><button type="button" className="settings-link" onClick={() => setSearchQuery('')}>Clear search</button></div>
          </div>
        </div>
      ) : grouped ? (
        <div className="eg-groups">
          {groups.map((g) => (
            <section key={g.key} aria-label={g.title}>
              <div className="settings-group-head">
                <h3 className="settings-group-title">{g.title} <span className="eg-count">{g.items.length}</span></h3>
                <span className="eg-group-total">
                  {formatINR(g.items.reduce((t, e) => t + valueOf(entityType, e), 0))}
                  {g.category && <button type="button" className="settings-link" onClick={() => startAdd(g.category)}><Plus size={12} style={{ verticalAlign: '-2px' }} /> Add</button>}
                </span>
              </div>
              <div className="settings-group">{g.items.map(renderRow)}</div>
            </section>
          ))}
        </div>
      ) : (
        <div className="settings-group">{groups.flatMap((g) => g.items).map(renderRow)}</div>
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
            style={{ width: '100%', maxWidth: '680px' }}
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-label={editingEntity ? `Edit ${editingEntity.name}` : PAGE_TEXT[entityType].add}
            tabIndex={-1}
          >
            <DynamicForm
              entityType={entityType}
              category={formCategory}
              categories={categories}
              institutions={institutions}
              people={people}
              goals={goals}
              initialData={editingEntity}
              liabilities={liabilities}
              properties={properties}
              accounts={accounts}
              onSubmit={handleFormSubmit}
              onCancel={closeForm}
              onAfterAction={(message) => { closeForm(); onRefresh(); showToast?.(message, 'success'); }}
              footerStart={editingEntity && (
                <ConfirmAction label={`Delete this ${CARD_CATEGORIES.includes(editingEntity.category_name) ? 'card' : PAGE_TEXT[entityType].noun.toLowerCase()}`}
                  confirmLabel="Delete" danger question={['accounts', 'assets', 'liabilities'].includes(entityType)
                    ? `Delete ${editingEntity.name} and its ledger entries? Balances they moved elsewhere are undone.` : `Delete ${editingEntity.name}?`}
                  onConfirm={async () => { try { await handleDelete(editingEntity.id); closeForm(); } catch { /* reason shown */ } }} />
              )}
            />
          </div>
        </div>
      )}

    </div>
  );
};
