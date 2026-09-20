import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import type { z } from 'zod/mini';
import { checkApiDocsExample, recordApiDocsProblem } from './api-docs.registry';
import { contractSchema, type FieldDescriptions } from './contract-schema';

type Contract = z.core.$ZodType;
const JSON_MEDIA = 'application/json';
/** Injected into `components.schemas` by `applyApiDocsComponents`; every error answer refers to it. */
export const API_ERROR_COMPONENT = 'ApiError';
const EXAMPLE_ID = '0b8f6c1e-5a3d-4f7b-9c2a-1e4d7a9b3c5f';

export interface ApiExample {
  /** One line shown in the example picker: the situation, not the payload. */
  readonly summary: string;
  readonly value: unknown;
}

/** What the route does and what a caller must know before using it. Both are mandatory. */
export function ApiRoute(summary: string, description: string): MethodDecorator {
  return ApiOperation({ summary, description });
}

/**
 * A JSON answer described by its wire contract. `example` is the complete body as sent; every
 * example is checked against the contract, and every field of the contract needs a description.
 */
export function ApiJsonResponse(options: {
  readonly name: string;
  readonly status: number;
  readonly description: string;
  readonly contract: Contract;
  readonly describe?: FieldDescriptions;
  readonly example: unknown;
  readonly examples?: Readonly<Record<string, ApiExample>>;
}): MethodDecorator {
  const named = {
    default: { summary: 'Typical answer', value: options.example },
    ...options.examples,
  };
  for (const [key, example] of Object.entries(named))
    checkApiDocsExample(`${options.name} (${key})`, options.contract, example.value);
  return ApiResponse({
    status: options.status,
    description: options.description,
    content: {
      [JSON_MEDIA]: {
        schema: contractSchema(options.name, options.contract, { describe: options.describe }),
        ...(options.examples === undefined ? { example: options.example } : { examples: named }),
      },
    },
  });
}

/** The usual success answer: `data` wrapped in `{ success: true, data }`. Pass payloads only. */
export function ApiEnvelopeResponse(options: {
  readonly name: string;
  readonly status?: number;
  readonly description: string;
  /** The envelope contract, e.g. `skillEnvelopeSchema`, not the payload contract. */
  readonly contract: Contract;
  readonly describe?: FieldDescriptions;
  readonly data: unknown;
  readonly more?: Readonly<Record<string, { readonly summary: string; readonly data: unknown }>>;
}): MethodDecorator {
  const wrap = (data: unknown) => ({ success: true, data });
  return ApiJsonResponse({
    name: options.name,
    status: options.status ?? 200,
    description: options.description,
    contract: options.contract,
    describe: options.describe,
    example: wrap(options.data),
    examples:
      options.more === undefined
        ? undefined
        : Object.fromEntries(
            Object.entries(options.more).map(([key, item]) => [
              key,
              { summary: item.summary, value: wrap(item.data) },
            ]),
          ),
  });
}

/** A JSON request body described by its input contract, with at least one named example. */
export function ApiJsonBody(options: {
  readonly name: string;
  readonly description: string;
  readonly contract: Contract;
  readonly describe?: FieldDescriptions;
  readonly examples: Readonly<Record<string, ApiExample>>;
}): MethodDecorator {
  if (Object.keys(options.examples).length === 0)
    recordApiDocsProblem(`${options.name}: a request body needs at least one example`);
  for (const [key, example] of Object.entries(options.examples))
    checkApiDocsExample(`${options.name} (${key})`, options.contract, example.value);
  return ApiBody({
    description: options.description,
    required: true,
    schema: contractSchema(options.name, options.contract, {
      io: 'input',
      describe: options.describe,
    }),
    examples: options.examples,
  });
}

/** A resource identifier in the path. A malformed one answers the resource's 404, never a 400. */
export function ApiIdParam(
  name: string,
  description: string,
  example = EXAMPLE_ID,
): MethodDecorator {
  // The example lives in the schema: `ApiParam` drops a sibling `example` when a schema is given.
  return ApiParam({ name, description, schema: { type: 'string', format: 'uuid', example } });
}

export interface ApiProblem {
  readonly status: number;
  /** The stable `error.code` a client branches on. */
  readonly code: string;
  readonly message: string | readonly string[];
  /** The situation that produces it, in one sentence. */
  readonly when: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

/** Error answers of a route, grouped by status, each with the exact body a client receives. */
export function ApiErrors(...problems: readonly ApiProblem[]): MethodDecorator {
  const statuses = [...new Set(problems.map((problem) => problem.status))].sort((a, b) => a - b);
  return applyDecorators(
    ...statuses.map((status) => {
      const group = problems.filter((problem) => problem.status === status);
      for (const problem of group) {
        const generic = /^HTTP_(\d{3})$/u.exec(problem.code);
        if (generic ? Number(generic[1]) !== status : !/^[a-z][a-z0-9_]*$/u.test(problem.code))
          recordApiDocsProblem(`error ${status} "${problem.code}": code does not fit its status`);
      }
      return ApiResponse({
        status,
        description: group.map((problem) => `- \`${problem.code}\` — ${problem.when}`).join('\n'),
        content: {
          [JSON_MEDIA]: {
            schema: { $ref: `#/components/schemas/${API_ERROR_COMPONENT}` },
            examples: Object.fromEntries(
              group.map((problem, index) => [
                group.findIndex((other) => other.code === problem.code) === index
                  ? problem.code
                  : `${problem.code}_${index}`,
                {
                  summary: problem.when,
                  value: {
                    success: false,
                    error: {
                      code: problem.code,
                      ...(problem.details === undefined ? {} : { details: problem.details }),
                      message: problem.message,
                    },
                  },
                },
              ]),
            ),
          },
        },
      });
    }),
  );
}
