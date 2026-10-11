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
