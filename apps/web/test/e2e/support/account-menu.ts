import type { Page } from '@playwright/test';

/** The account menu at the foot of the sidebar: settings, loading preview and sign-out live there. */
export const accountTrigger = (page: Page) => page.getByRole('button', { name: /menu du compte/u });

export async function openAccountMenu(page: Page): Promise<void> {
  await accountTrigger(page).click();
  await page.getByRole('menu').waitFor();
}

export async function chooseAccountItem(page: Page, name: string | RegExp): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole('menuitem', { name }).click();
}

export async function togglePreviewLoading(page: Page): Promise<void> {
  await openAccountMenu(page);
  await page.getByRole('menuitemcheckbox', { name: 'Aperçu du chargement' }).click();
}

/** Reads the preview state from the menu, then closes it without choosing anything. */
export async function isPreviewLoadingOn(page: Page): Promise<boolean> {
  await openAccountMenu(page);
  const checked = await page
    .getByRole('menuitemcheckbox', { name: 'Aperçu du chargement' })
    .getAttribute('aria-checked');
  await page.keyboard.press('Escape');
  await page.getByRole('menu').waitFor({ state: 'hidden' });
  return checked === 'true';
}
