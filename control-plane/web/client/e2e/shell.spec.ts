// e2e/shell.spec.ts  TC-001: Shell/navigation renders correctly
import { test, expect } from '@playwright/test';

const NAV_LINKS = [
  { title: 'Dashboard',          url: '/ui/dashboard' },
  { title: 'Runs',               url: '/ui/runs' },
  { title: 'Agent nodes',        url: '/ui/agents' },
  { title: 'Playground',         url: '/ui/playground' },
  { title: 'Access management',  url: '/ui/access' },
  { title: 'Audit',              url: '/ui/verify' },
  { title: 'Settings',           url: '/ui/settings' },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('TC-001: all sidebar nav links are visible', async ({ page }) => {
  for (const { title } of NAV_LINKS) {
    await expect(page.getByRole('link', { name: title })).toBeVisible();
  }
});

test('TC-001: resource links (Docs, GitHub) are visible', async ({ page }) => {
  await expect(page.getByRole('link', { name: 'Docs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'GitHub' })).toBeVisible();
});

test('TC-001: logo link navigates to /dashboard', async ({ page }) => {
  await page.getByRole('link', { name: 'AgentField Control Plane' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
});

test('TC-001: clicking nav links navigates to the correct route', async ({ page }) => {
  for (const { title, url } of NAV_LINKS) {
    await page.getByRole('link', { name: title }).click();
    await expect(page).toHaveURL(url);
  }
});

test('TC-001: toggle sidebar button is present', async ({ page }) => {
  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();
  await expect(toggle).toBeVisible();

  // Collapse then re-expand — logo text should disappear and reappear
  await toggle.click();
  await expect(page.getByText('Control Plane')).not.toBeVisible();

  await toggle.click();
  await expect(page.getByText('Control Plane')).toBeVisible();
});

test('TC-001: breadcrumb updates to reflect active section', async ({ page }) => {
  await page.getByRole('link', { name: 'Runs' }).click();
  await expect(page).toHaveURL(/\/runs/);
  // On a section index route the header breadcrumb is hidden — sidebar shows active item instead.
  // Verify the sidebar item carries aria-current or is visually active.
  const runsLink = page.getByRole('link', { name: 'Runs' });
  await expect(runsLink).toHaveAttribute('data-active', 'true');
});
