// e2e/auth.setup.ts
import { test as setup, expect } from '@playwright/test';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const authFile = path.join(__dirname, '.auth/state.json');

setup('authenticate', async ({ page }) => {
  const apiKey = process.env.TEST_API_KEY;

  await page.goto('/');

  if (apiKey) {
    // Auth-enabled server: fill in the API key form shown by AuthGuard
    await page.getByPlaceholder('hax_live_…').fill(apiKey);
    await page.getByRole('button', { name: 'Connect' }).click();
  }

  // Wait until the dashboard is visible (with or without auth)
  await expect(page.getByRole('link', { name: 'Agent nodes' })).toBeVisible({ timeout: 10000 });

  // Persist storage state (empty when no auth, contains af_api_key when auth is enabled)
  await page.context().storageState({ path: authFile });
});
