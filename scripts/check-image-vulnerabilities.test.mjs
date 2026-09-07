import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { summarizeImageReport } from './check-image-vulnerabilities.mjs';

const finding = { VulnerabilityID: 'CVE-2099-1234', Severity: 'CRITICAL' };
const report = (vulnerabilities) => ({
  SchemaVersion: 2,
  ArtifactType: 'container_image',
  Results: [{ Target: 'test-image', Vulnerabilities: vulnerabilities }],
});

test('the same vulnerability becomes blocking when a fixed version appears', () => {
  assert.deepEqual(summarizeImageReport(report([finding])), { fixable: 0, unfixed: 1 });
  assert.deepEqual(summarizeImageReport(report([{ ...finding, FixedVersion: '2.0' }])), {
    fixable: 1,
    unfixed: 0,
  });
});

test('reports include unfixed HIGH and CRITICAL findings without accepting fixable findings', () => {
  assert.deepEqual(
    summarizeImageReport(
      report([
        finding,
        { ...finding, Severity: 'HIGH', FixedVersion: '' },
        { ...finding, FixedVersion: '1.2, 2.3' },
      ]),
    ),
    { fixable: 1, unfixed: 2 },
  );
  assert.deepEqual(summarizeImageReport(report(undefined)), { fixable: 0, unfixed: 0 });
});

test('malformed and unexpected scanner reports fail closed', () => {
  for (const invalid of [
    {},
    { ...report([]), SchemaVersion: 1 },
    { ...report([]), ArtifactType: 'filesystem' },
    { ...report([]), Results: [] },
    report(null),
    report({}),
    report([{}]),
    report([{ ...finding, FixedVersion: false }]),
    report([{ ...finding, Severity: 'LOW' }]),
  ]) {
    assert.throws(() => summarizeImageReport(invalid));
  }
});

test('CLI rejects missing/broken reports and still summarizes other images', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'alfred-image-policy-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const clean = join(directory, 'clean.json');
  const unfixed = join(directory, 'unfixed.json');
  const fixed = join(directory, 'fixed.json');
  const broken = join(directory, 'broken.json');
  const summary = join(directory, 'summary.md');
  writeFileSync(clean, JSON.stringify(report([])));
  writeFileSync(unfixed, JSON.stringify(report([finding])));
  writeFileSync(fixed, JSON.stringify(report([{ ...finding, FixedVersion: '2.0' }])));
  writeFileSync(broken, '{');
  const run = (...paths) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./check-image-vulnerabilities.mjs', import.meta.url)), ...paths],
      { env: { ...process.env, GITHUB_STEP_SUMMARY: summary }, encoding: 'utf8' },
    );
  assert.equal(run(clean, unfixed).status, 0);
  assert.equal(run(fixed, unfixed).status, 1);
  assert.equal(run(broken, join(directory, 'missing.json'), clean).status, 1);
  assert.equal(run().status, 1);
  const output = readFileSync(summary, 'utf8');
  assert.match(output, /unfixed.json \| 0 \| 1/);
  assert.match(output, /fixed.json \| 1 \| 0/);
  assert.match(output, /missing.json \| INVALID/);
  assert.match(output, /clean.json \| 0 \| 0/);
});
