import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const webRoot = path.resolve(import.meta.dirname, '../..');

async function contentSecurityPolicy(): Promise<Map<string, string[]>> {
  const conf = await readFile(path.join(webRoot, 'nginx.conf'), 'utf8');
  const header = /add_header Content-Security-Policy "([^"]+)"/u.exec(conf)?.[1];
  expect(header).toBeDefined();
  return new Map(
    header!.split(';').map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/u);
      return [name!, sources];
    }),
  );
}

describe('production Content-Security-Policy', () => {
  it('allows exactly what the bundle needs for scripts: same origin and WebAssembly compilation', async () => {
    const highlighter = await readFile(path.join(webRoot, 'src/lib/markdown/highlight.ts'), 'utf8');
    const policy = await contentSecurityPolicy();
    // The highlighter compiles the Oniguruma engine from a bundled WebAssembly module; without
    // 'wasm-unsafe-eval' the browser refuses it and every block stays plain, silently.
    expect(highlighter).toContain("import('shiki/engine/oniguruma')");
    expect(policy.get('script-src')).toEqual(["'self'", "'wasm-unsafe-eval'"]);
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('frame-ancestors')).toEqual(["'none'"]);
    expect(policy.get('connect-src')).toEqual(["'self'"]);
    // Mermaid embeds a <style> in each SVG; nothing wider than that for styles.
    expect(policy.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });
});
