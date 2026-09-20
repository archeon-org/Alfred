import type { z } from 'zod/mini';

/**
 * Documentation mistakes found while decorators evaluate: an example its contract refuses, a
 * described field that does not exist, a field without description. They are collected rather
 * than thrown, so a wrong comment can never stop the API; the OpenAPI contract test fails on them.
 */
const problems: string[] = [];

export function recordApiDocsProblem(problem: string): void {
  problems.push(problem);
}

export function apiDocsProblems(): readonly string[] {
  return [...problems];
}

/** An example is only worth showing if the contract accepts it. */
export function checkApiDocsExample(name: string, contract: z.core.$ZodType, value: unknown): void {
  const result = (contract as z.ZodMiniType).safeParse(value);
  if (result.success) return;
  const issues = result.error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  recordApiDocsProblem(`${name}: example refused by its contract (${issues})`);
}
