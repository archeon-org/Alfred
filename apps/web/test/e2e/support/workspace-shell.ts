import { expect, type Page } from '@playwright/test';

import { DISABLED_FEATURE_FLAGS } from '../../../src/services/feature-flags/feature-flags';
import { installExecutionApi } from './executions-api';
import { CONVERSATION_ID, defaultSeed, PROJECT_ID } from './workspace-api';

/** Viewports below the workspace breakpoint: tablet landscape, tablet portrait and phone. */
export const SHEET_VIEWPORTS = [
  { width: 1100, height: 800 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
] as const;

/** Prints browser console errors and uncaught page errors, so every run reports them. */
export function logBrowserErrors(page: Page, title: string) {
  page.on('console', (message) => {
    if (message.type() === 'error')
      console.log(`[console error] ${title}: ${message.text().slice(0, 300)}`);
  });
  page.on('pageerror', (error) =>
    console.log(`[page error] ${title}: ${error.message.slice(0, 300)}`),
  );
}

/** The document's own scroll: its offset and how far its content exceeds the viewport. */
export function documentScroll(page: Page) {
  return page.evaluate(() => {
    const root = document.scrollingElement ?? document.documentElement;
    return { top: root.scrollTop, excess: root.scrollHeight - innerHeight };
  });
}

export async function expectStillDocument(page: Page) {
  // Two frames let a wheel or programmatic scroll settle before reading the offset.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  const scroll = await documentScroll(page);
  expect(scroll.top).toBe(0);
  expect(scroll.excess).toBeLessThanOrEqual(1);
}

interface DocumentSamples {
  readonly top: number;
  readonly excess: number;
  /** Whether a library appended an element holding a drawing to the body, outside the app root. */
  readonly sawBodyMeasure: boolean;
}

/**
 * From the first frame, tries to scroll the document on every animation frame, as a person
 * scrolling while the page renders would, and records the worst offset and overflow it reached.
 */
export async function sampleDocumentScroll(page: Page) {
  await page.addInitScript(() => {
    const samples = { top: 0, excess: 0, sawBodyMeasure: false };
    Object.assign(window, { __documentSamples: samples });
    const sample = () => {
      const root = document.scrollingElement;
      if (root !== null && document.body !== null) {
        window.scrollBy(0, 400);
        samples.top = Math.max(samples.top, root.scrollTop);
        samples.excess = Math.max(samples.excess, root.scrollHeight - innerHeight);
        samples.sawBodyMeasure ||= [...document.body.children].some(
          (child) => child.id !== 'root' && child.querySelector('svg') !== null,
        );
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  return () =>
    page.evaluate(
      () => (window as unknown as { __documentSamples: DocumentSamples }).__documentSamples,
    );
}

/** The seed conversation answered with Mermaid diagrams, one valid and one broken per answer. */
export async function installDiagramConversation(page: Page, answers = 12) {
  await installExecutionApi(page);
  const diagram = (turn: number) =>
    [
      `Réponse ${turn}`,
      '',
      '```mermaid',
      'flowchart TD',
      '  A[Brief] --> B{Décision}',
      '  B -->|oui| C[Livraison]',
      '  B -->|non| D[Retour]',
      '  C --> E[Suivi]',
      '```',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[[[ incomplet',
      '```',
    ].join('\n');
  const items = Array.from({ length: answers * 2 }, (_, index) => ({
    id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
    conversationId: CONVERSATION_ID,
    executionId: null,
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: index % 2 === 0 ? `Question ${index / 2 + 1}` : diagram((index + 1) / 2),
    createdAt: '2026-09-11T09:00:01.000Z',
  }));
  await page.route('**/api/conversations/*/messages', (route) =>
    route.fulfill({ json: { success: true, data: { items } } }),
  );
  return { diagrams: answers * 2 };
}

/** The seed project holding `count` chats, more than one page of its list. */
export async function installProjectChats(page: Page, count = 30) {
  const seed = defaultSeed();
  const conversations = Array.from({ length: count }, (_, index) => ({
    ...seed.conversations[0]!,
    id: `77777777-7777-4777-8777-${String(index).padStart(12, '0')}`,
    title: `Chat du projet ${index + 1}`,
    createdAt: `2026-09-10T10:${String(59 - index).padStart(2, '0')}:00.000Z`,
  }));
  await installExecutionApi(page, { ...seed, conversations });
  return { path: `/app/projects/${PROJECT_ID}`, lastTitle: `Chat du projet ${count}` };
}

/** Turns the skills catalogue on; the new-skill editor needs nothing else from the API. */
export async function enableSkills(page: Page) {
  await page.route('**/api/features', (route) =>
    route.fulfill({ json: { success: true, data: { ...DISABLED_FEATURE_FLAGS, skills: true } } }),
  );
}
