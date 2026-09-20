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

  it('allows object-URL images for file thumbnails, and blob: nowhere else (ADR 0029)', async () => {
    const thumbnail = await readFile(
      path.join(webRoot, 'src/components/workspace/files/file-thumbnail.tsx'),
      'utf8',
    );
    const policy = await contentSecurityPolicy();
    // API bytes need the bearer token, so a thumbnail is fetched then shown through an object
    // URL; without `blob:` the browser refuses the image in production, silently.
    expect(thumbnail).toContain('URL.createObjectURL');
    expect(thumbnail).toContain('URL.revokeObjectURL');
    expect(policy.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https:']);
    // Documents are downloaded, never framed: no other directive may accept blob: content.
    const others = [...policy].filter(([name]) => name !== 'img-src');
    expect(others.filter(([, sources]) => sources.includes('blob:'))).toEqual([]);
    expect(policy.has('frame-src')).toBe(false);
  });

  it('lets through any file size the API may be configured for, and nothing larger elsewhere', async () => {
    const { FILE_MAX_BYTES_CEILING } = await import('@alfred/contracts');
    const conf = await readFile(path.join(webRoot, 'nginx.conf'), 'utf8');
    const upload = /location = \/api\/files \{([^}]+)\}/u.exec(conf)?.[1];
    expect(upload).toBeDefined();

    // nginx refuses a body above 1 MiB unless told otherwise, with its own HTML page. The proxy
    // covers the API's highest configurable limit, so a limit the API accepts is never
    // unreachable, and stays close to it: the API, not the proxy, decides what is too large.
    const limit = Number(/client_max_body_size (\d+)m;/u.exec(upload!)?.[1]) * 1024 * 1024;
    expect(limit).toBeGreaterThan(FILE_MAX_BYTES_CEILING);
    expect(limit).toBeLessThanOrEqual(FILE_MAX_BYTES_CEILING + 2 * 1024 * 1024);
    // The API bounds the body while it streams; nginx must not spool it to disk first.
    expect(upload).toContain('proxy_request_buffering off;');
    expect(upload).toContain('proxy_pass http://api:3000;');

    const general = conf.replace(upload!, '');
    expect(general).not.toContain('client_max_body_size');
  });
});
