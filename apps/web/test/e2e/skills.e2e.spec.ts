import { expect, test } from '@playwright/test';
import type { SkillDetail, SkillWriteInput } from '@alfred/contracts';
import { CONVERSATION_ID, installWorkspaceApi } from './support/workspace-api';
import { DISABLED_FEATURE_FLAGS } from '../../src/services/feature-flags/feature-flags';

const id = '00000000-0000-4000-8000-000000000001';
test.beforeEach(async ({ page }) => {
  await installWorkspaceApi(page);
  await page.route('**/api/features', (route) =>
    route.fulfill({ json: { success: true, data: { ...DISABLED_FEATURE_FLAGS, skills: true } } }),
  );
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
  let skills: SkillDetail[] = [];
  let versions: SkillDetail[] = [];
  await page.route('**/api/skills**', (route) => {
    const method = route.request().method();
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/versions'))
      return route.fulfill({
        json: {
          success: true,
          data: {
            items: [...versions].reverse().map((skill) => ({
              version: skill.currentVersion,
              name: skill.name,
              description: skill.description,
              totalBytes: skill.totalBytes,
              createdAt: skill.createdAt,
              publishedAt: null,
            })),
            nextBefore: null,
          },
        },
      });
    if (path.endsWith('/availability')) {
      const { enabled } = route.request().postDataJSON() as { enabled: boolean };
      skills = skills.map((skill) => ({ ...skill, enabled, version: skill.version + 1 }));
      return route.fulfill({ json: { success: true, data: skills[0] } });
    }
    if (path.endsWith('/restore')) {
      const { sourceVersion } = route.request().postDataJSON() as { sourceVersion: number };
      const previous = versions.find((skill) => skill.currentVersion === sourceVersion)!;
      const current = skills[0]!;
      const restored: SkillDetail = {
        ...previous,
        enabled: current.enabled,
        version: current.version + 1,
        currentVersion: sourceVersion,
        publishedVersion: current.publishedVersion,
        status: 'draft',
      };
      skills = [restored];
      return route.fulfill({ json: { success: true, data: restored } });
    }
    if (method === 'DELETE') {
      skills = [];
      return route.fulfill({ status: 204 });
    }
    if (method === 'POST' && path.endsWith('/publish'))
      skills = skills.map((skill) => ({
        ...skill,
        status: 'published',
        publishedVersion: skill.currentVersion,
        version: skill.version + 1,
      }));
    else if (method === 'POST' || method === 'PUT') {
      const input = route.request().postDataJSON() as SkillWriteInput;
      skills = [
        {
          ...input,
          id,
          enabled: skills[0]?.enabled ?? true,
          version: method === 'PUT' ? skills[0]!.version + 1 : 1,
          currentVersion:
            method === 'PUT' ? Math.max(...versions.map((item) => item.currentVersion)) + 1 : 1,
          publishedVersion: skills[0]?.publishedVersion ?? null,
          status: 'draft',
          fileCount: input.files.length,
          totalBytes: 100,
          createdAt: '2026-09-10T10:00:00.000Z',
          updatedAt: '2026-09-10T10:00:00.000Z',
        },
      ];
      versions = [...versions, skills[0]!];
    }
    return route.fulfill({
      json: {
        success: true,
        data:
          path === '/api/skills' && method === 'GET'
            ? {
                items: skills.filter((skill) =>
                  skill.name.includes(
                    new URL(route.request().url()).searchParams.get('search') ?? '',
                  ),
                ),
                nextCursor: null,
              }
            : skills[0],
      },
    });
  });
});
for (const width of [1400, 390]) {
  test(`keeps a compact editor header visible while scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/app/skills');
    await page.getByLabel('Fichier Markdown ou ZIP').setInputFiles({
      name: 'SKILL.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from(
        '---\nname: scroll-test\ndescription: Test de défilement\n---\n' +
          'Paragraphe de test.\n\n'.repeat(80),
      ),
    });
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await page.getByRole('button', { name: 'Modifier scroll-test' }).click();
    await page.getByRole('tab', { name: 'Aperçu' }).click();
    const header = page.locator('[data-slot="skill-editor-header"]');
    const initial = await header.boundingBox();
    expect(initial!.height).toBeLessThan(width === 1400 ? 155 : 255);
    if (width === 1400) {
      const body = page.locator('[data-slot="skill-editor-body"]');
      await body.evaluate((element) => {
        element.scrollTop = 600;
      });
      expect(await body.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      expect((await header.boundingBox())!.y).toBeCloseTo(initial!.y, 0);
    } else {
      await page.evaluate(() => window.scrollTo(0, 600));
      await expect.poll(async () => (await header.boundingBox())!.y).toBeCloseTo(0, 0);
    }
    await expect(page.getByRole('button', { name: 'Enregistrer le brouillon' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Historique des versions' })).toBeInViewport();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({ path: `../../tmp/skill-compact-header-${width}.png` });
  });

  test(`imports a skill, edits package files, persists, publishes and deletes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/app/skills');
    await page.getByLabel('Fichier Markdown ou ZIP').setInputFiles({
      name: 'synthese.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Instructions\nRésumer clairement.'),
    });
    await expect(page).toHaveURL(/\/app\/skills\/new$/u);
    await page
      .getByRole('navigation', { name: 'Fil d’Ariane' })
      .getByRole('link', { name: 'Mes skills' })
      .click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(page).toHaveURL(/\/app\/skills\/new$/u);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('textbox', { name: 'Nom du skill' }).fill('synthese');
    await page
      .getByRole('textbox', { name: 'Description', exact: true })
      .fill('Résumer un document');
    await page
      .getByRole('textbox', { name: 'Chemin du nouveau fichier' })
      .fill('scripts/analyse.py');
    await page.getByRole('button', { name: 'Créer un fichier vide' }).click();
    await page
      .getByRole('textbox', { name: 'Contenu de scripts/analyse.py' })
      .fill('print("hello")');
    await page.screenshot({
      path: `../../tmp/skill-editor-${width === 390 ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);

    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await expect(page).toHaveURL(/\/app\/skills$/u);
    await page.reload();
    await page.getByRole('button', { name: 'Modifier synthese' }).click();
    await expect(page).toHaveURL(new RegExp(`/app/skills/${id}/edit$`));
    await page.reload();
    await page.getByRole('button', { name: 'scripts/analyse.py', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Contenu de scripts/analyse.py' })).toHaveValue(
      'print("hello")',
    );
    await page.getByRole('button', { name: 'Retirer ce fichier du brouillon' }).click();
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Annuler' }).click();
    await expect(page.getByRole('button', { name: 'scripts/analyse.py', exact: true })).toHaveCount(
      0,
    );
    await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await page.getByRole('button', { name: 'Actions du skill synthese' }).click();
    await page.getByRole('menuitem', { name: 'Publier synthese' }).click();
    await expect(page.getByText('Publié · v2')).toBeVisible();
    await page.screenshot({
      path: `../../tmp/skills-${width === 390 ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    await page.getByRole('searchbox', { name: 'Rechercher un skill' }).fill('absent');
    await expect(page.getByRole('button', { name: 'Modifier synthese' })).toHaveCount(0);
    await page.getByRole('searchbox', { name: 'Rechercher un skill' }).fill('synth');
    await page.getByRole('button', { name: 'Modifier synthese' }).click();
    await page.getByRole('button', { name: 'Historique des versions' }).click();
    await page.getByRole('button', { name: 'Restaurer la version 1' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Restaurer cette version' })
      .click();
    await expect(page.getByText(/Version 1 restaurée/)).toBeVisible();
    await page.getByRole('button', { name: 'scripts/analyse.py', exact: true }).click();
    await expect(page.getByRole('textbox', { name: 'Contenu de scripts/analyse.py' })).toHaveValue(
      'print("hello")',
    );
    await page.getByRole('button', { name: 'Historique des versions' }).click();
    await expect(page.getByText('Version 1 · Courante')).toBeVisible();
    await expect(page.getByText(/Version 3/)).toHaveCount(0);
    await page.getByRole('button', { name: 'Historique des versions' }).click();
    await page.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(page.getByText('Version 1 publiée.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publiée', exact: true })).toBeDisabled();
    await page.getByRole('button', { name: 'Désactiver le skill' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Désactiver', exact: true })
      .click();
    await expect(page.getByRole('button', { name: 'Activer le skill' })).toBeVisible();
    await page.reload();
    await page.getByRole('button', { name: 'Activer le skill' }).click();
    await expect(page.getByRole('button', { name: 'Désactiver le skill' })).toBeVisible();
    await page.getByRole('button', { name: 'Historique des versions' }).click();
    await page.screenshot({
      path: `../../tmp/skill-lifecycle-${width === 390 ? 'mobile' : 'desktop'}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page
      .getByRole('navigation', { name: 'Fil d’Ariane' })
      .getByRole('link', { name: 'Mes skills' })
      .click();
    if (width === 1400) {
      await page.goto(`/app/conversations/${CONVERSATION_ID}`);
      await page.getByRole('tab', { name: 'Skills', exact: true }).click();
      await expect(page.getByRole('link', { name: 'synthese', exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: /Ajouter synthese|Retirer synthese/ }),
      ).toHaveCount(0);
      await page.goto('/app/skills');
    }
    const downloaded = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Actions du skill synthese' }).click();
    await page.getByRole('menuitem', { name: 'Exporter synthese' }).click();
    expect((await downloaded).suggestedFilename()).toBe('synthese.zip');
    await page.getByRole('button', { name: 'Actions du skill synthese' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer synthese' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Supprimer le skill' }).click();
    await expect(page.getByText('Aucun skill. Créez votre première méthode.')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    expect(
      await page.evaluate(() => ({ local: { ...localStorage }, session: { ...sessionStorage } })),
    ).toEqual({ local: {}, session: {} });
  });
}
test('requires a session for skills and respects disabled flag', async ({ page }) => {
  await page.route('**/api/features', (route) =>
    route.fulfill({ json: { success: true, data: DISABLED_FEATURE_FLAGS } }),
  );
  await page.goto('/app/skills');
  await expect(page.getByText('Le catalogue de skills est désactivé.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Créer un skill' })).toHaveCount(0);
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401 }));
  await page.route('**/api/auth/providers', (route) =>
    route.fulfill({ json: { success: true, data: [] } }),
  );
  await page.reload();
  await expect(page).toHaveURL(/\/login$/u);
});
