import type { Page } from '@playwright/test';

import { installExecutionApi } from './executions-api';
import { CONVERSATION_ID, type WorkspaceSeed } from './workspace-api';

export const LONG_CONVERSATION_PATH = `/app/conversations/${CONVERSATION_ID}`;

/**
 * The seed conversation with a stored history far taller than any viewport: `turns` questions,
 * each answered by several paragraphs. Returns the text of the last answer's first line.
 */
export async function installLongConversation(
  page: Page,
  { turns = 24, seed }: { readonly turns?: number; readonly seed?: WorkspaceSeed } = {},
) {
  await installExecutionApi(page, seed);
  const items = Array.from({ length: turns * 2 }, (_, index) => {
    const turn = Math.floor(index / 2) + 1;
    const question = index % 2 === 0;
    return {
      id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
      conversationId: CONVERSATION_ID,
      executionId: null,
      role: question ? 'user' : 'assistant',
      content: question
        ? `Question ${turn} : comment organiser la suite ?`
        : Array.from(
            { length: 4 },
            (_, paragraph) =>
              `Réponse ${turn}, partie ${paragraph + 1}. ${'Une phrase assez longue pour remplir la colonne de lecture. '.repeat(6)}`,
          ).join('\n\n'),
      createdAt: '2026-09-11T09:00:01.000Z',
    };
  });
  await page.route('**/api/conversations/*/messages', (route) =>
    route.fulfill({ json: { success: true, data: { items } } }),
  );
  return { lastAnswer: `Réponse ${turns}, partie 1.` };
}
