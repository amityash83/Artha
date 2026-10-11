import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

// Smoke tests against the seeded household (e2e/seed.ts). Each test starts from the
// Dashboard; tests that change data use names no other test relies on.

/** Collects uncaught page errors and console errors for the test. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  return errors;
}

async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('.db-page')).toBeVisible({ timeout: 20_000 });
}

async function go(page: Page, label: string) {
  await page.locator('aside .sidebar-item', { hasText: new RegExp(`^\\s*${label}\\s*$`) }).first().click();
}

const money = async (page: Page, selector: string, value: number) => {
  const field = page.locator(selector);
  await field.click();
  await field.fill(String(value));
  await field.blur();
};

test('every page opens without errors', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  const labels = (await page.locator('aside .sidebar-item').allInnerTexts()).map((t) => t.trim()).filter(Boolean);
  expect(labels.length).toBeGreaterThan(15);
  for (const label of labels) {
    await go(page, label);
    await expect(page.locator('h1.page-title'), `${label} has a title`).toBeVisible();
    await page.waitForTimeout(300); // let the page's own fetches settle
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('dashboard shows net worth and no false goal warning', async ({ page }) => {
  await open(page);
  await expect(page.locator('.db-summary')).toContainText('Net worth');
  await expect(page.locator('.db-summary')).toContainText('Left over each month');
  // The liquid fund is low risk, so the "only low-risk holdings" goal is satisfied.
  await expect(page.getByText('has a high-risk holding')).toHaveCount(0);
  await expect(page.getByText("uses a kind of asset it shouldn't")).toHaveCount(0);
});

test('adding a loan needs a type, and edits are saved', async ({ page }) => {
  await open(page);
  await go(page, 'Liabilities');
  await page.locator('.eg-add').click();
  await expect(page.locator('#field-category_id')).toHaveValue(''); // no silent Home Loan default
  await page.locator('#field-category_id').selectOption({ label: 'Personal Loan' });
  await page.fill('#field-name', 'E2E personal loan');
  await money(page, '#field-outstanding', 250000);
  await money(page, '#field-emi', 8000);
  await page.locator('.df-actions button[type=submit]').click();
  const row = page.locator('section[aria-label="Personal Loan"] .ie-row', { hasText: 'E2E personal loan' });
  await expect(row).toBeVisible();

  await row.click();
  await money(page, '#field-emi', 9500);
  await page.locator('.df-actions button[type=submit]').click();
  await expect(row).toContainText('EMI ₹9,500');
});

test('a property can carry two loans', async ({ page }) => {
  await open(page);
  await go(page, 'Assets');
  const flat = page.locator('.ie-row', { hasText: 'Flat' });
  await expect(flat).toContainText('owed on its loan');
  await flat.click();
  await expect(page.locator('.df-check', { hasText: 'Home loan' }).locator('input')).toBeChecked();
  await page.locator('.df-actions button', { hasText: 'Cancel' }).click();
});

test('logging a month starts from the last one', async ({ page }) => {
  await open(page);
  await go(page, 'Cash Flow Planning');
  await page.locator('.eg-add').click();
  await expect(page.locator('#cf-net_salary')).toHaveValue('2,00,000'); // last month's take-home, not an invented figure
  await expect(page.getByRole('status')).toContainText('Started from');
  await page.locator('.df-actions button[type=submit]').click();
  await page.locator('.cc-view', { hasText: 'Monthly log' }).click();
  await expect(page.locator('.ie-row')).toHaveCount(2);
});

test('recording a snapshot from the dashboard', async ({ page }) => {
  await open(page);
  await page.locator('.db-card button', { hasText: 'Record this month' }).first().click();
  await page.locator('.snap button[type=submit]').click();
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  await expect(page.getByText('One month recorded')).toBeVisible();
});

test('simulations: closing a loan reports real savings, and switching does not crash', async ({ page }) => {
  const errors = watchErrors(page);
  await open(page);
  await go(page, 'Simulations');
  await page.locator('#sim-type').selectOption('close_loan');
  await page.locator('#sim-loan').selectOption((await page.locator('#sim-loan option', { hasText: 'Car loan' }).getAttribute('value'))!);
  await page.locator('.tx-actions .btn-primary').click();
  await expect(page.locator('.db-rec-plain')).toContainText('frees ₹12,000 a month');
  await expect(page.locator('.db-rec-plain')).not.toContainText('saves about ₹0');
  await page.locator('#sim-type').selectOption('net_worth_forecast');
  await expect(page.getByText('Pick a scenario and press')).toBeVisible();
  expect(errors).toEqual([]);
});

test('budget planner counts card spending', async ({ page }) => {
  await open(page);
  await go(page, 'Budget Planner');
  const grocery = page.locator('.bp-row', { has: page.locator('.settings-row-label', { hasText: /^Grocery$/ }) });
  await expect(grocery).toContainText('₹5,000 spent');
});

test('go-to search ranks the Loan planner first for "EMI"', async ({ page }) => {
  await open(page);
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
  await page.keyboard.type('EMI');
  await expect(page.locator('.palette [role=option]').first()).toContainText('Loan planner');
});

test('taxation quick estimate compares the regimes', async ({ page }) => {
  await open(page);
  await go(page, 'Taxation');
  await page.locator('.cc-view', { hasText: 'Quick estimate' }).click();
  await money(page, '#tax-tds_deducted', 400000);
  await page.locator('.tx-actions .btn-primary').click();
  await expect(page.getByText(/Better for you: the (old|new) regime/)).toBeVisible();
  await expect(page.locator('.cf-compare')).toContainText('Total tax');
});

test('backups are also copied to a second folder', async ({ page }) => {
  const second = mkdtempSync(join(tmpdir(), 'artha-e2e-second-'));
  await open(page);
  await go(page, 'Settings');
  await page.locator('.settings-nav-item', { hasText: 'Backups' }).click();
  await page.getByLabel('Folder for the second copy').fill(join(second, 'missing'));
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText("isn't available");
  await page.getByLabel('Folder for the second copy').fill(second);
  await page.getByRole('button', { name: 'Use', exact: true }).click();
  await expect(page.getByText(/Up to date as of/)).toBeVisible();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByText('Backup saved and copied to the second folder')).toBeVisible();
  expect(readdirSync(second).filter((n) => n.startsWith('backup_'))).toHaveLength(1);
});

test('a payment due soon shows under the bell, with a short account', async ({ page, request }) => {
  const backend = `http://127.0.0.1:${process.env.E2E_BACKEND_PORT}/api`;
  const init = await (await request.get(`${backend}/init`)).json();
  const savings = init.accounts.find((a: { name: string }) => a.name === 'Savings');
  const homeLoan = init.categories.find((c: { entity_type: string; name: string }) => c.entity_type === 'Liability' && c.name === 'Home Loan');
  const tomorrow = new Date(Date.now() + 86400000).getDate();
  await request.post(`${backend}/entities/liabilities`, { data: { name: 'Bridge loan', category_id: homeLoan.id, outstanding: 2000000, interest_rate: 9,
    emi: 900000, emi_day: tomorrow, emi_account_id: savings.id } });
  await open(page);
  await page.getByRole('button', { name: /due soon/ }).click();
  const item = page.locator('.rm-item', { hasText: 'Bridge loan EMI' });
  await expect(item).toContainText('Due tomorrow');
  await expect(item).toContainText(/Savings has .* add/);
  await item.getByRole('button', { name: 'Done' }).click();
  await expect(item).toHaveCount(0);
  await page.getByRole('button', { name: 'Reminder settings' }).click();
  await expect(page.getByRole('heading', { name: 'Reminders' }).first()).toBeVisible();
  await expect(page.getByText('Loan EMIs')).toBeVisible();
});

test('importing a bank statement, then undoing it', async ({ page }) => {
  const csv = [
    'Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance',
    '02/10/26,UPI-ZOMATO-zomato@hdfc-Dinner,1,02/10/26,640.00,,1000.00',
    '03/10/26,NEFT CR-ACME CORP-SALARY,2,03/10/26,,"1,20,000.00",121000.00',
    '04/10/26,CC AUTOPAY REWARDS CARD,3,04/10/26,"5,000.00",,116000.00',
  ].join('\n');
  await open(page);
  await go(page, 'Transactions Ledger');
  await page.getByRole('button', { name: 'Import statement' }).click();
  await page.getByLabel('Account').selectOption({ label: 'Savings' });
  await page.locator('#si-file').setInputFiles({ name: 'hdfc-oct.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  await expect(page.getByText('3 lines for Savings')).toBeVisible();
  await expect(page.locator('.si-row', { hasText: 'AUTOPAY' }).locator('select')).toHaveValue(/^Liability:/);
  await page.getByLabel('Line 2 goes to').selectOption({ label: 'Salary' });
  await page.getByRole('button', { name: 'Import 3 lines' }).click();
  await expect(page.getByText(/Imported 3 lines/)).toBeVisible();
  const past = page.locator('.si-past', { hasText: 'hdfc-oct.csv' });
  await expect(past).toContainText('3 lines');
  await past.getByRole('button', { name: 'Undo' }).click();
  await past.getByRole('button', { name: 'Remove them' }).click();
  await expect(page.getByText(/Removed 3 entries/)).toBeVisible();
  await expect(past).toHaveCount(0);
});
