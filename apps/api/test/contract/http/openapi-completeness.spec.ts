import { readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import type { Type } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { beforeAll, describe, expect, it } from 'vitest';

import { apiDocsProblems } from '@api/common/api-docs/api-docs.registry';
import { API_DOCS_TAGS } from '@api/common/api-docs/api-docs.document';
import { undescribedPaths, type OpenApiSchema } from '@api/common/api-docs/contract-schema';
import { IS_PUBLIC_KEY } from '@api/common/decorators/public.decorator';
import { buildOpenApiDocument } from '@api/common/openapi';

/**
 * The documentation is part of the API contract: a route without its inputs, answers, errors and
 * examples fails here. Controllers are discovered from the source tree, so a new one cannot be
 * left out. Run one controller with `-t SkillsController`.
 */
const SOURCE = resolve(process.cwd(), 'src');
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
const JSON_MEDIA = 'application/json';

interface Operation {
  readonly operationId?: string;
  readonly summary?: string;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly security?: readonly unknown[];
  readonly parameters?: readonly Record<string, unknown>[];
  readonly requestBody?: { readonly content?: Record<string, Record<string, unknown>> };
  readonly responses?: Record<
    string,
    { readonly description?: string; readonly content?: Record<string, Record<string, unknown>> }
  >;
}

const controllerFiles = (readdirSync(SOURCE, { recursive: true }) as string[])
  .filter((file) => file.endsWith('.controller.ts'))
  .map((file) => join(SOURCE, file))
  .sort();

function hasExample(holder: Record<string, unknown>): boolean {
  const examples = holder.examples;
  return (
    holder.example !== undefined ||
    (typeof examples === 'object' && examples !== null && Object.keys(examples).length > 0)
  );
}

function resolved(document: OpenAPIObject, schema: unknown): OpenApiSchema | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined;
  const reference = (schema as { $ref?: unknown }).$ref;
  if (typeof reference !== 'string') return schema as OpenApiSchema;
  return document.components?.schemas?.[reference.split('/').at(-1) ?? ''] as OpenApiSchema;
}

function contentFailures(
  document: OpenAPIObject,
  where: string,
  content: Record<string, Record<string, unknown>>,
): string[] {
  const failures: string[] = [];
  for (const [media, body] of Object.entries(content)) {
    const schema = resolved(document, body.schema);
    if (schema === undefined || Object.keys(schema).length === 0) {
      failures.push(`${where} (${media}): no schema`);
      continue;
    }
    // An undecorated DTO class yields `{ type: 'object', properties: {} }`: a schema that says nothing.
    const properties = schema.properties;
    if (
      schema.type === 'object' &&
      (typeof properties !== 'object' ||
        properties === null ||
        Object.keys(properties).length === 0) &&
      !['anyOf', 'oneOf', 'allOf', 'additionalProperties'].some((key) => key in schema)
    )
      failures.push(`${where} (${media}): empty object schema (undocumented DTO?)`);
    if (!hasExample(body)) failures.push(`${where} (${media}): no example`);
    if (media === JSON_MEDIA || media === 'multipart/form-data')
      for (const path of undescribedPaths(schema))
        failures.push(`${where} (${media}): field "${path}" has no description`);
  }
  return failures;
}

function operationFailures(document: OpenAPIObject, operation: Operation, isPublic: boolean) {
  const failures: string[] = [];
  const summary = operation.summary?.trim() ?? '';
  if (summary === '' || summary.length > 100)
    failures.push('summary missing or over 100 characters');
  if ((operation.description?.trim().length ?? 0) < 40)
    failures.push('description missing or too short to be useful (40 characters minimum)');
  for (const tag of operation.tags ?? [])
    if (!(tag in API_DOCS_TAGS)) failures.push(`tag "${tag}" has no description in API_DOCS_TAGS`);
  if ((operation.tags ?? []).length === 0) failures.push('no tag');

  const secured = (operation.security ?? []).length > 0;
  if (secured === isPublic)
    failures.push(
      isPublic
        ? 'public route shown with a padlock: put @ApiBearerAuth on private methods only'
        : 'private route without @ApiBearerAuth',
    );

  for (const parameter of operation.parameters ?? []) {
    const name = `${String(parameter.in)} parameter "${String(parameter.name)}"`;
    if (typeof parameter.description !== 'string' || parameter.description.trim() === '')
      failures.push(`${name}: no description`);
    const schema = (parameter.schema ?? {}) as Record<string, unknown>;
    const machineExample = hasExample(parameter) || schema.example !== undefined;
    // Swagger UI pre-fills "Try it out" with a machine example: right for a required identifier,
    // a trap for an optional filter. Optional parameters give theirs in the description instead.
    if (parameter.required === true && !machineExample) failures.push(`${name}: no example`);
    if (parameter.required !== true && machineExample)
      failures.push(`${name}: optional, so its example belongs in the description ("Example: …")`);
    if (parameter.required !== true && !/\bexample\b/iu.test(String(parameter.description)))
      failures.push(`${name}: optional parameter without an "Example: …" in its description`);
  }

  if (operation.requestBody !== undefined)
    failures.push(
      ...contentFailures(document, 'request body', operation.requestBody.content ?? {}),
    );

  const responses = Object.entries(operation.responses ?? {});
  if (!responses.some(([status]) => /^[23]\d\d$/u.test(status))) failures.push('no success answer');
  for (const [status, response] of responses) {
    if ((response.description ?? '').trim() === '')
      failures.push(`answer ${status}: no description`);
    failures.push(...contentFailures(document, `answer ${status}`, response.content ?? {}));
    if (/^2\d\d$/u.test(status) && status !== '204' && response.content === undefined)
      failures.push(`answer ${status}: no content documented`);
  }
  const statuses = new Set(responses.map(([status]) => status));
  if (!isPublic && !statuses.has('401')) failures.push('private route without a documented 401');
  const takesInput =
    operation.requestBody !== undefined ||
    (operation.parameters ?? []).some((parameter) => parameter.in === 'query');
  if (takesInput && !statuses.has('400')) failures.push('takes input but documents no 400');
  return failures;
}

describe('OpenAPI documentation completeness', () => {
  const controllers = new Map<string, Type>();
  /** A file can hold several controllers; a controller's routes are reported under its file. */
  const fileOf = new Map<string, string>();
  let document: OpenAPIObject;

  beforeAll(async () => {
    for (const file of controllerFiles) {
      const exported = (await import(/* @vite-ignore */ file)) as Record<string, unknown>;
      for (const value of Object.values(exported))
        if (typeof value === 'function' && Reflect.hasMetadata('path', value)) {
          controllers.set(value.name, value as Type);
          fileOf.set(value.name, relative(SOURCE, file));
        }
    }
    const module = await Test.createTestingModule({ controllers: [...controllers.values()] })
      .useMocker(() => ({}))
      .compile();
    const app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    document = buildOpenApiDocument(app);
  });

  it('finds every controller of the source tree', () => {
    expect(controllerFiles.length).toBeGreaterThan(10);
    expect(controllers.size).toBeGreaterThanOrEqual(controllerFiles.length);
  });

  it('holds no example refused by its contract and no undescribed contract field', () => {
    expect(apiDocsProblems()).toEqual([]);
  });

  it.each(controllerFiles.map((file) => [relative(SOURCE, file)]))(
    'documents every route of %s',
    (file) => {
      const failures: string[] = [];
      let operations = 0;
      for (const [path, item] of Object.entries(document.paths)) {
        for (const method of METHODS) {
          const operation = (item as Record<string, Operation | undefined>)[method];
          const [owner, handler] = operation?.operationId?.split('_') ?? [];
          const controller = owner === undefined ? undefined : controllers.get(owner);
          if (operation === undefined || controller === undefined || handler === undefined)
            continue;
          if (fileOf.get(controller.name) !== file) continue;
          operations += 1;
          const target = (controller.prototype as Record<string, object | undefined>)[handler];
          const isPublic =
            (target !== undefined && Reflect.getMetadata(IS_PUBLIC_KEY, target) === true) ||
            Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
          for (const failure of operationFailures(document, operation, isPublic))
            failures.push(`${method.toUpperCase()} ${path} — ${failure}`);
        }
      }
      expect(operations, `no operation matched ${file}`).toBeGreaterThan(0);
      expect(failures).toEqual([]);
    },
  );
});
