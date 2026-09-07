import assert from 'node:assert/strict';
import { appendFileSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

export function summarizeImageReport(report) {
  assert.equal(report.SchemaVersion, 2, 'Unsupported Trivy report schema.');
  assert.equal(report.ArtifactType, 'container_image', 'Expected an image report.');
  assert(Array.isArray(report.Results) && report.Results.length > 0, 'Missing scan results.');
  return report.Results.flatMap((result) => {
    assert(result && typeof result.Target === 'string', 'Invalid scan target.');
    const findings = result.Vulnerabilities === undefined ? [] : result.Vulnerabilities;
    assert(Array.isArray(findings), 'Invalid vulnerability list.');
    return findings;
  }).reduce(
    (counts, finding) => {
      assert(finding && ['HIGH', 'CRITICAL'].includes(finding.Severity), 'Unexpected severity.');
      assert(typeof finding.VulnerabilityID === 'string', 'Missing vulnerability identifier.');
      assert(
        finding.FixedVersion === undefined || typeof finding.FixedVersion === 'string',
        'Invalid fixed version.',
      );
      const category = finding.FixedVersion?.trim() ? 'fixable' : 'unfixed';
      return { ...counts, [category]: counts[category] + 1 };
    },
    { fixable: 0, unfixed: 0 },
  );
}

export function checkImageReports(paths, summaryPath) {
  assert(paths.length > 0, 'At least one image report is required.');
  let failed = false;
  const rows = paths.map((path) => {
    try {
      const counts = summarizeImageReport(JSON.parse(readFileSync(path, 'utf8')));
      failed ||= counts.fixable > 0;
      return `| ${basename(path)} | ${counts.fixable} | ${counts.unfixed} |`;
    } catch (error) {
      failed = true;
      console.error(`Invalid or missing image report ${path}: ${error.message}`);
      return `| ${basename(path)} | INVALID | INVALID |`;
    }
  });
  const summary = [
    '## Container vulnerability policy',
    '',
    'HIGH/CRITICAL findings with available fixes block CI. Unfixed findings remain accepted risk.',
    'Complete findings are retained in the image scan artifacts. Scanner/report errors block CI.',
    '',
    '| Report | Blocking: fix available | Reported: no fix available |',
    '| --- | ---: | ---: |',
    ...rows,
    '',
  ].join('\n');
  console.log(summary);
  if (summaryPath) appendFileSync(summaryPath, `${summary}\n`);
  return failed ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = checkImageReports(process.argv.slice(2), process.env.GITHUB_STEP_SUMMARY);
}
