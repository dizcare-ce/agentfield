// e2e/settings.spec.ts  TC-007: Settings page renders and saves a configuration change
//
// Targets the "Agent logs" tab → NodeLogProxy section.
// The "Max tail lines" field (id="nlp-tail") is a numeric setting persisted
// via PUT /api/ui/v1/node-log-proxy/settings.
//
// If any field is env-locked (env_locks returned by the API), the Save button
// is disabled. Those tests are skipped gracefully in that case.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/settings');
  await expect(page.getByRole('tab', { name: 'General' })).toBeVisible({ timeout: 10000 });
});

// ─── Page structure ───────────────────────────────────────────────────────────

test('TC-007: settings page renders with all expected tabs', async ({ page }) => {
  for (const tabName of ['General', 'Observability', 'Agent logs', 'Identity', 'About']) {
    await expect(page.getByRole('tab', { name: tabName })).toBeVisible();
  }
});

test('TC-007: General tab is active by default and shows API Endpoint card', async ({ page }) => {
  const generalTab = page.getByRole('tab', { name: 'General' });
  await expect(generalTab).toHaveAttribute('data-state', 'active');
  await expect(page.getByText('API Endpoint')).toBeVisible();
});

// ─── Agent logs / Node Log Proxy tab ─────────────────────────────────────────

test('TC-007: clicking Agent logs tab reveals Node log proxy card', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByRole('tab', { name: 'Agent logs' })).toHaveAttribute('data-state', 'active');

  // Wait for the async load to finish
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Node log proxy')).toBeVisible();
  await expect(page.getByLabel('Max tail lines (per request)')).toBeVisible();
});

test('TC-007: Node log proxy fields are present and populated', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  // All four fields should exist and have non-empty values after load
  const connectInput = page.locator('#nlp-connect');
  const idleInput = page.locator('#nlp-idle');
  const maxDurInput = page.locator('#nlp-maxdur');
  const tailInput = page.locator('#nlp-tail');

  for (const field of [connectInput, idleInput, maxDurInput, tailInput]) {
    await expect(field).toBeVisible();
    const val = await field.inputValue();
    expect(val.trim()).not.toBe('');
  }
});

test('TC-007: Save button is visible on Agent logs tab', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  await expect(page.getByRole('button', { name: /^Save$/ })).toBeVisible();
});

test('TC-007: changing Max tail lines and saving persists the value after reload', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  const saveButton = page.getByRole('button', { name: /^Save$/ });
  const tailInput = page.locator('#nlp-tail');

  // Skip if the Save button is disabled (env locks are active)
  const isDisabled = await saveButton.isDisabled();
  if (isDisabled) {
    test.skip(true, 'Save is disabled — one or more fields are env-locked');
    return;
  }

  // Read current value, pick a different valid value
  const currentValue = await tailInput.inputValue();
  const newValue = currentValue === '200' ? '150' : '200';

  await tailInput.fill(newValue);
  await saveButton.click();

  // Success banner should appear
  await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Saved node log proxy limits.')).toBeVisible();

  // Reload the page and verify the value stuck
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Agent logs' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  const persistedValue = await page.locator('#nlp-tail').inputValue();
  expect(persistedValue).toBe(newValue);

  // Restore original value so tests are idempotent
  const restoreSave = page.getByRole('button', { name: /^Save$/ });
  if (!(await restoreSave.isDisabled())) {
    await page.locator('#nlp-tail').fill(currentValue);
    await restoreSave.click();
    await expect(page.getByRole('heading', { name: 'Saved' })).toBeVisible({ timeout: 5000 });
  }
});

test('TC-007: entering an invalid Max tail lines value shows an error', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  const saveButton = page.getByRole('button', { name: /^Save$/ });
  if (await saveButton.isDisabled()) {
    test.skip(true, 'Save is disabled — fields are env-locked');
    return;
  }

  await page.locator('#nlp-tail').fill('-5');
  await saveButton.click();

  await expect(page.getByText('Max tail lines must be a positive integer.')).toBeVisible({ timeout: 3000 });
});

test('TC-007: Reload button re-fetches settings without navigating away', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent logs' }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 10000 });

  // Dirty a field then reload — value should revert to server state
  const tailInput = page.locator('#nlp-tail');
  const original = await tailInput.inputValue();
  await tailInput.fill('9999');

  await page.getByRole('button', { name: /Reload/ }).click();
  await expect(page.getByText('Loading log proxy settings…')).not.toBeVisible({ timeout: 5000 });

  const reverted = await tailInput.inputValue();
  expect(reverted).toBe(original);
});
