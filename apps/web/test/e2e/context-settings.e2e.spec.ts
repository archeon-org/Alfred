import { expect, test } from '@playwright/test';
import { installWorkspaceApi, PROJECT_ID } from './support/workspace-api';

test.beforeEach(async ({ page }) => {
  await installWorkspaceApi(page);
  await page.route('**/api/auth/refresh', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: {
          accessToken: 'e2e-only',
          user: {
            id: '21dd1aaa-d564-4a45-9a07-dbc5777d25d5',
            role: 'user',
            displayName: 'Ada',
            email: 'ada@example.test',
          },
        },
      },
    }),
  );
});

for (const viewport of [
  { width: 1400, height: 1000 },
  { width: 390, height: 844 },
]) {
  test(`imports personal text, persists and protects project drafts at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const writes: unknown[] = [];
    page.on('request', (request) => {
      if (request.method() === 'PUT') writes.push(request.postDataJSON());
    });
    await page.goto('/app/settings?section=personalization');
    const instructions = page.getByRole('textbox', { name: 'Instructions générales' });
    await expect(instructions).toHaveCount(0);
    await page.getByRole('button', { name: 'Modifier · Instructions générales' }).click();
    await expect(page.getByRole('dialog', { name: 'Instructions générales' })).toBeVisible();
    await page.getByLabel('Importer · Instructions générales').setInputFiles({
      name: 'instructions.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Règles\r\nRéponds clairement.'),
    });
    await expect(instructions).toHaveValue('# Règles\nRéponds clairement.');
    expect(writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Enregistrer · Instructions générales' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(writes).toEqual([{ content: '# Règles\nRéponds clairement.', expectedRevision: 0 }]);
    await page.reload();
    await page.getByRole('button', { name: 'Modifier · Instructions générales' }).click();
    await expect(instructions).toHaveValue('# Règles\nRéponds clairement.');
    await page.getByRole('dialog').getByRole('button', { name: 'Fermer' }).click();
    await page.goto(`/app/projects/${PROJECT_ID}`);
    await page
      .getByRole('tablist', { name: 'Contenu du projet' })
      .getByRole('tab', { name: 'Contexte', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Description', exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Modifier · Contexte du projet' }).click();
    const context = page.getByRole('textbox', { name: 'Contexte du projet' });
    await context.fill('Projet privé');
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('alertdialog', { name: 'Abandonner les modifications ?' }),
    ).toBeVisible();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(context).toHaveValue('Projet privé');
    await page.getByRole('button', { name: 'Enregistrer · Contexte du projet' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Projet privé', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Modifier · Préférences du projet' }).click();
    await expect(page.getByRole('textbox', { name: 'Préférences du projet' })).toHaveValue('');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
    ).toEqual({ local: {}, session: {} });
  });
}

test('requires a session for the dedicated settings URL', async ({ page }) => {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.goto('/app/settings?section=personalization');
  await expect(page).toHaveURL(/\/login$/u);
  await expect(page.getByRole('textbox', { name: 'Instructions générales' })).toHaveCount(0);
});
