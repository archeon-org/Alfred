import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { checkSourceBoundaries, inspectSource } from './check-source-boundaries.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const service = 'apps/web/src/services/session.ts';
const screen = 'apps/web/src/screens/home.tsx';
const application = 'apps/api/src/modules/auth/application/auth.service.ts';
const domain = 'apps/api/src/modules/auth/domain/ports/session.ts';

test('services cannot import or re-export React, including type-only and dynamic dependencies', () => {
  for (const source of [
    "import { useState } from 'react';",
    "import type { ReactNode } from 'react';",
    "export { createPortal } from 'react-dom';",
    "const react = require('react');",
    "const react = import('react/jsx-runtime');",
    "import React = require('react');",
    "type Node = import('react').ReactNode;",
  ]) {
    assert.equal(inspectSource(service, source)[0]?.rule, 'web-service-react');
  }
  assert.deepEqual(
    inspectSource(service, "const note = 'import React from react'; // fetch()"),
    [],
  );
});

test('screens and components leave HTTP calls to services', () => {
  for (const source of [
    "fetch('/api');",
    "globalThis.fetch('/api');",
    "window.fetch('/api');",
    "globalThis['fetch']('/api');",
    "(globalThis.fetch)('/api');",
  ]) {
    assert.equal(inspectSource(screen, source)[0]?.rule, 'web-view-fetch');
    assert.equal(
      inspectSource('apps/web/src/components/card.tsx', source)[0]?.rule,
      'web-view-fetch',
    );
  }
  assert.deepEqual(
    inspectSource(screen, "const text = 'fetch()'; // globalThis.fetch('/api')"),
    [],
  );
  assert.deepEqual(inspectSource(service, "fetch('/api');"), []);
});

test('auth application depends on ports, not ORM or infrastructure adapters', () => {
  for (const specifier of [
    '../infrastructure/session',
    '@api/modules/auth/infrastructure/session',
    'typeorm',
    '@nestjs/typeorm',
    '@nestjs/jwt',
    '../api/auth.controller',
  ]) {
    assert.equal(
      inspectSource(application, `import { dependency } from '${specifier}';`)[0]?.rule,
      'auth-application-boundary',
    );
  }
  assert.deepEqual(
    inspectSource(
      application,
      "import { Inject } from '@nestjs/common'; import type { Port } from '../domain/ports/session';",
    ),
    [],
  );
});

test('auth domain remains independent of Nest, ORM and outer auth layers', () => {
  for (const specifier of [
    '@nestjs/common',
    'typeorm',
    '../../application/auth.service',
    '@api/modules/auth/api/auth.controller',
    '../../infrastructure/session',
  ]) {
    assert.equal(
      inspectSource(domain, `import type { Dependency } from '${specifier}';`)[0]?.rule,
      'auth-domain-boundary',
    );
  }
  assert.deepEqual(
    inspectSource(domain, "import type { PublicUser } from '@alfred/contracts';"),
    [],
  );
});

test('runtime imports cannot cross applications or reverse the contracts dependency', () => {
  for (const source of [
    "import { auth } from '../../../api/src/auth';",
    "export { auth } from '@api/auth';",
    "const auth = import('@alfred/api');",
    "const auth = require('@alfred/api/auth');",
  ]) {
    assert.equal(inspectSource(service, source)[0]?.rule, 'cross-app-runtime');
  }
  assert.equal(
    inspectSource('packages/contracts/src/index.ts', "import { auth } from '@alfred/api';")[0]
      ?.rule,
    'cross-app-runtime',
  );
  assert.deepEqual(inspectSource(service, "import type { User } from '@api/auth';"), []);
  assert.deepEqual(inspectSource(service, "import { type User } from '@api/auth';"), []);
  assert.deepEqual(inspectSource(service, "export type { User } from '@api/auth';"), []);
  assert.deepEqual(inspectSource(service, "import { schema } from '@alfred/contracts';"), []);
});

test('source size is bounded with stable diagnostics and no phantom trailing line', () => {
  assert.deepEqual(inspectSource(service, '// line\n'.repeat(400)), []);
  const [violation] = inspectSource(service, '// line\n'.repeat(401));
  assert.equal(violation?.rule, 'source-size');
  assert.equal(violation?.file, service);
  assert.equal(violation?.line, 401);
  assert.match(violation?.message ?? '', /401.*400/u);
});

test('workspace scanning is bounded, and CLI reports failures with a nonzero exit', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'alfred-boundaries-'));
  try {
    for (const [path, source] of [
      [service, "import { useState } from 'react';"],
      ['apps/api/src/main.ts', 'export {};'],
      ['packages/contracts/src/index.ts', 'export {};'],
      ['node_modules/ignored.ts', '// line\n'.repeat(401)],
      ['apps/web/test/ignored.ts', '// line\n'.repeat(401)],
    ]) {
      await mkdir(dirname(join(fixture, path)), { recursive: true });
      await writeFile(join(fixture, path), source);
    }
    const result = await checkSourceBoundaries(fixture);
    assert.equal(result.filesChecked, 3);
    assert.equal(result.violations.length, 1);
    const cli = spawnSync(
      process.execPath,
      [join(root, 'scripts/check-source-boundaries.mjs'), fixture],
      { encoding: 'utf8' },
    );
    assert.equal(cli.status, 1);
    assert.match(cli.stderr, /services\/session.ts:1.*web-service-react/u);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test('current workspace respects the checked source boundaries', async () => {
  const result = await checkSourceBoundaries(root);
  assert.ok(result.filesChecked > 0);
  assert.deepEqual(result.violations, []);
});
