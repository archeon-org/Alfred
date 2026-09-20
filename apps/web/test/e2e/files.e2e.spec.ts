import type { FileFolder, StoredFile } from '@alfred/contracts';
import { expect, test, type Page, type Route } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '../../src/services/feature-flags/feature-flags';
import { installProductionCsp } from './support/csp';
import { installExecutionApi } from './support/executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n');
// The smallest PNG a browser decodes: one transparent pixel.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const MIB = 1024 * 1024;

interface FilesApiOptions {
  readonly enabled?: boolean;
  readonly files?: readonly StoredFile[];
}

function storedFile(id: number, overrides: Partial<StoredFile> = {}): StoredFile {
  return {
    id: `5a0f3b9e-1c2d-4e3f-8a4b-${String(id).padStart(12, '0')}`,
    name: 'rapport.pdf',
    kind: 'pdf',
    mediaType: 'application/pdf',
    sizeBytes: 2 * MIB,
    readiness: 'ready',
    failureCode: null,
    folderId: null,
    tags: [],
    description: null,
    pageCount: null,
    usage: { conversations: 0, messages: 0 },
    // Seconds stay below 60 whatever the counter: the contract refuses an impossible timestamp.
    createdAt: `2026-09-18T09:00:${String(id % 60).padStart(2, '0')}.000Z`,
    updatedAt: `2026-09-18T09:00:${String(id % 60).padStart(2, '0')}.000Z`,
    ...overrides,
  };
}

/** Browser-side stand-in for the files API; registered last, so it wins over the manifest route. */
async function installFilesApi(
  page: Page,
  { enabled = true, files: seed = [] }: FilesApiOptions = {},
) {
  let files = [...seed];
  let folders: FileFolder[] = [];
  let counter = 100;
  const requests: { method: string; path: string; authorization: string | null }[] = [];
  const json = (route: Route, data: unknown, status = 200) =>
    route.fulfill({ json: { success: true, data }, status });
  await page.route('**/api/features', (route) =>
    route.fulfill({
      json: {
        success: true,
        data: { ...DISABLED_FEATURE_FLAGS, agentRuntime: true, fileUploads: enabled },
      },
    }),
  );
  await page.route('**/api/files**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    requests.push({
      method,
      path: url.pathname + url.search,
      authorization: await request.headerValue('authorization'),
    });
    if (!enabled)
      return route.fulfill({
        json: { success: false, error: { code: 'HTTP_404', message: 'Not found' } },
        status: 404,
      });
    if (url.pathname === '/api/files/quota')
      return json(route, {
        usedBytes: files.reduce((total, file) => total + file.sizeBytes, 0),
        reservedBytes: 0,
        limitBytes: 25 * MIB,
        maxFileBytes: 5 * MIB,
      });
    if (url.pathname === '/api/files/folders') {
      if (method === 'POST') {
        const { name } = request.postDataJSON() as { name: string };
        counter += 1;
        const folder: FileFolder = {
          id: `6b1f4c0e-2d3e-4f40-9b5c-${String(counter).padStart(12, '0')}`,
          name,
          parentId: null,
          depth: 1,
          fileCount: 0,
          createdAt: '2026-09-18T08:00:00.000Z',
          updatedAt: '2026-09-18T08:00:00.000Z',
        };
        folders = [...folders, folder];
        return json(route, folder, 201);
      }
      return json(route, { items: folders });
    }
    if (url.pathname === '/api/files' && method === 'POST') {
      // The multipart body is the browser's own: only its declared type is checked here.
      expect(await request.headerValue('content-type')).toMatch(
        /^multipart\/form-data; boundary=/u,
      );
      const name = /filename="([^"]+)"/u.exec(request.postDataBuffer()?.toString('latin1') ?? '');
      counter += 1;
      const file = storedFile(counter, {
        name: name?.[1] ?? 'fichier',
        kind: name?.[1]?.endsWith('.png') ? 'image' : 'pdf',
      });
      files = [file, ...files];
      return json(route, { file, deduplicated: false }, 201);
    }
    if (url.pathname === '/api/files') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase();
      const folderId = url.searchParams.get('folderId');
      return json(route, {
        items: files.filter(
          (file) =>
            file.name.toLowerCase().includes(search) &&
            (folderId === null || (folderId === 'root') === (file.folderId === null)),
        ),
        nextCursor: null,
      });
    }
    const match = /^\/api\/files\/([^/]+)(?:\/(content|preview))?$/u.exec(url.pathname);
    const file = files.find((item) => item.id === match?.[1]);
    if (file === undefined)
      return route.fulfill({
        json: { success: false, error: { code: 'file_not_found', message: 'Not found' } },
        status: 404,
      });
    if (match?.[2] === 'preview')
      return route.fulfill({ body: PNG, contentType: 'image/png', status: 200 });
    if (match?.[2] === 'content')
      return route.fulfill({
        body: PDF,
        contentType: file.mediaType,
        headers: { 'content-disposition': 'attachment; filename="server-name.bin"' },
        status: 200,
      });
    if (method === 'DELETE') {
      files = files.filter((item) => item.id !== file.id);
      return route.fulfill({ status: 204 });
    }
    if (method === 'PATCH') {
      const changes = request.postDataJSON() as Partial<StoredFile>;
      const updated = { ...file, ...changes, updatedAt: '2026-09-18T11:00:00.000Z' };
      files = files.map((item) => (item.id === file.id ? updated : item));
      return json(route, updated);
    }
    return json(route, file);
  });
  return { requests };
}

const noHorizontalScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const width of [1400, 390]) {
  test(`attaches an uploaded file to a message and sends its id at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const executions = await installExecutionApi(page);
    await installFilesApi(page);
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);

    await page.getByLabel('Fichiers à joindre').setInputFiles({
      name: 'rapport.pdf',
      mimeType: 'application/pdf',
      buffer: PDF,
    });
    const chip = page
      .getByRole('list', { name: 'Fichiers joints', exact: true })
      .getByRole('listitem');
    await expect(chip).toContainText('rapport.pdf');
    await expect(chip).toHaveAttribute('aria-busy', 'false');
    // The remove control is its own button, with a touch target of at least 44 px.
    const remove = chip.getByRole('button', { name: 'Retirer rapport.pdf' });
    const hitArea = await remove.evaluate((button) => {
      const box = button.getBoundingClientRect();
      const grow = Number.parseFloat(getComputedStyle(button, '::after').top) * -2;
      return Math.round(box.width + grow);
    });
    expect(hitArea).toBeGreaterThanOrEqual(44);

    await page.getByRole('textbox', { name: 'Message' }).fill('Résume ce document');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect.poll(() => executions.submissions.length).toBe(1);
    expect(executions.submissions[0]).toMatchObject({
      message: 'Résume ce document',
      attachmentIds: [expect.stringMatching(/^5a0f3b9e-/u)],
    });
    await expect(page.getByRole('list', { name: 'Fichiers joints', exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('list', { name: 'Fichiers joints au message' }).getByText('rapport.pdf'),
    ).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });

  test(`refuses a disguised file before any request at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await installExecutionApi(page);
    const api = await installFilesApi(page);
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Fichiers à joindre').setInputFiles({
      name: 'photo.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<!doctype html><script>alert(1)</script>'),
    });
    await expect(
      page.getByRole('status').filter({ hasText: 'Format non pris en charge' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Envoyer le message' })).toBeDisabled();
    expect(api.requests.filter(({ method }) => method === 'POST')).toEqual([]);
  });

  test(`explores, previews under the production policy and downloads at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const violations: string[] = [];
    page.on('console', (message) => {
      if (/Content Security Policy|Content-Security-Policy/u.test(message.text()))
        violations.push(message.text());
    });
    await installExecutionApi(page);
    const api = await installFilesApi(page, {
      files: [
        storedFile(1, { name: 'photo.png', kind: 'image', mediaType: 'image/png' }),
        storedFile(2, { name: 'contrat.pdf', usage: { conversations: 1, messages: 2 } }),
      ],
    });
    // nginx's own header: `img-src blob:` is what lets the thumbnail render (ADR 0029).
    await installProductionCsp(page);
    await page.goto(`/app/files?conversation=${CONVERSATION_ID}`);

    await expect(page.getByRole('heading', { level: 1, name: 'Mes fichiers' })).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Fil d’Ariane' }).getByText('Mes fichiers'),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.getByRole('meter', { name: 'Espace utilisé' })).toHaveCount(1);

    const thumbnail = page.locator('[data-slot="file-thumbnail"] img');
    await expect(thumbnail).toHaveAttribute('src', /^blob:/u);
    await expect
      .poll(() => thumbnail.evaluate((image: HTMLImageElement) => image.naturalWidth))
      .toBeGreaterThan(0);
    expect(violations).toEqual([]);
    const preview = api.requests.find(({ path }) => path.endsWith('/preview'));
    expect(preview?.authorization).toMatch(/^Bearer /u);

    // The row names the download; `Content-Disposition` is ignored.
    await page.getByRole('button', { name: 'Actions du fichier contrat.pdf' }).click();
    const download = page.waitForEvent('download');
    await page.getByRole('menuitem', { name: 'Télécharger' }).click();
    expect((await download).suggestedFilename()).toBe('contrat.pdf');

    await page.getByRole('button', { name: 'Nouveau dossier' }).click();
    await page.getByRole('textbox', { name: 'Nom du dossier' }).fill('Contrats');
    await page.getByRole('button', { name: 'Créer le dossier' }).click();
    await expect(page.getByRole('link', { name: /Contrats/u })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouveau dossier' })).toBeFocused();

    await page.getByRole('button', { name: 'Actions du fichier contrat.pdf' }).click();
    await page.getByRole('menuitem', { name: 'Supprimer' }).click();
    await expect(page.getByRole('alertdialog')).toContainText(
      'joint à 2 messages dans 1 conversation',
    );
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Supprimer le fichier' })
      .click();
    await expect(page.getByText('contrat.pdf')).toHaveCount(0);

    await page.getByRole('button', { name: 'Joindre photo.png à la conversation' }).click();
    await page.getByRole('link', { name: /Retour à la conversation/u }).click();
    await expect(page).toHaveURL(new RegExp(`/app/conversations/${CONVERSATION_ID}$`, 'u'));
    await expect(
      page.getByRole('list', { name: 'Fichiers joints', exact: true }).getByText('photo.png'),
    ).toBeVisible();
    expect(await noHorizontalScroll(page)).toBe(true);
  });
}

test('lists the library in the panel, below the workspace breakpoint as well', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await installExecutionApi(page);
  await installFilesApi(page, { files: [storedFile(1)] });
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await page.getByRole('button', { name: 'Afficher le contexte' }).click();
  const sheet = page.getByRole('dialog', { name: 'Contexte de la conversation' });
  await sheet.getByRole('tab', { name: 'Fichiers' }).click();
  await sheet.getByRole('button', { name: 'Joindre rapport.pdf au message' }).click();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(
    page.getByRole('list', { name: 'Fichiers joints', exact: true }).getByText('rapport.pdf'),
  ).toBeVisible();
});

test('leaves no trace of files while the capability is off', async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await installExecutionApi(page);
  const api = await installFilesApi(page, { enabled: false });
  await page.goto(`/app/conversations/${CONVERSATION_ID}`);
  await expect(page.getByRole('textbox', { name: 'Message' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Joindre des fichiers' })).toHaveCount(0);
  await expect(page.getByRole('tab', { name: 'Fichiers' })).toHaveCount(0);
  await page.goto('/app/files');
  await expect(page.getByText('Les fichiers sont désactivés.')).toBeVisible();
  expect(api.requests).toEqual([]);
});
