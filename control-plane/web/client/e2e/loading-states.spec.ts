// e2e/loading-states.spec.ts  TC-010: Loading states appear during data fetch
//
// Strategy: use page.route() to add an artificial delay to API responses
// so the loading/skeleton UI is observable before data arrives.
// DevTools network throttling is not available in Playwright directly.
//
// Loading indicators per page:
//   /ui/runs     → "Loading runs…" text inside a <TableCell>
//   /ui/agents   → "Loading agents…" aria-label or visible text
//   /ui/dashboard → Skeleton elements (animate-pulse) for stats row + cards
//
// Each test:
//   1. Registers a route handler that delays the relevant API call by ~1.5 s
//   2. Navigates to the page
//   3. Immediately asserts the loading indicator IS visible
//   4. After the delay resolves, asserts data OR empty-state is shown
//      (no raw empty flash before data arrives)

import { test, expect } from '@playwright/test';

const DELAY_MS = 1500;

// ─── Runs page ────────────────────────────────────────────────────────────────

test('TC-010: Runs page shows "Loading runs…" while API call is in-flight', async ({ page }) => {
  // Delay the workflow-runs endpoint
  await page.route('**/api/ui/v2/workflow-runs**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/runs');

  // Loading indicator should be visible immediately after navigation
  await expect(page.getByText('Loading runs…')).toBeVisible({ timeout: 3000 });
});

test('TC-010: Runs page does not flash empty state before data arrives', async ({ page }) => {
  await page.route('**/api/ui/v2/workflow-runs**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  // Track whether "No runs" appeared before "Loading runs…" disappeared
  let emptyFlashed = false;
  page.on('console', () => {}); // keep page alive

  await page.goto('/ui/runs');

  // While still loading, check that the empty state is NOT shown
  const loading = page.getByText('Loading runs…');
  const emptyState = page.getByText('No runs').or(page.getByText('No workflow runs'));

  await expect(loading).toBeVisible({ timeout: 3000 });

  // Empty state must not be visible at the same time as the loading indicator
  const emptyVisible = await emptyState.isVisible();
  if (emptyVisible) {
    emptyFlashed = true;
  }

  expect(emptyFlashed).toBe(false);
});

test('TC-010: Runs page shows data or empty state after loading completes', async ({ page }) => {
  // Use a regex to match the workflow-runs endpoint regardless of query params or base path
  await page.route(/workflow-runs/, async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/runs');

  // Wait for loading to finish (give extra time for the delayed fetch + render)
  await expect(page.getByText('Loading runs…')).not.toBeVisible({ timeout: 20000 });

  // After loading resolves, either "No runs found" (empty state) or table data rows
  // must be visible. Use waitForSelector to ensure React has finished rendering.
  await expect(
    page.getByText('No runs found').or(
      page.locator('table tbody tr').first()
    )
  ).toBeVisible({ timeout: 5000 });
});

// ─── Agents page ──────────────────────────────────────────────────────────────

test('TC-010: Agents page shows loading state while nodes API is in-flight', async ({ page }) => {
  await page.route('**/api/ui/v1/nodes**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/agents');

  // Check each loading indicator separately to avoid strict-mode violations
  // when both "Loading agents…" text AND animate-pulse elements are present together
  const loadingText = page.getByText('Loading agents…');
  const skeleton = page.locator('[class*="animate-pulse"]').first();

  const showsText = await loadingText.isVisible().catch(() => false);
  const showsSkeleton = await skeleton.isVisible().catch(() => false);

  expect(showsText || showsSkeleton).toBe(true);
});

test('TC-010: Agents page does not flash empty state before data arrives', async ({ page }) => {
  await page.route('**/api/ui/v1/nodes**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/agents');

  // Check loading state without using .or() to avoid strict-mode violations
  const showsLoadingText = await page.getByText('Loading agents…').isVisible().catch(() => false);
  const showsSkeleton = await page.locator('[class*="animate-pulse"]').first().isVisible().catch(() => false);

  if (showsLoadingText || showsSkeleton) {
    // Empty state must not appear at the same time as the loading indicator
    const emptyText = await page.getByText('No agent nodes found').isVisible().catch(() => false);
    const emptyAlt = await page.getByText('No agents registered').isVisible().catch(() => false);
    expect(emptyText || emptyAlt).toBe(false);
  }
});

test('TC-010: Agents page shows data or empty state after loading completes', async ({ page }) => {
  await page.route('**/api/ui/v1/nodes**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/agents');

  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 15000 });
  // Loading must have resolved by now
  await expect(page.locator('text=Loading agents…')).not.toBeVisible({ timeout: 10000 });

  const hasAgents = await page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).count() > 0;

  const hasEmpty = await page
    .getByText('No agent nodes found')
    .or(page.getByText('No agents registered'))
    .isVisible();

  expect(hasAgents || hasEmpty).toBe(true);
});

// ─── Dashboard page ───────────────────────────────────────────────────────────

test('TC-010: Dashboard shows skeleton loaders while summary API is in-flight', async ({ page }) => {
  await page.route('**/api/ui/v1/dashboard/**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });
  await page.route('**/api/ui/v2/workflow-runs**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/dashboard');

  // Dashboard renders Skeleton components (animate-pulse) while statsLoading is true
  const skeleton = page.locator('[class*="animate-pulse"]').first();
  await expect(skeleton).toBeVisible({ timeout: 3000 });
});

test('TC-010: Dashboard skeleton resolves to stats content after load', async ({ page }) => {
  await page.route('**/api/ui/v1/dashboard/**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });
  await page.route('**/api/ui/v2/workflow-runs**', async (route) => {
    await new Promise(r => setTimeout(r, DELAY_MS));
    await route.continue();
  });

  await page.goto('/ui/dashboard');

  // After delay, skeleton should disappear and labels should appear
  await page.waitForFunction(() =>
    !document.querySelector('[class*="animate-pulse"]'),
    { timeout: 15000 }
  );

  // At least one stat label should now be visible
  await expect(
    page.getByText('runs today')
      .or(page.getByText('agents online'))
      .or(page.getByText('Recent runs'))
  ).toBeVisible();
});
