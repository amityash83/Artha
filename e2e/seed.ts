// Seeds the e2e backend's fresh database with one household, through the same API the app
// uses: a salary, rent, a savings account, a home loan with a property, a car loan, a
// credit card with a spend, an equity fund and a liquid fund with purchase lots, an FD, a
// low-risk emergency goal, a logged month and a snapshot.

const API = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT ?? '8097'}/api`;

async function call(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

async function waitForBackend() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(`${API}/init`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('e2e backend did not start');
}

const month = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export default async function seed() {
  await waitForBackend();
  await call('POST', '/metadata/people', { name: 'Asha', role: 'Primary Owner', risk_tolerance: 'Moderate' });
  const init = await call('GET', '/init');
  const person = init.people[0].id;
  const cat = (type: string, name: string) => init.categories.find((c: any) => c.entity_type === type && c.name === name).id;
  const bank = init.institutions.find((i: any) => i.name === 'HDFC Bank').id;

  const account = (await call('POST', '/entities/accounts', { name: 'Savings', institution_id: bank, owner_id: person, current_balance: 500000 })).id;

  const home = (await call('POST', '/entities/liabilities', { name: 'Home loan', category_id: cat('Liability', 'Home Loan'), owner_id: person,
    lender_institution_id: bank, outstanding: 3000000, interest_rate: 8.5, emi: 30000, tenure_months: 240 })).id;
  await call('POST', '/entities/liabilities', { name: 'Car loan', category_id: cat('Liability', 'Car Loan'), owner_id: person,
    outstanding: 400000, interest_rate: 9.5, emi: 12000, tenure_months: 48 });
  const card = (await call('POST', '/entities/liabilities', { name: 'Rewards card', category_id: cat('Liability', 'Credit Card'), owner_id: person, outstanding: 0 })).id;
  await call('PUT', `/liabilities/${card}/credit-card-details`, { credit_limit: 300000, statement_date: 20, due_date: 5, annual_fee: 2500, point_value: 0.25 });

  const flat = (await call('POST', '/entities/assets', { name: 'Flat', category_id: cat('Asset', 'Property'), owner_id: person, current_value: 9000000 })).id;
  await call('PUT', `/liabilities/${home}/property`, { asset_id: flat });
  const index = (await call('POST', '/entities/assets', { name: 'Index fund', category_id: cat('Asset', 'Mutual Fund'), owner_id: person, current_value: 300000, fund_type: 'Equity' })).id;
  await call('POST', `/assets/${index}/holdings`, { purchase_date: '2024-01-10', quantity: 2000, price_per_unit: 100 });
  const liquid = (await call('POST', '/entities/assets', { name: 'Liquid fund', category_id: cat('Asset', 'Mutual Fund'), owner_id: person, current_value: 150000,
    fund_type: 'Liquid', goal_mapping: 'Emergency fund' })).id;
  await call('POST', `/assets/${liquid}/holdings`, { purchase_date: '2025-01-01', quantity: 1000, price_per_unit: 140 });
  await call('POST', '/entities/assets', { name: 'Bank FD', category_id: cat('Asset', 'Fixed Deposit'), owner_id: person, current_value: 200000 });

  await call('POST', '/entities/goals', { name: 'Emergency fund', target_amount: 600000, current_amount: 0, monthly_contribution: 20000,
    target_date: `${new Date().getFullYear() + 1}-12-01`, priority: 'High', low_risk_only: 1 });
  // Link the liquid fund now the goal exists (goal_mapping is resolved by name on save).
  await call('PUT', `/entities/assets/${liquid}`, { name: 'Liquid fund', category_id: cat('Asset', 'Mutual Fund'), owner_id: person, current_value: 150000,
    fund_type: 'Liquid', goal_mapping: 'Emergency fund' });

  await call('POST', '/entities/income', { name: 'Salary', category_id: cat('Income', 'Salary'), owner_id: person, amount: 300000, net_amount: 200000, frequency: 'Monthly' });
  await call('POST', '/entities/expenses', { name: 'Rent', category_id: cat('Expense', 'Rent'), owner_id: person, amount: 50000, frequency: 'Monthly' });
  await call('POST', '/entities/expenses', { name: 'Household', category_id: cat('Expense', 'General'), owner_id: person, amount: 40000, frequency: 'Monthly' });

  await call('POST', '/entities/transactions', { account_id: null, type: 'Spend', amount: 5000, transaction_date: `${month()}-02`,
    category_id: cat('Expense', 'Grocery'), related_entity_type: 'Liability', related_entity_id: card, notes: '' });
  await call('POST', '/entities/transactions', { account_id: account, type: 'Debit', amount: 50000, transaction_date: `${month()}-01`,
    category_id: cat('Expense', 'Rent'), notes: 'October rent' });
  await call('POST', '/cash-flows', { month: month(-1), net_salary: 200000, other_income: 0, household_expenses: 90000, emi: 42000,
    insurance_premium: 0, investments: 20000, one_time_expenses: 0, notes: '' });
}
