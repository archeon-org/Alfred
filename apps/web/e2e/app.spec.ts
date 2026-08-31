import { expect, test } from '@playwright/test';

test('loads the Alfred workspace shell', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveTitle('Alfred');
  await expect(page.getByRole('heading', { level: 1, name: 'Alfred' })).toBeVisible();
  await expect(page.getByRole('list', { name: /platform foundations/i })).toBeVisible();
});
