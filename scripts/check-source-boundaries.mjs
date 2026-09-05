import { readdir, readFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const sourceRoots = ['apps/api/src', 'apps/web/src', 'packages/contracts/src'];
const sourceExtensions = /\.(?:[cm]?[jt]sx?|css)$/u;
const maxLines = 400;
const authRoot = 'apps/api/src/modules/auth/';

function isPackage(specifier, name) {
  return specifier === name || specifier.startsWith(`${name}/`);
}

function dependencyPath(file, specifier) {
  if (specifier.startsWith('.')) return posix.normalize(posix.join(posix.dirname(file), specifier));
  if (specifier.startsWith('@api/')) return posix.normalize(`apps/api/src/${specifier.slice(5)}`);
  if (specifier.startsWith('@/') && file.startsWith('apps/web/')) {
    return posix.normalize(`apps/web/src/${specifier.slice(2)}`);
  }
  for (const name of ['api', 'web', 'agent']) {
    if (isPackage(specifier, `@alfred/${name}`)) return `apps/${name}/`;
  }
  return specifier;
}

function applicationOf(path) {
  return /^apps\/([^/]+)\//u.exec(path)?.[1];
}

function typeOnly(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (clause?.isTypeOnly) return true;
    const bindings = clause?.namedBindings;
    return (
      clause?.name === undefined &&
      bindings !== undefined &&
      ts.isNamedImports(bindings) &&
      bindings.elements.length > 0 &&
      bindings.elements.every((element) => element.isTypeOnly)
    );
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    return (
      node.exportClause !== undefined &&
      ts.isNamedExports(node.exportClause) &&
      node.exportClause.elements.length > 0 &&
      node.exportClause.elements.every((element) => element.isTypeOnly)
    );
  }
  return ts.isImportEqualsDeclaration(node) && node.isTypeOnly;
}

function importedModule(node) {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return node.moduleSpecifier;
  if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
    return node.moduleReference.expression;
  }
  if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument))
    return node.argument.literal;
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
  )
    return node.arguments[0];
  return undefined;
}

function isDirectFetch(expression) {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isNonNullExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    return isDirectFetch(expression.expression);
  }
  if (ts.isIdentifier(expression)) return expression.text === 'fetch';
  if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression))
    return false;
  const object = expression.expression;
  if (!ts.isIdentifier(object) || !['globalThis', 'window', 'self'].includes(object.text))
    return false;
  return ts.isPropertyAccessExpression(expression)
    ? expression.name.text === 'fetch'
    : ts.isStringLiteralLike(expression.argumentExpression) &&
        expression.argumentExpression.text === 'fetch';
}

function dependencyViolations(file, specifier, onlyType) {
  const target = dependencyPath(file, specifier);
  const failures = [];
  if (
    file.startsWith('apps/web/src/services/') &&
    (isPackage(specifier, 'react') || isPackage(specifier, 'react-dom'))
  ) {
    failures.push(['web-service-react', 'Services must not depend on React; use a hook adapter.']);
  }
  const orm = isPackage(specifier, 'typeorm') || isPackage(specifier, '@nestjs/typeorm');
  const nestAdapter =
    specifier.startsWith('@nestjs/') &&
    !['@nestjs/common', '@nestjs/config'].some((name) => isPackage(specifier, name));
  if (
    file.startsWith(`${authRoot}application/`) &&
    (orm ||
      nestAdapter ||
      ['api', 'infrastructure'].some((layer) => target.startsWith(`${authRoot}${layer}/`)))
  ) {
    failures.push([
      'auth-application-boundary',
      'Auth application must depend on domain ports, not HTTP, ORM or infrastructure adapters.',
    ]);
  }
  if (
    file.startsWith(`${authRoot}domain/`) &&
    (orm ||
      specifier.startsWith('@nestjs/') ||
      ['api', 'application', 'infrastructure'].some((layer) =>
        target.startsWith(`${authRoot}${layer}/`),
      ))
  ) {
    failures.push([
      'auth-domain-boundary',
      'Auth domain must not depend on Nest, ORM or outer auth layers.',
    ]);
  }
  const targetApp = applicationOf(target);
  if (!onlyType && targetApp !== undefined && applicationOf(file) !== targetApp) {
    failures.push([
      'cross-app-runtime',
      'Applications communicate through contracts, not cross-app runtime imports.',
    ]);
  }
  return failures;
}

/** Inspect a workspace-relative path. Diagnostics are deterministic and do not execute source. */
export function inspectSource(filePath, source) {
  const file = posix.normalize(filePath.replaceAll('\\', '/'));
  const failures = [];
  const lines = source === '' ? 0 : source.split(/\r?\n/u).length - (source.endsWith('\n') ? 1 : 0);
  if (lines > maxLines) {
    failures.push({
      file,
      line: maxLines + 1,
      rule: 'source-size',
      message: `${lines} lines exceeds the ${maxLines}-line source limit; split responsibilities.`,
    });
  }
  if (file.endsWith('.css')) return failures;
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const report = (node, rule, message) =>
    failures.push({
      file,
      line: ast.getLineAndCharacterOfPosition(node.getStart(ast)).line + 1,
      rule,
      message,
    });
  const view = /^apps\/web\/src\/(?:screens|components)\//u.test(file);
  const visit = (node) => {
    const imported = importedModule(node);
    if (imported !== undefined && ts.isStringLiteralLike(imported)) {
      for (const [rule, message] of dependencyViolations(
        file,
        imported.text,
        typeOnly(node) || ts.isImportTypeNode(node),
      )) {
        report(node, rule, message);
      }
    }
    if (view && ts.isCallExpression(node) && isDirectFetch(node.expression)) {
      report(
        node,
        'web-view-fetch',
        'Screens and components must call services through hooks, not fetch directly.',
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return failures;
}

async function sourceFiles(root, directory) {
  const entries = await readdir(join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name === 'node_modules') continue;
    const path = `${directory}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`Source symlinks are not supported: ${path}`);
    if (entry.isDirectory()) files.push(...(await sourceFiles(root, path)));
    else if (entry.isFile() && sourceExtensions.test(path)) files.push(path);
  }
  return files;
}

/** Scan only the three maintained TypeScript source roots; missing roots fail closed. */
export async function checkSourceBoundaries(root) {
  const files = (
    await Promise.all(sourceRoots.map((directory) => sourceFiles(root, directory)))
  ).flat();
  const violations = (
    await Promise.all(
      files.map(async (file) => inspectSource(file, await readFile(join(root, file), 'utf8'))),
    )
  ).flat();
  return { filesChecked: files.length, violations };
}

async function main() {
  if (process.argv.length > 3)
    throw new Error('Usage: node scripts/check-source-boundaries.mjs [workspace-root]');
  const root = resolve(process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url)));
  const { filesChecked, violations } = await checkSourceBoundaries(root);
  for (const { file, line, rule, message } of violations)
    console.error(`${file}:${line} [${rule}] ${message}`);
  if (violations.length > 0) process.exitCode = 1;
  else console.log(`Source boundaries valid: ${filesChecked} files checked.`);
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
