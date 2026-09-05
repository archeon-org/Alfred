import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve(import.meta.dirname, '../../src');
const uiRoot = path.join(sourceRoot, 'components/ui');

async function findTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory()
        ? findTsxFiles(filename)
        : entry.name.endsWith('.tsx')
          ? [filename]
          : [];
    }),
  );
  return files.flat().sort();
}

async function inspectSources(
  inspect: (node: ts.Node, source: ts.SourceFile) => string | undefined,
) {
  const files = await findTsxFiles(sourceRoot);
  const violations = await Promise.all(
    files.map(async (file) => {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const found: string[] = [];
      function visit(node: ts.Node) {
        const violation = inspect(node, source);
        if (violation)
          found.push(
            `${path.relative(sourceRoot, file)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}: ${violation}`,
          );
        ts.forEachChild(node, visit);
      }
      visit(source);
      return found;
    }),
  );
  return violations.flat();
}

function cssVariables(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing semantic theme scope: ${selector}`);
  const body = css.slice(start + selector.length + 2, css.indexOf('}', start));
  const entries = [...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/gu)].map(
    (match): [string, string] => {
      const name = match[1];
      const value = match[2];
      if (!name || !value) throw new Error(`Malformed semantic token in ${selector}`);
      return [name, value.trim()];
    },
  );
  return Object.fromEntries(entries);
}

function tokenRgb(
  tokens: Readonly<Record<string, string>>,
  name: string,
  visited: readonly string[] = [],
): readonly number[] {
  if (visited.includes(name)) throw new Error(`Circular color token: ${name}`);
  const value = tokens[name];
  if (!value) throw new Error(`Missing color token: ${name}`);
  const reference = /^var\((--[\w-]+)\)$/u.exec(value)?.[1];
  if (reference) return tokenRgb(tokens, reference, [...visited, name]);
  if (!/^#[\da-f]{6}$/iu.test(value))
    throw new Error(`Expected an opaque six-digit hex color for ${name}, received ${value}`);
  return [1, 3, 5].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16) / 255);
}

function contrastRatio(first: readonly number[], second: readonly number[]) {
  function luminance(rgb: readonly number[]) {
    return rgb.reduce((sum, value, index) => {
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * ([0.2126, 0.7152, 0.0722][index] ?? 0);
    }, 0);
  }
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe('semantic UI conventions', () => {
  it('keeps literal colors and legacy palette utilities out of React components', async () => {
    const violations = await inspectSources((node) => {
      if (!ts.isStringLiteralLike(node)) return;
      const rawColor = /#[\da-f]{3,8}\b|\b(?:rgb|hsl)a?\(/iu.exec(node.text)?.[0];
      const legacyUtility =
        /\b(?:text|bg|border|ring|outline|fill|stroke|divide|placeholder|from|via|to|accent|decoration|caret)-(?:brand|ws|panel|ink|line|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)(?:-[\w-]+)?\b/u.exec(
          node.text,
        )?.[0];
      return rawColor ?? legacyUtility;
    });
    expect(violations).toEqual([]);
  });

  it('centralizes interactive native controls in the shared UI primitives', async () => {
    const violations = await inspectSources((node, source) => {
      if (source.fileName.startsWith(`${uiRoot}${path.sep}`)) return;
      if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) return;
      const tag = node.tagName.getText(source);
      return ['button', 'input', 'textarea', 'select'].includes(tag) ? `<${tag}>` : undefined;
    });
    expect(violations).toEqual([]);
  });

  it('gives exported shared component roots explicit data-slot identifiers', async () => {
    const files = await findTsxFiles(uiRoot);
    const violations: string[] = [];
    let inspectedRoots = 0;
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        await readFile(file, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      const exports = new Set<string>();
      for (const statement of source.statements) {
        if (
          ts.isExportDeclaration(statement) &&
          statement.exportClause &&
          ts.isNamedExports(statement.exportClause)
        ) {
          statement.exportClause.elements.forEach((element) =>
            exports.add((element.propertyName ?? element.name).text),
          );
        }
        if (
          ts.isFunctionDeclaration(statement) &&
          statement.name &&
          statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
        )
          exports.add(statement.name.text);
      }
      for (const statement of source.statements) {
        if (
          !ts.isFunctionDeclaration(statement) ||
          !statement.name ||
          !exports.has(statement.name.text) ||
          !statement.body
        )
          continue;
        const componentName = statement.name.text;
        for (const child of statement.body.statements) {
          if (!ts.isReturnStatement(child) || !child.expression) continue;
          let root = child.expression;
          while (ts.isParenthesizedExpression(root)) root = root.expression;
          const opening = ts.isJsxElement(root)
            ? root.openingElement
            : ts.isJsxSelfClosingElement(root)
              ? root
              : undefined;
          if (!opening) continue;
          inspectedRoots += 1;
          const slot = opening.attributes.properties.find(
            (attribute) =>
              ts.isJsxAttribute(attribute) && attribute.name.getText(source) === 'data-slot',
          );
          if (
            !slot ||
            !ts.isJsxAttribute(slot) ||
            !slot.initializer ||
            !ts.isStringLiteral(slot.initializer) ||
            !slot.initializer.text.trim()
          )
            violations.push(`${path.basename(file)}: ${componentName}`);
        }
      }
    }
    expect(inspectedRoots).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it('keeps semantic text pairs at WCAG AA contrast in the page and sidebar themes', async () => {
    const css = await readFile(path.join(sourceRoot, 'styles.css'), 'utf8');
    const root = cssVariables(css, ':root');
    const sidebar = { ...root, ...cssVariables(css, '.theme-sidebar') };
    const pairs = [
      ['--foreground', '--background'],
      ['--muted-foreground', '--background'],
      ['--card-foreground', '--card'],
      ['--primary-foreground', '--primary'],
      ['--accent-foreground', '--accent'],
      ['--warning-foreground', '--warning'],
      ['--info-foreground', '--info'],
    ] as const;
    for (const [scope, tokens] of [
      ['page', root],
      ['sidebar', sidebar],
    ] as const) {
      for (const [foreground, background] of pairs) {
        expect(
          contrastRatio(tokenRgb(tokens, foreground), tokenRgb(tokens, background)),
          `${scope}: ${foreground} on ${background}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(
      contrastRatio(tokenRgb(root, '--sidebar-muted'), tokenRgb(root, '--sidebar')),
      'sidebar supporting text',
    ).toBeGreaterThanOrEqual(4.5);
  });
});
