import React from 'react';
import {
  ArrowRightLeft, Calculator, Calendar, Compass, CreditCard, FileText, HelpCircle, Landmark, LandmarkIcon,
  LineChart, Percent, PiggyBank, Sliders, Sparkles, Target, Wallet,
} from 'lucide-react';

// The app's pages, in sidebar order. The sidebar and the "Go to" search (Ctrl/Cmd+K)
// both read this list, so a page added here shows up in both.
export interface NavItem { id: string; label: string; icon: React.ReactNode; keywords?: string }

export const NAV_GROUPS: NavItem[][] = [
  [
    { id: 'dashboard', label: 'Dashboard', icon: <Compass size={16} />, keywords: 'home overview net worth monthly snapshot record balances' },
    { id: 'income-expenses', label: 'Income & Expenses', icon: <Wallet size={16} />, keywords: 'salary rent plan recurring' },
    { id: 'cash-flow', label: 'Cash Flow Planning', icon: <LineChart size={16} />, keywords: 'savings rate monthly log' },
    { id: 'transactions', label: 'Transactions Ledger', icon: <ArrowRightLeft size={16} />, keywords: 'spend payment emi' },
    { id: 'budget-planner', label: 'Budget Planner', icon: <Sliders size={16} /> },
    { id: 'financial-calendar', label: 'Financial Calendar', icon: <Calendar size={16} style={{ opacity: 0.8 }} />, keywords: 'due dates advance tax' },
  ],
  [
    { id: 'accounts', label: 'Accounts', icon: <Landmark size={16} />, keywords: 'bank savings' },
    { id: 'assets', label: 'Assets', icon: <PiggyBank size={16} />, keywords: 'investments mutual fund stocks property insurance' },
    { id: 'liabilities', label: 'Liabilities', icon: <LandmarkIcon size={16} />, keywords: 'loans home loan debt' },
    { id: 'credit-cards', label: 'Credit Cards', icon: <CreditCard size={16} />, keywords: 'rewards' },
    { id: 'goals', label: 'Goals', icon: <Target size={16} /> },
  ],
  [
    { id: 'simulations', label: 'Simulations', icon: <LineChart size={16} /> },
    { id: 'loans', label: 'Loan planner', icon: <Calculator size={16} />, keywords: 'emi tool calculator prepayment loan optimizer snowball avalanche' },
    { id: 'taxation', label: 'Taxation', icon: <Percent size={16} />, keywords: 'income tax planner regime nps payslip' },
    { id: 'ask-artha', label: 'Ask Artha', icon: <Sparkles size={16} style={{ color: 'var(--accent-light)' }} />, keywords: 'ai assistant' },
    { id: 'reports', label: 'Reports', icon: <FileText size={16} /> },
  ],
  [
    { id: 'settings', label: 'Settings', icon: <Sliders size={16} />, keywords: 'preferences options backup database' },
    { id: 'help', label: 'Help', icon: <HelpCircle size={16} /> },
  ],
];

/** Sidebar group headings, one per NAV_GROUPS entry. */
export const NAV_GROUP_LABELS = ['Day to day', 'What you own & owe', 'Planning', 'App'];

export const NAV_ITEMS = NAV_GROUPS.flat();

/** Everything the top bar, the Go-to search and the desktop menu can trigger. */
export type AppCommand =
  | 'new-transaction' | 'new-account' | 'new-asset' | 'new-loan' | 'new-credit-card' | 'new-income' | 'new-expense' | 'new-goal'
  | 'open-database' | 'new-database' | 'backup-now' | 'settings' | 'help' | 'goto';

export const NEW_ITEMS: { command: AppCommand; label: string; page: string }[] = [
  { command: 'new-transaction', label: 'Transaction', page: 'transactions' },
  { command: 'new-account', label: 'Account', page: 'accounts' },
  { command: 'new-asset', label: 'Asset or investment', page: 'assets' },
  { command: 'new-loan', label: 'Loan', page: 'liabilities' },
  { command: 'new-credit-card', label: 'Credit card', page: 'credit-cards' },
  { command: 'new-income', label: 'Income entry', page: 'income-expenses' },
  { command: 'new-expense', label: 'Expense entry', page: 'income-expenses' },
  { command: 'new-goal', label: 'Goal', page: 'goals' },
];
