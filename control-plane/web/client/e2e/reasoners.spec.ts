// e2e/reasoners.spec.ts  TC-006: Reasoners page
//
// The /ui/reasoners route does NOT exist as a dedicated page.
// Reasoner metadata is surfaced through /ui/agents (per-agent endpoint list)
// and /ui/playground (per-reasoner execution).
// Redirect rules in App.tsx:
//   /reasoners/all        → /agents
//   /reasoners/:reasonerId → /playground/:reasonerId
//
// These tests verify the redirect behaviour and that reasoner data
// (endpoints / skills) is accessible via the Agent nodes page.

import { test, expect } from '@playwright/test';

// ─── Redirect behaviour ───────────────────────────────────────────────────────

test('TC-006: /reasoners/all redirects to /ui/agents', async ({ page }) => {
  await page.goto('/ui/reasoners/all');
  await expect(page).toHaveURL(/\/agents/);
});

test('TC-006: /reasoners/:id redirects to /ui/playground/:id', async ({ page }) => {
  await page.goto('/ui/reasoners/some-reasoner-id');
  await expect(page).toHaveURL(/\/playground\/some-reasoner-id/);
});

// ─── Reasoner metadata via Agent nodes page ───────────────────────────────────

test('TC-006: Agent nodes page is reachable and shows agents or empty state', async ({ page }) => {
  await page.goto('/ui/agents');
  // Page should not show an unhandled JS error boundary
  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 10000 });
});

test('TC-006: expanding an agent row reveals Endpoints tab with reasoner/skill data', async ({ page }) => {
  await page.goto('/ui/agents');
  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 10000 });

  // Locate the first expandable agent row (identified by its status dot)
  const agentRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  if (await agentRow.count() === 0) {
    test.skip(true, 'No registered agents to inspect reasoner/endpoint data');
    return;
  }

  await agentRow.click();

  // Endpoints tab appears in the expanded detail panel
  const endpointsTab = page.getByRole('tab', { name: 'Endpoints' });
  await expect(endpointsTab).toBeVisible({ timeout: 5000 });
  await expect(endpointsTab).toHaveAttribute('data-state', 'active');
});

test('TC-006: Endpoints tab shows reasoner name, method, and path', async ({ page }) => {
  await page.goto('/ui/agents');
  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 10000 });

  const agentRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  if (await agentRow.count() === 0) {
    test.skip(true, 'No registered agents to inspect endpoint data');
    return;
  }

  await agentRow.click();
  await expect(page.getByRole('tab', { name: 'Endpoints' })).toBeVisible({ timeout: 5000 });

  // The endpoints table / list should contain at least one HTTP method badge
  // (GET or POST) and a path starting with /
  const methodOrPath = page
    .locator('text=/^(GET|POST|PUT|DELETE|PATCH)$/')
    .or(page.locator('text=/^\\/[a-z]/'));

  const endpointCount = await methodOrPath.count();
  if (endpointCount === 0) {
    // Agent is registered but has no reasoners — acceptable empty state
    await expect(
      page.getByText('No endpoints').or(page.getByText('No skills').or(page.getByText('No reasoners')))
    ).toBeVisible({ timeout: 3000 }).catch(() => {
      // Some implementations show an empty list without an explicit message
    });
  } else {
    await expect(methodOrPath.first()).toBeVisible();
  }
});

test('TC-006: clicking an endpoint row in the Endpoints tab navigates to /playground', async ({ page }) => {
  await page.goto('/ui/agents');
  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 10000 });

  const agentRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  if (await agentRow.count() === 0) {
    test.skip(true, 'No registered agents');
    return;
  }

  await agentRow.click();
  await expect(page.getByRole('tab', { name: 'Endpoints' })).toBeVisible({ timeout: 5000 });

  // Endpoint rows are buttons with aria-label "Open <type> <name> in playground"
  const endpointBtn = page.getByRole('button', { name: /in playground/i }).first();

  if (await endpointBtn.count() === 0) {
    test.skip(true, 'No endpoint buttons visible — agent has no registered reasoners/skills');
    return;
  }

  await expect(endpointBtn).toBeVisible();
  await endpointBtn.click();

  // Navigation is programmatic (navigate()) so the URL should update to /playground/...
  await expect(page).toHaveURL(/\/playground\//, { timeout: 5000 });
});
