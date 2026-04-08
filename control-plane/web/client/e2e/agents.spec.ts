// e2e/agents.spec.ts  TC-005: Agents page health status
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/agents');
  // Wait for loading to finish — either agent rows or an empty/error state
  await expect(page.getByText('Loading agents…')).not.toBeVisible({ timeout: 15000 });
});

// ─── List rendering ───────────────────────────────────────────────────────────

test('TC-005: agents page heading is visible', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible();
});

test('TC-005: each agent row shows a node ID and lifecycle status', async ({ page }) => {
  const agentRows = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),  // status dot inside each row
  });
  const count = await agentRows.count();

  if (count === 0) {
    await expect(
      page.getByText('No agent nodes found').or(page.getByText('No agents registered'))
    ).toBeVisible();
    return;
  }

  const validStatuses = ['ready', 'running', 'starting', 'stopped', 'error', 'offline', 'degraded', 'unknown'];

  for (let i = 0; i < count; i++) {
    const row = agentRows.nth(i);

    // Node ID — rendered in font-mono inside the row button
    const nodeId = row.locator('span.font-mono').first();
    await expect(nodeId).not.toBeEmpty();

    // Status label — sits in the flex container that also holds the dot span.
    // The dot is `span.size-1\.5.rounded-full`; its sibling span carries the label.
    // Grab all text from that container and check against known statuses.
    const statusContainer = row.locator('div.flex.items-center.gap-1\\.5').filter({
      has: page.locator('span.size-1\\.5.rounded-full'),
    });
    const label = await statusContainer.locator('span').last().textContent();
    expect(validStatuses.some((s) => label?.trim().includes(s))).toBeTruthy();
  }
});

test('TC-005: online agents show a green dot', async ({ page }) => {
  // Green dot: bg-green-400 (ready/running/starting)
  const greenDots = page.locator('span.bg-green-400.rounded-full');
  const count = await greenDots.count();

  if (count === 0) {
    test.skip(true, 'No online agents in current dataset');
    return;
  }

  await expect(greenDots.first()).toBeVisible();
  await expect(greenDots.first()).toHaveCSS('background-color', 'rgb(74, 222, 128)'); // bg-green-400
});

test('TC-005: offline agents show a red dot', async ({ page }) => {
  // Red dot: bg-red-400 (stopped/error/offline)
  const redDots = page.locator('span.bg-red-400.rounded-full');
  const count = await redDots.count();

  if (count === 0) {
    test.skip(true, 'No offline agents in current dataset');
    return;
  }

  await expect(redDots.first()).toBeVisible();
  await expect(redDots.first()).toHaveCSS('background-color', 'rgb(248, 113, 113)'); // bg-red-400
});

test('TC-005: All / Online / Offline filter tabs are present', async ({ page }) => {
  const agentCount = await page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).count();

  if (agentCount === 0) {
    test.skip(true, 'Filter tabs only render when agents exist');
    return;
  }

  await expect(page.getByRole('tab', { name: /All/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Online/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Offline/ })).toBeVisible();
});

// ─── Detail expansion ─────────────────────────────────────────────────────────

test('TC-005: clicking an agent row expands the detail panel', async ({ page }) => {
  const firstRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  const count = await firstRow.count();
  if (count === 0) {
    test.skip(true, 'No agents to expand');
    return;
  }

  // Expand
  await firstRow.click();

  // Detail panel tabs should appear
  await expect(page.getByRole('tab', { name: 'Endpoints' })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('tab', { name: 'Process logs' })).toBeVisible();
});

test('TC-005: expanded detail shows Endpoints tab by default', async ({ page }) => {
  const firstRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  if (await firstRow.count() === 0) {
    test.skip(true, 'No agents to expand');
    return;
  }

  await firstRow.click();

  // Endpoints tab should be active by default
  const endpointsTab = page.getByRole('tab', { name: 'Endpoints' });
  await expect(endpointsTab).toBeVisible({ timeout: 5000 });
  await expect(endpointsTab).toHaveAttribute('data-state', 'active');
});

test('TC-005: switching to Process logs tab renders the logs panel', async ({ page }) => {
  const firstRow = page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).first();

  if (await firstRow.count() === 0) {
    test.skip(true, 'No agents to expand');
    return;
  }

  await firstRow.click();

  await page.getByRole('tab', { name: 'Process logs' }).click();

  // Logs panel — NodeProcessLogsPanel mounts; wait for either log content or a no-logs message
  const logsTab = page.getByRole('tab', { name: 'Process logs' });
  await expect(logsTab).toHaveAttribute('data-state', 'active');
});

// ─── Search filter ────────────────────────────────────────────────────────────

test('TC-005: search by nonexistent node ID shows No matching agents', async ({ page }) => {
  const agentCount = await page.getByRole('button').filter({
    has: page.locator('.size-1\\.5.rounded-full'),
  }).count();

  if (agentCount === 0) {
    test.skip(true, 'Search bar only renders when agents exist');
    return;
  }

  await page.getByRole('textbox', { name: 'Search agent nodes' }).fill('zzz-nonexistent-agent-xyz');
  await expect(page.getByText('No matching agents')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Try a different search or connection filter.')).toBeVisible();
});
