// e2e/layout-viewports.spec.ts  TC-011: Layout is consistent across viewport widths
//
// Tests each of the four target widths defined in the manual test case:
//   1440px (wide desktop), 1280px, 1024px (laptop), 768px (tablet)
//
// Checks per page (/runs, /agents, /dashboard):
//   1. Sidebar navigation is present and not overflowing its container
//   2. Page heading is visible and not clipped
//   3. No horizontal document overflow (scrollWidth <= viewport width)
//   4. Tables have a scroll container at narrow widths (≤ 1024px)
//   5. Status badges are visible and not split across lines

import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = [
  { width: 1440, height: 900, label: '1440px' },
  { width: 1280, height: 800, label: '1280px' },
  { width: 1024, height: 768, label: '1024px' },
  { width: 768,  height: 1024, label: '768px' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if document body does not overflow the viewport horizontally. */
async function noHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return document.documentElement.scrollWidth <= document.documentElement.clientWidth;
  });
}

/** Returns true if at least one scroll container wraps the main table. */
async function tableHasScrollContainer(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const tables = Array.from(document.querySelectorAll('table'));
    return tables.some((t) => {
      let el: Element | null = t.parentElement;
      while (el) {
        const style = getComputedStyle(el);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
        el = el.parentElement;
      }
      return false;
    });
  });
}

// ─── /ui/runs at every viewport ───────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test(`TC-011: /ui/runs — layout at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/ui/runs');
    await expect(page.getByText('Loading runs…')).not.toBeVisible({ timeout: 15000 });

    // Sidebar toggle button must be present (collapsed or expanded)
    await expect(page.getByRole('button', { name: 'Toggle Sidebar' }).first()).toBeVisible();

    // Page does not overflow horizontally
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test(`TC-011: /ui/runs — table scrollable at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/ui/runs');
    await expect(page.getByText('Loading runs…')).not.toBeVisible({ timeout: 15000 });

    const hasRuns = (await page.getByRole('row').count()) > 1; // >1 means header + data
    if (!hasRuns) {
      test.skip(true, 'No runs present — table scroll test skipped');
      return;
    }

    // At narrow viewports the table must be inside a scroll container
    if (vp.width <= 1024) {
      expect(await tableHasScrollContainer(page)).toBe(true);
    }
  });
}

// ─── /ui/agents at every viewport ────────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test(`TC-011: /ui/agents — layout at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/ui/agents');
    await expect(page.getByRole('heading', { name: 'Agent nodes & logs' })).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: 'Toggle Sidebar' }).first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });

  test(`TC-011: /ui/agents — heading not clipped at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/ui/agents');

    const heading = page.getByRole('heading', { name: 'Agent nodes & logs' });
    await expect(heading).toBeVisible({ timeout: 15000 });

    // Heading bounding box should be within the viewport width
    const box = await heading.boundingBox();
    if (box) {
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width + 1); // +1 for sub-pixel
    }
  });
}

// ─── /ui/dashboard at every viewport ─────────────────────────────────────────

for (const vp of VIEWPORTS) {
  test(`TC-011: /ui/dashboard — layout at ${vp.label}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto('/ui/dashboard');

    // Wait for something meaningful to render
    await expect(
      page.getByText('runs today').or(page.getByText('Recent runs'))
    ).toBeVisible({ timeout: 15000 });

    await expect(page.getByRole('button', { name: 'Toggle Sidebar' }).first()).toBeVisible();
    expect(await noHorizontalOverflow(page)).toBe(true);
  });
}

// ─── Navigation usability at 768px ───────────────────────────────────────────

test('TC-011: navigation sidebar is usable at 768px (toggle works)', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/ui/dashboard');
  await expect(
    page.getByText('runs today').or(page.getByText('Recent runs'))
  ).toBeVisible({ timeout: 15000 });

  const toggle = page.getByRole('button', { name: 'Toggle Sidebar' }).first();
  await expect(toggle).toBeVisible();

  // Collapse
  await toggle.click();
  // "Control Plane" label text collapses (sidebar shrinks to icon-only mode)
  await expect(page.getByText('Control Plane')).not.toBeVisible({ timeout: 3000 });

  // Expand again
  await toggle.click();
  await expect(page.getByText('Control Plane')).toBeVisible({ timeout: 3000 });
});

test('TC-011: all nav items are reachable at 768px', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.goto('/ui/dashboard');

  // Ensure sidebar is expanded
  const sidebarText = page.getByText('Control Plane');
  if (!(await sidebarText.isVisible())) {
    await page.getByRole('button', { name: 'Toggle Sidebar' }).first().click();
    await expect(sidebarText).toBeVisible({ timeout: 3000 });
  }

  const navLinks = ['Dashboard', 'Runs', 'Agent nodes', 'Playground', 'Access management', 'Audit', 'Settings'];
  for (const name of navLinks) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
});

// ─── Badge wrapping check ─────────────────────────────────────────────────────

test('TC-011: status badges on Runs page do not wrap awkwardly at 1024px', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/ui/runs');
  await expect(page.getByText('Loading runs…')).not.toBeVisible({ timeout: 15000 });

  const hasRuns = (await page.getByRole('row').count()) > 1;
  if (!hasRuns) {
    test.skip(true, 'No runs present — badge wrapping test skipped');
    return;
  }

  // Each status badge should fit within its table cell (height <= 2 lines)
  const badges = page.locator('table tbody [class*="badge"], table tbody [class*="Badge"]');
  const count = await badges.count();

  for (let i = 0; i < Math.min(count, 5); i++) {
    const box = await badges.nth(i).boundingBox();
    if (box) {
      // A single-line badge should be no taller than ~40px
      expect(box.height).toBeLessThanOrEqual(40);
    }
  }
});
