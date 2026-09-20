import { z } from 'zod/mini';
import { recordApiDocsProblem } from './api-docs.registry';

/** An OpenAPI 3.0 schema object; kept structural so it can be walked and rewritten. */
export type OpenApiSchema = Record<string, unknown>;

/**
 * Field documentation keyed by path: `data.items[].name`, `files[].path`, `details{}` for the
 * values of a record. One path describes the field in every branch of a union that carries it.
 */
export type FieldDescriptions = Readonly<Record<string, string>>;

/** Paths every envelope shares; a route only describes its own payload. */
const SHARED_DESCRIPTIONS: FieldDescriptions = {
  success: '`true` on every successful answer; `false` only in the error envelope.',
  data: 'The payload of this route.',
  'data.items': 'One page of results, in the documented order.',
  'data.nextCursor':
    'Opaque cursor of the next page, to send back unchanged as `cursor`; `null` on the last page.',
};

const BRANCH_KEYS = ['anyOf', 'oneOf', 'allOf'] as const;

function isSchema(value: unknown): value is OpenApiSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The node itself plus every union branch it holds, since a property may live in any of them. */
function branches(node: OpenApiSchema): OpenApiSchema[] {
  const found = [node];
  for (const key of BRANCH_KEYS) {
    const list = node[key];
    if (Array.isArray(list))
      for (const item of list) if (isSchema(item)) found.push(...branches(item));
  }
  return found;
}

/** Generated patterns repeat what `format` already says and drown the reader; bounds of 2^53 too. */
function tidy(node: unknown): void {
  if (Array.isArray(node)) return node.forEach(tidy);
  if (!isSchema(node)) return;
  delete node.$schema;
  delete node.readOnly;
  if (typeof node.format === 'string') delete node.pattern;
  if (node.maximum === Number.MAX_SAFE_INTEGER) delete node.maximum;
  if (node.minimum === Number.MIN_SAFE_INTEGER) delete node.minimum;
  Object.values(node).forEach(tidy);
}

function children(node: OpenApiSchema, segment: string): OpenApiSchema[] {
  const list = segment.endsWith('[]');
  const record = segment.endsWith('{}');
  const name = list || record ? segment.slice(0, -2) : segment;
  const found: OpenApiSchema[] = [];
  for (const branch of branches(node)) {
    const properties = branch.properties;
    const property = isSchema(properties) ? properties[name] : undefined;
    if (!isSchema(property)) continue;
    if (!list && !record) found.push(property);
    for (const inner of branches(property)) {
      const next = list ? inner.items : record ? inner.additionalProperties : undefined;
      if (isSchema(next)) found.push(next);
    }
  }
  return found;
}

/** `files` describes the list, `files[]` one element of it, `files[].path` a field of an element. */
function describe(root: OpenApiSchema, path: string, text: string): boolean {
  let nodes = [root];
  for (const segment of path.split('.')) nodes = nodes.flatMap((node) => children(node, segment));
  for (const node of nodes) node.description = text;
  return nodes.length > 0;
}

/** Every property path of a schema that still lacks a description. */
export function undescribedPaths(schema: OpenApiSchema, prefix = ''): string[] {
  const missing: string[] = [];
  for (const branch of branches(schema)) {
    if (!isSchema(branch.properties)) continue;
    for (const [name, property] of Object.entries(branch.properties)) {
      if (!isSchema(property)) continue;
      const path = prefix === '' ? name : `${prefix}.${name}`;
      if (typeof property.description !== 'string' || property.description.trim() === '')
        missing.push(path);
      missing.push(...undescribedPaths(property, path));
      for (const inner of branches(property)) {
        if (isSchema(inner.items)) missing.push(...undescribedPaths(inner.items, `${path}[]`));
        if (isSchema(inner.additionalProperties))
          missing.push(...undescribedPaths(inner.additionalProperties, `${path}{}`));
      }
    }
  }
  return [...new Set(missing)];
}

/**
 * The OpenAPI schema of a wire contract. Contracts are the single source of types and bounds, so
 * the documentation cannot drift from what the API validates and the browser parses. A mistake in
 * the documentation is recorded for the contract test and never thrown: it must not stop a boot.
 */
export function contractSchema(
  name: string,
  contract: z.core.$ZodType,
  options: { readonly io?: 'input' | 'output'; readonly describe?: FieldDescriptions } = {},
): OpenApiSchema {
  let schema: OpenApiSchema;
  try {
    schema = z.toJSONSchema(contract, {
      target: 'openapi-3.0',
      io: options.io ?? 'output',
      unrepresentable: 'any',
    });
  } catch (error) {
    recordApiDocsProblem(`${name}: contract cannot be converted (${String(error)})`);
    return {};
  }
  tidy(schema);
  for (const [path, text] of Object.entries(SHARED_DESCRIPTIONS)) describe(schema, path, text);
  for (const [path, text] of Object.entries(options.describe ?? {}))
    if (!describe(schema, path, text))
      recordApiDocsProblem(`${name}: described path "${path}" does not exist in the contract`);
  for (const path of undescribedPaths(schema))
    recordApiDocsProblem(`${name}: field "${path}" has no description`);
  return schema;
}
