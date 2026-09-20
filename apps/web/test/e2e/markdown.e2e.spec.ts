import { expect, test } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '@/services/feature-flags/feature-flags';

import { installProductionCsp } from './support/csp';
import {
  EXECUTION_ID,
  executionSnapshot,
  installExecutionApi,
  sse,
} from './support/executions-api';
import { CONVERSATION_ID } from './support/workspace-api';

const TRACE_URL = `https://smith.langchain.com/o/org/projects/p/proj/r/${EXECUTION_ID}?poll=true`;

const answer = [
  '## Classement',
  '',
  '| Rang | Marché | Fit |',
  '| --- | --- | --- |',
  '| 1 | Jet Aviation, Bâle | **Très fort** |',
  '| 2 | US aerospace | Moyen |',
  '',
  '- [x] cadrer le besoin',
  '- [ ] livrer',
  '  - sous-étape ~~annulée~~',
  '',
  '```mermaid',
  'flowchart LR',
  '  A[Brief] --> B{Décision}',
  '  B -->|oui| C[Livraison]',
  '  B -->|non| D[Retour]',
  '```',
  '',
  '```ts',
  'const total = rows.length;',
  '```',
].join('\n');

for (const width of [390, 1440]) {
  test(`renders tables, task lists, code and a Mermaid diagram in an answer at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 950 });
    // The built bundle under nginx's policy: the highlighter's WebAssembly must compile under it.
    await installProductionCsp(page);
    await installExecutionApi(page);
    await page.route('**/api/features', (route) =>
      route.fulfill({
        json: {
          success: true,
          data: { ...DISABLED_FEATURE_FLAGS, agentRuntime: true, traceLinks: true },
        },
      }),
    );
    await page.route(`**/api/executions/${EXECUTION_ID}/trace-link`, (route) =>
      route.fulfill({ json: { success: true, data: { url: TRACE_URL } } }),
    );
    await page
      .context()
      .route('https://smith.langchain.com/**', (route) =>
        route.fulfill({ contentType: 'text/html', body: '<title>Trace</title>' }),
      );
    await page.route(`**/api/executions/${EXECUTION_ID}/events`, (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: sse(
          executionSnapshot(0, ''),
          executionSnapshot(1, answer.slice(0, 120)),
          executionSnapshot(2, answer),
          executionSnapshot(3, answer, 'completed'),
        ),
      }),
    );
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Classe les marchés');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();

    const main = page.getByRole('main');
    await expect(main.getByRole('heading', { level: 2, name: 'Classement' })).toBeVisible();
    const table = main.getByRole('table');
    await expect(table.getByRole('columnheader')).toHaveText(['Rang', 'Marché', 'Fit']);
    await expect(table.getByRole('row')).toHaveCount(3);
    await expect(main.getByRole('checkbox', { name: 'Tâche terminée' })).toBeChecked();
    await expect(main.getByRole('checkbox', { name: 'Tâche à faire' })).toBeDisabled();
    await expect(main.locator('del')).toHaveText('annulée');
    await expect(main.locator('[data-language="ts"]')).toContainText('const total = rows.length;');
    const highlighted = main.locator('[data-language="ts"] pre[data-highlighted="true"]');
    await expect(highlighted).toBeVisible({ timeout: 20_000 });
    // Token granularity differs between engines; the keyword colour reaching `const` is what matters.
    await expect(
      highlighted
        .locator('span[style*="--shiki-token-keyword"]')
        .filter({ hasText: 'const' })
        .first(),
    ).toBeVisible();
    // The diagram is real Mermaid output, drawn from the app palette, with its source one click away.
    const figure = main.getByRole('figure', { name: 'Diagramme' });
    await expect(figure.locator('svg')).toBeVisible({ timeout: 20_000 });
    await expect(figure).toContainText('Décision');
    await expect(main.getByRole('alert')).toHaveCount(0);
    await main.getByRole('button', { name: 'Voir la source' }).click();
    await expect(main.locator('[data-language="mermaid"]')).toContainText('flowchart LR');
    await main.getByRole('button', { name: 'Voir le diagramme' }).click();
    await expect(figure.locator('svg')).toBeVisible();
    // The user's message keeps its bubble; the answer reads as page text with its own controls.
    await expect(main.getByRole('button', { name: 'Copier la réponse' })).toBeVisible();
    await expect(main.getByRole('button', { name: 'Copier le code' })).toHaveCount(1);
    // The trace control opens the run in the runtime console in a new tab, then stays as a link.
    const popup = page.context().waitForEvent('page');
    await main.getByRole('button', { name: 'Voir la trace de cette réponse' }).click();
    const opened = await popup;
    await expect(opened).toHaveURL(TRACE_URL);
    await opened.close();
    await expect(
      main.getByRole('link', { name: 'Ouvrir la trace de cette réponse' }),
    ).toHaveAttribute('href', TRACE_URL);
    await expect(page.locator('html')).toHaveCSS('overflow-x', /visible|auto|hidden/u);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({
      path: process.env.ALFRED_SHOT
        ? `${process.env.ALFRED_SHOT}/markdown-${width}.png`
        : `test-results/markdown-${width}.png`,
      fullPage: false,
    });
  });
}

const HOSTILE_DIAGRAMS = {
  // Spelled out in the source: refused before Mermaid is even loaded.
  'plain keys and HTML labels': [
    'flowchart LR',
    '  A@{ img: "https://evil.test/p.png", label: "Logo", w: 60, h: 60 }',
    '  B["<img src=\'https://evil.test/q.png\'> Décision"]',
    '  A --> B',
  ],
  // Quoted or escaped keys pass a look at the text: the parsed diagram is what refuses them.
  'quoted and escaped keys': [
    'flowchart TD',
    '  A@{ "img": "https://evil.test/quoted.png", label: "x", w: 60, h: 60 }',
    "  B@{ 'img': 'https://evil.test/single.png', label: 'y' }",
    '  C@{ "\\u0069mg": "https://evil.test/escaped.png", label: "z" }',
    '  A --> B --> C',
  ],
} as const;

for (const [label, lines] of Object.entries(HOSTILE_DIAGRAMS)) {
  test(`never lets a Mermaid diagram reach the network (${label})`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await installProductionCsp(page);
    await installExecutionApi(page);
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('evil.test')) requests.push(request.url());
    });
    await page.context().route('https://evil.test/**', (route) => route.fulfill({ status: 204 }));
    const hostile = ['Logo :', '', '```mermaid', ...lines, '```'].join('\n');
    await page.route(`**/api/executions/${EXECUTION_ID}/events`, (route) =>
      route.fulfill({
        contentType: 'text/event-stream',
        body: sse(executionSnapshot(0, ''), executionSnapshot(1, hostile, 'completed')),
      }),
    );
    await page.goto(`/app/conversations/${CONVERSATION_ID}`);
    await page.getByLabel('Message', { exact: true }).fill('Dessine le logo');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    const main = page.getByRole('main');
    // A source asking for external resources is shown, never drawn: nothing is fetched, neither
    // before nor during a render, since no render happens.
    await expect(main.getByText(/Diagramme non dessiné/u)).toBeVisible({ timeout: 20_000 });
    await expect(main.locator('[data-language="mermaid"]')).toContainText('evil.test');
    await expect(main.getByRole('figure', { name: 'Diagramme' })).toHaveCount(0);
    await expect(main.locator('image, img[src*="evil"], foreignObject')).toHaveCount(0);
    await expect(main.getByRole('alert')).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(requests).toEqual([]);
  });
}
