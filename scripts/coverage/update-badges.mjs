#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');
const badgesDir = path.join(repoRoot, '.github', 'badges');

const coverageSources = [
  {
    name: 'all',
    label: 'coverage all',
    lcovPath: path.join(repoRoot, 'apps', 'coverage', 'lcov.info'),
    badgePath: path.join(badgesDir, 'coverage-all.svg'),
  },
  {
    name: 'gate',
    label: 'coverage gate',
    lcovPath: path.join(repoRoot, 'apps', 'coverage', 'gate', 'lcov.info'),
    badgePath: path.join(badgesDir, 'coverage-gate.svg'),
  },
  {
    name: 'scribe',
    label: 'coverage scribe',
    lcovPath: path.join(repoRoot, 'apps', 'coverage', 'scribe.lcov'),
    badgePath: path.join(badgesDir, 'coverage-scribe.svg'),
  },
  {
    name: 'native',
    label: 'coverage native',
    lcovPath: path.join(repoRoot, 'apps', 'coverage', 'native', 'lcov.info'),
    badgePath: path.join(badgesDir, 'coverage-native.svg'),
  },
];

function xmlEscape(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function getBadgeColor(percentage) {
  if (percentage >= 90) return '#4c1';
  if (percentage >= 80) return '#97ca00';
  if (percentage >= 70) return '#dfb317';
  if (percentage >= 60) return '#fe7d37';
  return '#e05d44';
}

function parseLineCoverageFromLcov(content) {
  const lines = content.split(/\r?\n/);
  let total = 0;
  let covered = 0;

  for (const line of lines) {
    if (!line.startsWith('DA:')) {
      continue;
    }
    const values = line.slice(3).split(',');
    if (values.length < 2) {
      continue;
    }
    const hits = Number(values[1]);
    if (!Number.isFinite(hits)) {
      continue;
    }
    total += 1;
    if (hits > 0) {
      covered += 1;
    }
  }

  if (total === 0) {
    return { covered: 0, total: 0, percentage: 0 };
  }

  const percentage = (covered / total) * 100;
  return { covered, total, percentage };
}

function buildBadgeSvg(label, value, color) {
  const fontSize = 11;
  const charWidth = 6.6;
  const horizontalPadding = 8;
  const labelWidth = Math.max(
    52,
    Math.round(label.length * charWidth + horizontalPadding * 2),
  );
  const valueWidth = Math.max(
    48,
    Math.round(value.length * charWidth + horizontalPadding * 2),
  );
  const totalWidth = labelWidth + valueWidth;
  const labelTextX = Math.round(labelWidth / 2);
  const valueTextX = labelWidth + Math.round(valueWidth / 2);
  const textY = 14;

  const escapedLabel = xmlEscape(label);
  const escapedValue = xmlEscape(value);
  const escapedAria = xmlEscape(`${label}: ${value}`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="20" role="img" aria-label="${escapedAria}">
  <title>${escapedAria}</title>
  <rect width="${labelWidth}" height="20" fill="#555"/>
  <rect x="${labelWidth}" width="${valueWidth}" height="20" fill="${color}"/>
  <rect width="${totalWidth}" height="20" fill="url(#shine)"/>
  <defs>
    <linearGradient id="shine" x2="0" y2="100%">
      <stop offset="0" stop-color="#fff" stop-opacity=".1"/>
      <stop offset="1" stop-opacity=".1"/>
    </linearGradient>
  </defs>
  <g fill="#fff" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${fontSize}" text-anchor="middle">
    <text x="${labelTextX}" y="${textY}">${escapedLabel}</text>
    <text x="${valueTextX}" y="${textY}">${escapedValue}</text>
  </g>
</svg>
`;
}

function ensureFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing coverage file: ${filePath}`);
  }
}

function main() {
  fs.mkdirSync(badgesDir, { recursive: true });
  const summary = {};

  for (const source of coverageSources) {
    ensureFile(source.lcovPath);
    const lcov = fs.readFileSync(source.lcovPath, 'utf8');
    const result = parseLineCoverageFromLcov(lcov);
    const rounded = Number(result.percentage.toFixed(2));
    const display = `${rounded.toFixed(2)}%`;
    const color = getBadgeColor(rounded);
    const svg = buildBadgeSvg(source.label, display, color);

    fs.writeFileSync(source.badgePath, svg, 'utf8');
    summary[source.name] = {
      percentage: rounded,
      covered: result.covered,
      total: result.total,
      badgePath: path.relative(repoRoot, source.badgePath),
      lcovPath: path.relative(repoRoot, source.lcovPath),
    };
  }

  const summaryPath = path.join(badgesDir, 'coverage-summary.json');
  fs.writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(`[coverage:badges] Wrote badges to ${badgesDir}`);
}

main();
