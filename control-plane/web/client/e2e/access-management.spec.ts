// e2e/access-management.spec.ts  TC-008: Access management page
//
// The /ui/access page manages cross-agent access policies and agent tag
// approvals. It is NOT a generic API-key creation page.
//
// Key UI elements:
//   - Heading: "Access management"
//   - "Browser admin token" card (AdminTokenPrompt component)
//     • Shows amber alert with password input when no token is set
//     • Shows green "saved" indicator with Change / Clear buttons when a token is set
//   - Tabs: "Access rules" | "Agent tags"
//     • "Access rules" shows cross-agent call policies
//     • "Agent tags" shows per-agent tag approval status
//
// Note: Authorization APIs (policies, tags) only activate when
// AGENTFIELD_AUTHORIZATION_ENABLED=true is set on the server.
// These tests handle both the enabled and disabled states gracefully.

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/ui/access');
  await expect(page.getByRole('heading', { name: 'Access management' })).toBeVisible({ timeout: 10000 });
});

// ─── Page structure ───────────────────────────────────────────────────────────

test('TC-008: page heading and subtitle are visible', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Access management' })).toBeVisible();
  await expect(page.getByText('Cross-agent rules and tag approvals.')).toBeVisible();
});

test('TC-008: Refresh button is present and clickable', async ({ page }) => {
  const refreshBtn = page.getByRole('button', { name: 'Refresh runs, agents, and dashboard data' });
  await expect(refreshBtn).toBeVisible();
  await refreshBtn.click();
  // Button should stay on page (no navigation)
  await expect(page.getByRole('heading', { name: 'Access management' })).toBeVisible();
});

test('TC-008: Browser admin token card is visible', async ({ page }) => {
  await expect(page.getByText('Browser admin token')).toBeVisible();
});

test('TC-008: Access rules and Agent tags tabs are present', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Access rules' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Agent tags' })).toBeVisible();
});

test('TC-008: Access rules tab is active by default', async ({ page }) => {
  await expect(page.getByRole('tab', { name: 'Access rules' })).toHaveAttribute('data-state', 'active');
});

test('TC-008: switching to Agent tags tab works', async ({ page }) => {
  await page.getByRole('tab', { name: 'Agent tags' }).click();
  await expect(page.getByRole('tab', { name: 'Agent tags' })).toHaveAttribute('data-state', 'active');
  // Card content for that tab should be in the DOM
  await expect(page.getByText('Agent tag approvals')).toBeVisible();
});

// ─── Admin token prompt — no token set ───────────────────────────────────────

test('TC-008: amber token alert with password input is shown when no admin token is set', async ({ page }) => {
  // Ensure no token is stored from a previous test
  await page.evaluate(() => {
    // AdminTokenPrompt persists to React state / context; clear any leftover
    // by reloading with fresh storage if the green dot is visible
  });

  // If a token is already saved from a prior run, clear it first
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }

  // Amber alert should now be visible
  await expect(page.getByText('Admin token', { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder('Same value as on the server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save in browser' })).toBeVisible();
});

test('TC-008: Save in browser button is disabled when input is empty', async ({ page }) => {
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }

  const saveBtn = page.getByRole('button', { name: 'Save in browser' });
  await expect(saveBtn).toBeDisabled();
});

// ─── Admin token prompt — setting a token ────────────────────────────────────

test('TC-008: entering and saving an admin token shows the green saved indicator', async ({ page }) => {
  // Start from a cleared state
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }

  const tokenInput = page.getByPlaceholder('Same value as on the server');
  await tokenInput.fill('test-admin-token-e2e');

  const saveBtn = page.getByRole('button', { name: 'Save in browser' });
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // Green indicator should appear
  await expect(page.getByText('Admin token saved in this browser')).toBeVisible({ timeout: 3000 });
  await expect(page.getByRole('button', { name: 'Change' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clear' })).toBeVisible();
});

test('TC-008: Change button re-shows the token input form', async ({ page }) => {
  // Ensure a token is set
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }
  await page.getByPlaceholder('Same value as on the server').fill('test-admin-token-e2e');
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByText('Admin token saved in this browser')).toBeVisible({ timeout: 3000 });

  // Click Change
  await page.getByRole('button', { name: 'Change' }).click();
  await expect(page.getByPlaceholder('Same value as on the server')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
});

test('TC-008: Cancel during Change restores saved state without clearing token', async ({ page }) => {
  // Ensure token is set
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }
  await page.getByPlaceholder('Same value as on the server').fill('test-admin-token-e2e');
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByText('Admin token saved in this browser')).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'Change' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // Back to green indicator — token is still set
  await expect(page.getByText('Admin token saved in this browser')).toBeVisible();
});

test('TC-008: Clear button removes the admin token', async ({ page }) => {
  // Ensure token is set
  const clearBtn = page.getByRole('button', { name: 'Clear' });
  if (await clearBtn.isVisible()) {
    await clearBtn.click();
  }
  await page.getByPlaceholder('Same value as on the server').fill('test-admin-token-e2e');
  await page.getByRole('button', { name: 'Save in browser' }).click();
  await expect(page.getByText('Admin token saved in this browser')).toBeVisible({ timeout: 3000 });

  await page.getByRole('button', { name: 'Clear' }).click();

  // Input form should reappear
  await expect(page.getByPlaceholder('Same value as on the server')).toBeVisible();
  await expect(page.getByText('Admin token saved in this browser')).not.toBeVisible();
});

// ─── Authorization disabled state ─────────────────────────────────────────────

test('TC-008: when authorization is not enabled, an info alert is shown', async ({ page }) => {
  // This assertion is conditional — it passes when the server does NOT have
  // AGENTFIELD_AUTHORIZATION_ENABLED=true. Skip gracefully if it IS enabled.
  const authAlert = page.getByText('Authorization APIs are not enabled on this server');
  const crossAgentCard = page.getByText('Cross-agent access policies');

  const authEnabled = await crossAgentCard.isVisible({ timeout: 3000 }).catch(() => false);
  if (authEnabled) {
    test.skip(true, 'Authorization is enabled on this server — skipping disabled-state test');
    return;
  }

  await expect(authAlert).toBeVisible();
});
