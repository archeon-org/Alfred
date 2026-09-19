import type { Page } from '@playwright/test';

// No alias and no dependency in this module: Playwright can load it at runtime.
import {
  applyPreset,
  type ChatDisplay,
  type ChatPreferences,
  type ChatPreset,
} from '../../../src/lib/workspace/chat-preferences';

/**
 * Stores chat display preferences before the app loads (Paramètres › Chat): a preset, optionally
 * with some switches changed. Call before the first navigation; every later navigation keeps them.
 */
export async function preferChat(
  page: Page,
  preset: ChatPreset,
  switches: Partial<ChatDisplay> = {},
): Promise<void> {
  const preferences: ChatPreferences = {
    ...applyPreset(preset),
    ...switches,
    ...(Object.keys(switches).length > 0 ? { detail: 'custom' as const } : {}),
  };
  await page.addInitScript(
    (value) => localStorage.setItem('alfred.chat.v1', value),
    JSON.stringify(preferences),
  );
}
