import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Page } from '@playwright/test';

const NGINX_CONF = path.resolve(import.meta.dirname, '../../../nginx.conf');

/** The Content-Security-Policy nginx serves in the production image, read from its configuration. */
export function productionContentSecurityPolicy(): string {
  const policy = /add_header Content-Security-Policy "([^"]+)"/u.exec(
    readFileSync(NGINX_CONF, 'utf8'),
  );
  if (policy === null) throw new Error('nginx.conf declares no Content-Security-Policy');
  return policy[1]!;
}

/**
 * Serves every document of the page under the production policy, as nginx would: what the built
 * bundle loads (WebAssembly for the highlighter, Mermaid's styles) is then checked by the browser
 * itself.
 */
export async function installProductionCsp(page: Page): Promise<void> {
  const policy = productionContentSecurityPolicy();
  await page.route('**/*', async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback();
    const response = await route.fetch();
    return route.fulfill({
      response,
      headers: { ...response.headers(), 'content-security-policy': policy },
    });
  });
}
