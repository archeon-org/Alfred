#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import istanbulLibCoverage from 'istanbul-lib-coverage';
import istanbulLibReport from 'istanbul-lib-report';
import istanbulReports from 'istanbul-reports';

const { createCoverageMap } = istanbulLibCoverage;
const { createContext } = istanbulLibReport;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..', '..');

const sources = [
  {
    name: 'gate',
    lcovPath: path.join(repoRoot, 'apps/coverage/gate/lcov.info'),
    sourceRoot: path.join(repoRoot, 'apps/gate'),
    required: true,
  },
  {
    name: 'native',
    lcovPath: path.join(repoRoot, 'apps/coverage/native/lcov.info'),
    sourceRoot: path.join(repoRoot, 'apps/native'),
    required: false,
  },
  {
    name: 'scribe',
    lcovPath: path.join(repoRoot, 'apps/coverage/scribe.lcov'),
    sourceRoot: path.join(repoRoot, 'apps/scribe'),
    required: false,
  },
];

const outputLcovPath = path.join(repoRoot, 'apps/coverage/lcov.info');
const outputHtmlDir = path.join(repoRoot, 'apps/coverage/lcov-report');

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

function addCount(map, key, count) {
  map.set(key, (map.get(key) ?? 0) + count);
}

function resolveReportPath(sf, sourceRoot) {
  const absolute = path.isAbsolute(sf) ? sf : path.resolve(sourceRoot, sf);
  const relative = path.relative(repoRoot, absolute);
  if (!relative || relative.startsWith('..')) {
    return toPosix(path.normalize(sf));
  }
  return toPosix(relative);
}

function parseLcov(content, sourceRoot, merged) {
  const lines = content.split(/\r?\n/);
  let current = null;

  const finalizeRecord = () => {
    if (!current || !current.sf) {
      current = null;
      return;
    }

    const reportPath = resolveReportPath(current.sf, sourceRoot);
    const file = merged.get(reportPath) ?? {
      lines: new Map(),
      functions: new Map(),
      branches: new Map(),
    };

    for (const [line, count] of current.lines.entries()) {
      addCount(file.lines, line, count);
    }

    const functionNames = new Set([
      ...current.functionLines.keys(),
      ...current.functionHits.keys(),
    ]);

    for (const name of functionNames) {
      const line = current.functionLines.get(name) ?? 0;
      const hits = current.functionHits.get(name) ?? 0;
      const fnKey = `${name}@${line}`;
      const fn = file.functions.get(fnKey) ?? { name, line, hits: 0 };
      fn.hits += hits;
      file.functions.set(fnKey, fn);
    }

    for (const [branchKey, branchHits] of current.branches.entries()) {
      const [lineStr, blockStr] = branchKey.split(':');
      const line = Number(lineStr);
      const block = Number(blockStr);
      const existingBranch = file.branches.get(branchKey) ?? {
        line,
        block,
        hitsByBranch: new Map(),
      };
      for (const [branchId, hits] of branchHits.entries()) {
        addCount(existingBranch.hitsByBranch, branchId, hits);
      }
      file.branches.set(branchKey, existingBranch);
    }

    merged.set(reportPath, file);
    current = null;
  };

  for (const rawLine of lines) {
    if (!rawLine) {
      continue;
    }
    if (rawLine === 'end_of_record') {
      finalizeRecord();
      continue;
    }

    if (rawLine.startsWith('SF:')) {
      finalizeRecord();
      current = {
        sf: rawLine.slice(3),
        lines: new Map(),
        functionLines: new Map(),
        functionHits: new Map(),
        branches: new Map(),
      };
      continue;
    }

    if (!current) {
      continue;
    }

    if (rawLine.startsWith('DA:')) {
      const [lineStr, countStr] = rawLine.slice(3).split(',');
      const line = Number(lineStr);
      const count = Number(countStr);
      if (Number.isFinite(line) && Number.isFinite(count)) {
        addCount(current.lines, line, count);
      }
      continue;
    }

    if (rawLine.startsWith('FN:')) {
      const index = rawLine.indexOf(',');
      if (index > -1) {
        const line = Number(rawLine.slice(3, index));
        const name = rawLine.slice(index + 1);
        if (name && Number.isFinite(line)) {
          current.functionLines.set(name, line);
        }
      }
      continue;
    }

    if (rawLine.startsWith('FNDA:')) {
      const index = rawLine.indexOf(',');
      if (index > -1) {
        const count = Number(rawLine.slice(5, index));
        const name = rawLine.slice(index + 1);
        if (name && Number.isFinite(count)) {
          addCount(current.functionHits, name, count);
        }
      }
      continue;
    }

    if (rawLine.startsWith('BRDA:')) {
      const [lineStr, blockStr, branchStr, takenStr] = rawLine.slice(5).split(',');
      const line = Number(lineStr);
      const block = Number(blockStr);
      const branchId = Number(branchStr);
      const taken = takenStr === '-' ? 0 : Number(takenStr);
      if (
        Number.isFinite(line) &&
        Number.isFinite(block) &&
        Number.isFinite(branchId) &&
        Number.isFinite(taken)
      ) {
        const key = `${line}:${block}`;
        const branchMap = current.branches.get(key) ?? new Map();
        addCount(branchMap, branchId, taken);
        current.branches.set(key, branchMap);
      }
    }
  }

  finalizeRecord();
}

function writeMergedLcov(merged) {
  const chunks = [];
  const files = [...merged.keys()].sort((a, b) => a.localeCompare(b));

  for (const filePath of files) {
    const file = merged.get(filePath);
    const sortedLines = [...file.lines.entries()].sort((a, b) => a[0] - b[0]);
    const sortedFunctions = [...file.functions.values()].sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.name.localeCompare(b.name);
    });
    const sortedBranches = [...file.branches.values()].sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.block - b.block;
    });

    chunks.push('TN:');
    chunks.push(`SF:${filePath}`);

    for (const fn of sortedFunctions) {
      chunks.push(`FN:${fn.line},${fn.name}`);
    }
    chunks.push(`FNF:${sortedFunctions.length}`);
    chunks.push(
      `FNH:${sortedFunctions.filter((fn) => fn.hits > 0).length}`,
    );
    for (const fn of sortedFunctions) {
      chunks.push(`FNDA:${fn.hits},${fn.name}`);
    }

    for (const [line, count] of sortedLines) {
      chunks.push(`DA:${line},${count}`);
    }
    chunks.push(`LF:${sortedLines.length}`);
    chunks.push(`LH:${sortedLines.filter(([, count]) => count > 0).length}`);

    let branchTotal = 0;
    let branchHit = 0;
    for (const branchGroup of sortedBranches) {
      const sortedBranchHits = [...branchGroup.hitsByBranch.entries()].sort(
        (a, b) => a[0] - b[0],
      );
      for (const [branchId, hits] of sortedBranchHits) {
        chunks.push(
          `BRDA:${branchGroup.line},${branchGroup.block},${branchId},${hits}`,
        );
        branchTotal += 1;
        if (hits > 0) {
          branchHit += 1;
        }
      }
    }
    chunks.push(`BRF:${branchTotal}`);
    chunks.push(`BRH:${branchHit}`);
    chunks.push('end_of_record');
  }

  fs.mkdirSync(path.dirname(outputLcovPath), { recursive: true });
  fs.writeFileSync(outputLcovPath, `${chunks.join('\n')}\n`, 'utf8');
}

function buildIstanbulReport(merged) {
  const coverageMap = createCoverageMap({});
  const files = [...merged.keys()].sort((a, b) => a.localeCompare(b));

  for (const filePath of files) {
    const file = merged.get(filePath);
    const sortedLines = [...file.lines.entries()].sort((a, b) => a[0] - b[0]);
    if (sortedLines.length === 0) {
      continue;
    }

    const statementMap = {};
    const s = {};
    let statementId = 0;
    for (const [line, hits] of sortedLines) {
      statementMap[statementId] = {
        start: { line, column: 0 },
        end: { line, column: 1 },
      };
      s[statementId] = hits;
      statementId += 1;
    }

    const fnMap = {};
    const f = {};
    const sortedFunctions = [...file.functions.values()].sort((a, b) => {
      if (a.line !== b.line) return a.line - b.line;
      return a.name.localeCompare(b.name);
    });
    let functionId = 0;
    for (const fn of sortedFunctions) {
      fnMap[functionId] = {
        name: fn.name,
        decl: {
          start: { line: fn.line, column: 0 },
          end: { line: fn.line, column: 1 },
        },
        loc: {
          start: { line: fn.line, column: 0 },
          end: { line: fn.line, column: 1 },
        },
        line: fn.line,
      };
      f[functionId] = fn.hits;
      functionId += 1;
    }

    const branchMap = {};
    const b = {};
    const sortedBranches = [...file.branches.values()].sort((a, bVal) => {
      if (a.line !== bVal.line) return a.line - bVal.line;
      return a.block - bVal.block;
    });
    let branchId = 0;
    for (const branchGroup of sortedBranches) {
      const branchHits = [...branchGroup.hitsByBranch.entries()].sort(
        (a, bVal) => a[0] - bVal[0],
      );
      branchMap[branchId] = {
        line: branchGroup.line,
        type: 'branch',
        loc: {
          start: { line: branchGroup.line, column: 0 },
          end: { line: branchGroup.line, column: 1 },
        },
        locations: branchHits.map(() => ({
          start: { line: branchGroup.line, column: 0 },
          end: { line: branchGroup.line, column: 1 },
        })),
      };
      b[branchId] = branchHits.map(([, hits]) => hits);
      branchId += 1;
    }

    coverageMap.addFileCoverage({
      path: filePath,
      statementMap,
      fnMap,
      branchMap,
      s,
      f,
      b,
      _coverageSchema: '1a1c01bbd47fc00a2c39e90264f33305004495a9',
      hash: '',
    });
  }

  fs.rmSync(outputHtmlDir, { recursive: true, force: true });
  fs.mkdirSync(outputHtmlDir, { recursive: true });

  const context = createContext({
    dir: outputHtmlDir,
    coverageMap,
    defaultSummarizer: 'nested',
  });

  istanbulReports.create('html', { skipEmpty: false, skipFull: false }).execute(
    context,
  );
  istanbulReports.create('text-summary').execute(context);
}

function main() {
  const merged = new Map();
  const loadedSources = [];

  for (const source of sources) {
    if (!fs.existsSync(source.lcovPath)) {
      if (source.required) {
        throw new Error(
          `Missing required coverage file for ${source.name}: ${source.lcovPath}`,
        );
      }
      console.warn(
        `[coverage:merge] Skipping ${source.name} (file not found: ${source.lcovPath})`,
      );
      continue;
    }

    const content = fs.readFileSync(source.lcovPath, 'utf8');
    parseLcov(content, source.sourceRoot, merged);
    loadedSources.push(source.name);
  }

  if (loadedSources.length === 0) {
    throw new Error('No coverage files were found to merge.');
  }

  writeMergedLcov(merged);
  buildIstanbulReport(merged);

  console.log(
    `[coverage:merge] Merged sources: ${loadedSources.join(', ')} -> ${outputHtmlDir}/index.html`,
  );
}

main();
