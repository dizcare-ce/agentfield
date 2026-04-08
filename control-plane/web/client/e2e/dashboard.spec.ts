// e2e/dashboard.spec.ts  TC-002: Dashboard summary counts + SSE auto-update
//
// Dashboard structure (NewDashboardPage):
//   - "Active runs" card  with "{n} active" badge  (when runs exist)
//   - "Needs attention" card                        (when failures exist)
//   - Stats row: "runs today" · "success %" · "agents online" · "avg time"
//   - "Recent runs" table (last 8 runs)
//
// SSE auto-update path:
//   useSSESync() → React-Query cache invalidation → refetch → re-render
//   refetchInterval (runs): 8 s  |  summary: 15–30 s
//
// Workflow trigger endpoint (from seed.py):
//   POST /api/v1/execute/async/agent-alpha.fast_work  { steps: 1 }
//   Only works when agent-alpha is actually running. Tests that rely on it
//   skip gracefully when the agent is offline.

import { test, expect } from '@playwright/test';

// ─── Page structure ───────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/dashboard');
});

test('TC-002: dashboard page loads without error', async ({ page }) => {
  // The page renders either the Primary Run Focus card or the stats row
  const primaryCard = page.getByText('Active runs').or(page.getByText('runs today'));
  await expect(primaryCard.first()).toBeVisible({ timeout: 15000 });
});

test('TC-002: stats row shows runs today, success, agents online, avg time labels', async ({ page }) => {
  // Wait for skeletons to resolve — statsLoading becomes false
  await page.waitForFunction(() =>
    !document.querySelector('[class*="animate-pulse"]'),
    { timeout: 15000 }
  );

  await expect(page.getByText('runs today')).toBeVisible();
  await expect(page.getByText('success')).toBeVisible();
  await expect(page.getByText('agents online')).toBeVisible();
  await expect(page.getByText('avg time')).toBeVisible();
});

test('TC-002: stat values render (real numbers or dash placeholder)', async ({ page }) => {
  await page.waitForFunction(() =>
    !document.querySelector('[class*="animate-pulse"]'),
    { timeout: 15000 }
  );

  // Four large tabular-nums spans in the stats row
  const statValues = page.locator('.text-2xl.font-semibold.tabular-nums');
  await expect(statValues.first()).toBeVisible();
  const count = await statValues.count();
  expect(count).toBeGreaterThanOrEqual(1);
});

test('TC-002: Recent runs card is present', async ({ page }) => {
  await expect(page.getByText('Recent runs')).toBeVisible({ timeout: 15000 });
});

// ─── Loading skeleton ─────────────────────────────────────────────────────────

test('TC-002: skeleton loaders appear while dashboard data is fetching', async ({ page }) => {
  // Delay API responses so the loading state is observable
  await page.route('**/api/ui/v1/dashboard/**', async (route) => {
    await new Promise(r => setTimeout(r, 1500));
    await route.continue();
  });
  await page.route('**/api/ui/v2/workflow-runs**', async (route) => {
    await new Promise(r => setTimeout(r, 1500));
    await route.continue();
  });

  await page.reload();

  // During the artificial delay, Skeleton elements should be visible
  const skeleton = page.locator('[class*="animate-pulse"]').first();
  await expect(skeleton).toBeVisible({ timeout: 3000 });
});

// ─── SSE auto-update ──────────────────────────────────────────────────────────

test('TC-002: triggering a workflow run updates the Active runs count automatically', async ({ page }) => {
  // Wait for initial load
  await page.waitForFunction(() =>
    !document.querySelector('[class*="animate-pulse"]'),
    { timeout: 15000 }
  );

  // Record initial active count (badge text like "3 active", or 0 if card absent)
  const activeBadge = page.locator('text=/^\\d+ active$/').first();
  const hasBadge = await activeBadge.isVisible();
  const initialCount = hasBadge
    ? parseInt(((await activeBadge.textContent()) ?? '0').split(' ')[0], 10)
    : 0;

  // Trigger a workflow run via the control-plane API
  const response = await page.request.post(
    'http://localhost:8080/api/v1/execute/async/agent-alpha.fast_work',
    {
      data: { steps: 1 },
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000,
    }
  ).catch(() => null);

  if (!response || !response.ok()) {
    test.skip(true, 'agent-alpha is not running — cannot trigger a workflow for SSE test');
    return;
  }

  // Wait up to 15 s for the Active runs badge to increment (SSE + 8 s refetch)
  await expect(async () => {
    const badge = page.locator('text=/^\\d+ active$/').first();
    const text = (await badge.textContent().catch(() => '0 active')) ?? '0 active';
    const newCount = parseInt(text.split(' ')[0], 10);
    expect(newCount).toBeGreaterThan(initialCount);
  }).toPass({ timeout: 15000, intervals: [1000] });
});

test('TC-002: dashboard shows content after brief SSE disruption', async ({ page }) => {
  let block = true;
  await page.route('**/api/v1/events/**', async (route) => {
    if (block) {
      await route.abort();
    } else {
      await route.continue();
    }
  });

  await page.reload();
  await page.waitForTimeout(2000);
  block = false;

  // Page should still show meaningful content — not blank or error state
  await expect(
    page.getByText('Recent runs').or(page.getByText('runs today'))
  ).toBeVisible({ timeout: 10000 });
});
