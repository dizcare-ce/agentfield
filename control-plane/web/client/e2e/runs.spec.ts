// e2e/runs.spec.ts  TC-003: Runs table status badges
import { test, expect } from '@playwright/test';

const VALID_LABELS = new Set(['ok', 'failed', 'running', 'pending', 'timeout', 'cancelled']);

// Expected dot background colors per status label
const STATUS_COLORS: Record<string, string> = {
  ok:        'rgb(34, 197, 94)',   // bg-green-500
  failed:    'rgb(239, 68, 68)',   // bg-red-500
  timeout:   'rgb(239, 68, 68)',   // bg-red-500
  running:   'rgb(59, 130, 246)',  // bg-blue-500
};

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/runs');
  // Wait for the table to finish loading
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByText('Loading runs…')).not.toBeVisible({ timeout: 10000 });
});

test('TC-003: runs table has expected column headers', async ({ page }) => {
  const headers = page.getByRole('columnheader');
  await expect(headers.filter({ hasText: 'Status' })).toBeVisible();
  await expect(headers.filter({ hasText: 'Target' })).toBeVisible();
  await expect(headers.filter({ hasText: 'Steps' })).toBeVisible();
  await expect(headers.filter({ hasText: 'Duration' })).toBeVisible();
  await expect(headers.filter({ hasText: 'Started' })).toBeVisible();
});

test('TC-003: each status cell shows a valid label', async ({ page }) => {
  // StatusDot renders: dot div + <span class="text-micro-plus">{label}</span>
  // .text-micro-plus is only used inside StatusDot, making it a precise selector
  const statusCells = page.getByRole('cell').filter({
    has: page.locator('.text-micro-plus'),
  });

  const count = await statusCells.count();

  // If there are no runs, skip — not a badge failure
  if (count === 0) {
    await expect(page.getByText('No runs found')).toBeVisible();
    return;
  }

  for (let i = 0; i < count; i++) {
    const cell = statusCells.nth(i);
    const label = await cell.locator('.text-micro-plus').textContent();
    expect(VALID_LABELS.has(label?.trim() ?? '')).toBeTruthy();
  }
});

test('TC-003: succeeded runs show a green dot', async ({ page }) => {
  const okCells = page.getByRole('cell').filter({ has: page.locator('.text-micro-plus', { hasText: 'ok' }) });
  const count = await okCells.count();

  if (count === 0) {
    test.skip(true, 'No succeeded runs in the current data set');
    return;
  }

  // The dot is the sibling div before the label span inside StatusDot
  const dot = okCells.first().locator('.size-1\\.5.rounded-full');
  await expect(dot).toHaveCSS('background-color', STATUS_COLORS['ok']);
});

test('TC-003: failed runs show a red dot', async ({ page }) => {
  const failedCells = page.getByRole('cell').filter({ has: page.locator('.text-micro-plus', { hasText: 'failed' }) });
  const count = await failedCells.count();

  if (count === 0) {
    test.skip(true, 'No failed runs in the current data set');
    return;
  }

  const dot = failedCells.first().locator('.size-1\\.5.rounded-full');
  await expect(dot).toHaveCSS('background-color', STATUS_COLORS['failed']);
});

test('TC-003: running runs show a blue dot', async ({ page }) => {
  const runningCells = page.getByRole('cell').filter({ has: page.locator('.text-micro-plus', { hasText: 'running' }) });
  const count = await runningCells.count();

  if (count === 0) {
    test.skip(true, 'No running runs in the current data set');
    return;
  }

  const dot = runningCells.first().locator('.size-1\\.5.rounded-full');
  await expect(dot).toHaveCSS('background-color', STATUS_COLORS['running']);
});
