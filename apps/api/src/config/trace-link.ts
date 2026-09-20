import { EXECUTION_TRACE_LINK_MAX_LENGTH } from '@alfred/contracts';
import type { z } from 'zod';

/** `api_executions.runtime_run_id` is a `varchar(128)`: no stored run identifier is longer. */
export const RUNTIME_RUN_ID_MAX_LENGTH = 128;
/**
 * The widest run identifier the column can hold once percent-encoded: a three-byte character
 * becomes nine characters, the most any UTF-16 unit can expand to.
 */
const WIDEST_RUN_ID = '€'.repeat(RUNTIME_RUN_ID_MAX_LENGTH);

export interface TraceLinkTarget {
  readonly uiUrl: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly runId: string;
}

/**
 * The address of a run in the LangSmith console, as the LangSmith SDKs build it: the runtime run
 * identifier is the root trace identifier. Every segment is encoded; nothing else is interpolated.
 */
export function buildTraceUrl(target: TraceLinkTarget): string {
  const base = new URL(target.uiUrl);
  if (base.username !== '' || base.password !== '') {
    throw new Error('The trace console address must not carry credentials.');
  }
  const path = [
    'o',
    target.organizationId,
    'projects',
    'p',
    target.projectId,
    'r',
    target.runId,
  ].map(encodeURIComponent);
  base.pathname = `${base.pathname.replace(/\/+$/u, '')}/${path.join('/')}`;
  base.search = '?poll=true';
  base.hash = '';
  return base.toString();
}

/**
 * Whether the console address and identifiers leave a link within the contract limit for every
 * run identifier the store can hold. Checked at startup so that no execution can later yield a
 * link the browser contract refuses.
 */
export function traceLinkFitsEveryRun(target: Omit<TraceLinkTarget, 'runId'>): boolean {
  return (
    buildTraceUrl({ ...target, runId: WIDEST_RUN_ID }).length <= EXECUTION_TRACE_LINK_MAX_LENGTH
  );
}

export interface TraceLinkEnvironment {
  readonly NODE_ENV: 'development' | 'test' | 'production';
  readonly FEATURE_TRACE_LINKS_ENABLED: boolean;
  readonly TRACE_LINK_UI_URL?: string | undefined;
  readonly TRACE_LINK_ORGANIZATION_ID?: string | undefined;
  readonly TRACE_LINK_PROJECT_ID?: string | undefined;
}

const isPlainWebAddress = (value: string): boolean => {
  try {
    const url = new URL(value);
    return (
      (url.protocol === 'https:' || url.protocol === 'http:') &&
      url.username === '' &&
      url.password === '' &&
      url.search === '' &&
      url.hash === ''
    );
  } catch {
    return false;
  }
};

/**
 * The trace-link settings at startup: required together when the capability is on, refused in
 * production, a plain `http(s)` address, and short enough to link every run the store can hold.
 */
export function validateTraceLinkEnvironment(
  environment: TraceLinkEnvironment,
  context: z.RefinementCtx,
): void {
  if (environment.FEATURE_TRACE_LINKS_ENABLED) {
    // A development diagnostic: it links people to a third-party console and stays off in production.
    if (environment.NODE_ENV === 'production') {
      context.addIssue({
        code: 'custom',
        message:
          'FEATURE_TRACE_LINKS_ENABLED is a development diagnostic and must be false in production',
        path: ['FEATURE_TRACE_LINKS_ENABLED'],
      });
    }
    for (const key of [
      'TRACE_LINK_UI_URL',
      'TRACE_LINK_ORGANIZATION_ID',
      'TRACE_LINK_PROJECT_ID',
    ] as const) {
      if (environment[key] === undefined) {
        context.addIssue({
          code: 'custom',
          message: `${key} is required when FEATURE_TRACE_LINKS_ENABLED is true`,
          path: [key],
        });
      }
    }
  }

  if (
    environment.TRACE_LINK_UI_URL !== undefined &&
    !isPlainWebAddress(environment.TRACE_LINK_UI_URL)
  ) {
    context.addIssue({
      code: 'custom',
      message:
        'TRACE_LINK_UI_URL must be an http(s) address without credentials, query or fragment',
      path: ['TRACE_LINK_UI_URL'],
    });
  } else if (
    environment.TRACE_LINK_UI_URL !== undefined &&
    environment.TRACE_LINK_ORGANIZATION_ID !== undefined &&
    environment.TRACE_LINK_PROJECT_ID !== undefined &&
    !traceLinkFitsEveryRun({
      uiUrl: environment.TRACE_LINK_UI_URL,
      organizationId: environment.TRACE_LINK_ORGANIZATION_ID,
      projectId: environment.TRACE_LINK_PROJECT_ID,
    })
  ) {
    // The browser contract caps a link; every stored run identifier (128 characters, encoded) must fit.
    context.addIssue({
      code: 'custom',
      message: `TRACE_LINK_UI_URL, TRACE_LINK_ORGANIZATION_ID and TRACE_LINK_PROJECT_ID must leave a trace link within ${EXECUTION_TRACE_LINK_MAX_LENGTH} characters for any run identifier`,
      path: ['TRACE_LINK_UI_URL'],
    });
  }
}
